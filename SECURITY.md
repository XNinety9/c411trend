# Security

C411 Trend runs unsandboxed inside `omarchy-shell`, like every Omarchy plugin.
To read your C411 statistics it needs your c411.org **session cookie**, which it
takes from your browser's cookie store. This page says exactly what it touches,
where that data goes, and which limits keep a misbehaving server or a corrupt
file from hurting the shell.

## What it never does

- No privilege escalation: nothing runs as root, no `sudo`/`pkexec`, no policy
  files, no services, no install scripts. It is QML, JavaScript and one Python
  script (`bin/c411trend-fetch`) running as your user.
- No network access except one HTTPS request to `https://c411.org/api/auth/me`
  per poll (every 30 minutes by default). No redirects are followed, no other
  host is contacted, no telemetry.
- The cookie is never written to disk by the plugin, never logged, never put
  on a command line (`ps` cannot see it), and never sent anywhere but
  c411.org.
- No writes outside its own state: `~/.local/state/c411trend/` (history, lock,
  last cookie store path) and its entry in `~/.config/omarchy/shell.json`
  through the shell's settings API. With the optional `File` mode it may
  tighten the permissions of `~/.config/c411trend/cookie` to `0600`.

## What it reads

| Data | How | Scope |
| --- | --- | --- |
| Chromium-family cookie store (Brave, Chrome, Chromium, Edge, Vivaldi, Opera, Thorium; native, Flatpak, Snap) | copied to a private temporary directory, opened read-only | SQL filter on `host_key IN ('c411.org', '.c411.org')`: no other site's cookie is decrypted or read into memory |
| The browser's "Safe Storage" password | `secret-tool lookup application <browser>` (Secret Service) | only when the c411.org cookie is `v11`-encrypted; used to derive the AES key, kept in memory for the run |
| Firefox-family cookie store (Firefox, Zen, LibreWolf, Floorp, Waterfox) | same copy, read-only | same host filter |
| `~/.config/c411trend/cookie` (`File` mode only) | opened with `O_NOFOLLOW`, at most 8 KiB | the header you pasted |
| `xdg-settings get default-web-browser` | to try your default browser first | name only |

The temporary copy of a cookie database goes to `$XDG_RUNTIME_DIR` (a
per-user tmpfs, checked to be owned by you and `0700`) when available,
otherwise to the system temp dir, always inside a fresh `0700` directory that is
removed as soon as the query returns, on errors, and on `SIGTERM`/`SIGHUP`.
Copies orphaned by a `SIGKILL` are swept at the next run.

`bin/c411trend-fetch --list` prints which stores it would try, without opening
them or contacting c411.org.

To keep the plugin away from your browser entirely, set **Browser** to `File`
and paste the `Cookie` header into `~/.config/c411trend/cookie`.

## What it stores

`~/.local/state/c411trend/history.jsonl` (directory `0700`, file `0600`): one
line per poll with a timestamp, uploaded/downloaded byte counts, ratio and
upload credit. No cookie, no username, no torrent data. Deleting the directory
resets the plugin.

The widget's own entry in `~/.config/omarchy/shell.json` holds your settings
and the last what-if question (`simQuery`, at most 64 characters), written
through the shell's settings API.

## Trust boundaries

| Source | Trusted? | Handling |
| --- | --- | --- |
| Your settings | yes | Browser name, profile, intervals, targets. Passed as separate argv entries, never through a shell. The profile name is only compared with directory names, never joined into a path. `--lang` accepts `en` or `fr` only. |
| Bar template (`barFormat`) | yes, but bounded | Single-pass substitution: a value containing `{…}` is never expanded again. Only the widget's own keys match (`{constructor}` or `{__proto__}` stay literal text). The resulting label is cut at 160 characters. |
| What-if field and `when` IPC | yes, but bounded | At most 64 characters, parsed by one anchored pattern without nested repetition, so input cannot trigger catastrophic backtracking. It is never evaluated or passed to a process. |
| Browser cookie stores | partly | Only c411.org rows are read. A decrypted value must pass the RFC 6265 grammar (`token=cookie-octets`) or it is dropped, so a value containing CR/LF, quotes or backslashes can never alter curl's configuration. Schema 24+ values are checked against the `sha256(host_key)` prefix Chromium stores, so a wrong key is detected, not guessed. |
| c411.org's response | **no** | Capped at 1 MiB while streaming and cut off 5 s after the request timeout; it must be a JSON object with `authenticated === true`. Byte counts must be finite, non-negative numbers below 10^21 or the sample is rejected. The username is stripped of control characters and cut to 64 characters. |
| `history.jsonl` | **no** (it can be hand-edited) | Lines that are not objects with finite, non-negative numbers are skipped. Files over 16 MiB are read from the tail. |

All text the widget shows, the bar label included, uses `Text.PlainText`: a
username or error message cannot inject markup. Messages come from fixed
English and French catalogues, filled with values, never built from them.

## How the request is made

```
curl -q -sS --fail-with-body --compressed --proto =https --max-redirs 0 \
     --max-filesize 1048576 -m 15 -A "C411Trend (+omarchy plugin)" \
     -H "Accept: application/json" -K - https://c411.org/api/auth/me
```

- `-q` comes first so `~/.curlrc` is ignored: a `trace` or `verbose` line there
  would otherwise print the cookie.
- The cookie arrives on stdin as a curl config line (`-K -`).
- Only the last line of curl's stderr is ever shown, stripped of control
  characters and cut to 200 characters.

## Limits

| What | Limit |
| --- | --- |
| Response body | 1 MiB, read while streaming; curl is killed past it or 5 s after the request timeout |
| One request | 15 s (`--timeout`) |
| One whole run (keyring, every store, request) | 90 s (`--deadline`) |
| Shell-side watchdog | 120 s, then the process is stopped |
| Stale sessions tried in `Auto` mode | 3 API calls per run |
| Cookie header | 8 KiB |
| Bar label | 160 characters |
| What-if question | 64 characters |
| History file | compacted past 2 MiB: every sample of the last 90 days, manual samples, one per 6 h before that; rewritten atomically under an `flock` |

## Verifying

- `npm test`: model tests (node) and script tests (Python) run against
  synthetic browser profiles with stub `curl`, `secret-tool` and
  `xdg-settings`. They cover newline injection, `~/.curlrc` isolation, oversize
  and slow responses, invalid numbers, expired cookies, cleanup of temporary
  copies, file permissions, history compaction, bar-template and what-if
  bounds, and that both message catalogues carry the same placeholders.
- `MARKETPLACE_DIR=<checkout> npm run baseline`: runs the Omarchy plugin
  marketplace's Automated Security Baseline on the working tree. It must report
  `passed` with no findings and no capabilities. CI runs it against a pinned
  marketplace commit.

## Screenshot tooling

`docs/demo/` is for maintainers and is never run by the plugin. To take
screenshots without real data, `photo-session.sh` temporarily swaps your
history and `bin/c411trend-fetch` for a made-up history and a stub that never
contacts c411.org. It restores both, and `shell.json`, byte for byte on exit,
error or Ctrl-C, and checks the result. Only a `SIGKILL` can stop that; the
script prints where the originals are kept before it changes anything.

## Reporting

Open an issue, or for anything sensitive contact the author through GitHub
(XNinety9) before publishing details.
