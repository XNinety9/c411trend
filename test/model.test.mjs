import { test } from "node:test";
import assert from "node:assert/strict";
import { Model, steady, TiB, GiB } from "./load-model.mjs";

const DAY = 86400;

test("formatBytes matches the site's scale, in US English", () => {
  assert.equal(Model.formatBytes(0), "0 B");
  assert.equal(Model.formatBytes(1536), "1.5 KB");
  assert.equal(Model.formatBytes(12.3456 * TiB), "12.346 TB");
  assert.equal(Model.formatBytes(1010 * GiB), "0.986 TB");
  assert.equal(Model.formatBytes(null), "—");
});

test("parseHistory skips junk and sorts", () => {
  const text = '{"t":2,"up":5,"down":1}\nnot json\n{"t":1,"up":4,"down":2,"ratio":2}\n\n{"t":3}\n';
  const s = Model.parseHistory(text);
  assert.deepEqual(s.map(x => x.t), [1, 2]);
  assert.equal(s[1].ratio, 5);
});

test("rates recover a steady pace", () => {
  const s = steady();
  const now = s.at(-1).t;
  const r = Model.rates(s, now, 7);
  assert.ok(Math.abs(r.up - 50 * GiB) < 1);
  assert.ok(Math.abs(r.down - 10 * GiB) < 1);
  assert.equal(r.partial, false);
});

test("rates need at least an hour of data", () => {
  const s = steady({ days: 0.02, stepH: 0.25 });
  assert.equal(Model.rates(s, s.at(-1).t, 7), null);
});

test("timeToReach for upload and ratio", () => {
  const s = steady();
  const last = s.at(-1);
  const r = Model.rates(s, last.t, 7);
  const t = Model.timeToReach(last, r, "up", last.up + 100 * GiB);
  assert.ok(Math.abs((t - last.t) / DAY - 2) < 1e-6);
  // Ratio 5 at 50/10 per day from (10.68T, 4.14T): check by projecting back.
  const tr = Model.timeToReach(last, r, "ratio", 3);
  const p = Model.projectAt(last, r, tr);
  assert.ok(Math.abs(p.ratio - 3) < 1e-9);
  // Unreachable: asymptotic ratio is 5, so 6 never happens.
  assert.equal(Model.timeToReach(last, r, "ratio", 6), null);
  // Already there.
  assert.equal(Model.timeToReach(last, r, "up", 1), last.t);
});

test("milestones are round figures above the current value", () => {
  assert.deepEqual(Model.uploadMilestones(12.3 * TiB, 3).map(v => v / TiB), [13, 14, 15]);
  assert.deepEqual(Model.uploadMilestones(850 * GiB, 3).map(v => v / GiB), [900, 950, 1000]);
  assert.deepEqual(Model.ratioMilestones(2.41, 2), [2.5, 3]);
  assert.deepEqual(Model.ratioMilestones(1.1, 2), [1.25, 1.5]);
});

test("forecast includes custom targets", () => {
  const s = steady();
  const f = Model.forecast(s, s.at(-1).t, { windowDays: 7, uploadTarget: 20 * TiB, ratioTarget: 4 });
  assert.equal(f.upload.length, 4);
  assert.equal(f.upload[3].custom, true);
  assert.ok(f.upload[3].when > s.at(-1).t);
  assert.equal(f.ratio.at(-1).value, 4);
  assert.equal(f.horizons.length, 3);
});

test("chartModel places points in 0..1 with a projection tail", () => {
  const s = steady({ days: 60 });
  const now = s.at(-1).t;
  const r = Model.rates(s, now, 14);
  for (const metric of Model.METRICS) {
    const c = Model.chartModel(s, metric, 30, now, r, 100);
    assert.ok(c.history.length <= 100);
    assert.equal(c.history.at(-1).t, now);
    for (const p of c.history.concat(c.projection)) {
      assert.ok(p.x >= -1e-9 && p.x <= 1 + 1e-9, `${metric} x ${p.x}`);
      assert.ok(p.y >= -1e-9 && p.y <= 1 + 1e-9, `${metric} y ${p.y}`);
    }
    assert.ok(c.projection.length >= 2);
  }
});

test("chartModel handles a single sample", () => {
  const s = steady().slice(0, 1);
  const c = Model.chartModel(s, "up", 7, s[0].t, null, 100);
  assert.equal(c.history.length, 1);
  assert.equal(c.projection.length, 0);
});

test("formatBar substitutes known keys only", () => {
  const samples = [{ t: 0, up: 2 * TiB, down: TiB, ratio: 2, credit: 0 }];
  assert.equal(Model.formatBar("↑{up} {ratio} {nope}", { samples, now: 0 }), "↑2.000 TB 2.00 {nope}");
  assert.equal(Model.formatBar("{ratio}", { samples: [] }), "");   // nothing to show yet
});

test("deltaOver reports the change over a window", () => {
  const s = steady();
  const d = Model.deltaOver(s, "up", s.at(-1).t, 7);
  assert.ok(Math.abs(d.delta - 350 * GiB) < 1);
  assert.equal(Model.formatDelta("up", d), "+350.0 GB");
});

test("parseHistory keeps only finite, non-negative numbers", () => {
  const text = [
    '{"t":1,"up":10,"down":5}',
    '{"t":2,"up":"10","down":5}',
    '{"t":3,"up":-1,"down":5}',
    '{"t":4,"up":10,"down":null}',
    '{"t":5,"up":1e400,"down":5}',
    'null',
    '[1,2]',
    '{"t":6,"up":12,"down":0,"ratio":"x","credit":-3,"manual":true}',
  ].join("\n");
  const s = Model.parseHistory(text);
  assert.deepEqual(s.map(x => x.t), [1, 6]);
  assert.equal(s[1].ratio, null);
  assert.equal(s[1].credit, 0);
  assert.equal(s[1].manual, true);
  assert.equal(s[0].manual, false);
});

test("parseHistory reads a runaway file from its tail", () => {
  const line = '{"t":1,"up":1,"down":1}\n';
  assert.ok(Model.MAX_HISTORY_CHARS > 1e6);
  // The head line is beyond the cap and must be ignored; the tail one is read.
  const huge = line + "x".repeat(Model.MAX_HISTORY_CHARS) + "\n" + line.replace('"t":1', '"t":99');
  const s = Model.parseHistory(huge);
  assert.deepEqual(s.map(x => x.t), [99]);
});

test("forecasts survive degenerate histories", () => {
  const same = [{ t: 100, up: 5, down: 1, ratio: 5 }, { t: 100, up: 6, down: 1, ratio: 6 }];
  assert.equal(Model.rates(same, 200, 14), null);
  const f = Model.forecast(same, 200, { windowDays: 14 });
  assert.deepEqual(f.upload, []);
  assert.equal(Model.chartModel([], "up", 7, 0, null, 10), null);
  const zeroDown = [{ t: 0, up: 0, down: 0, ratio: null }, { t: 7200, up: 1e9, down: 0, ratio: null }];
  const r = Model.rates(zeroDown, 7200, 14);
  assert.equal(r.down, 0);
  assert.equal(Model.timeToReach(zeroDown[1], r, "ratio", 2), null); // ratio undefined without download
  const c = Model.chartModel(zeroDown, "ratio", 0, 7200, r, 10);
  assert.equal(c, null);
});

test("versions agree across manifest, package.json and the IPC", async () => {
  const { readFileSync } = await import("node:fs");
  const root = new URL("..", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", root)));
  const pkg = JSON.parse(readFileSync(new URL("package.json", root)));
  const panel = readFileSync(new URL("Panel.qml", root), "utf8");
  assert.equal(pkg.version, manifest.version);
  assert.match(panel, new RegExp(`function version\\(\\): string \\{ return "${manifest.version.replaceAll(".", "\\.")}" \\}`));
});

test("dates and durations read as US English", () => {
  const t = new Date(2026, 10, 12, 14, 5).getTime() / 1000;
  assert.equal(Model.formatDate(t), "Nov 12, 2026");
  assert.equal(Model.formatDateTime(t), "Nov 12, 14:05");
  assert.equal(Model.formatIn(DAY), "in 1 day");
  assert.equal(Model.formatIn(3 * DAY), "in 3 days");
  assert.equal(Model.formatIn(21 * DAY), "in 3 weeks");
  assert.equal(Model.formatIn(92 * DAY), "in 3 months");
  assert.equal(Model.formatIn(800 * DAY), "in 2.2 years");
  assert.equal(Model.formatAgo(30), "just now");
  assert.equal(Model.formatAgo(3 * DAY), "3 days ago");
  assert.equal(Model.formatRate(50 * GiB), "+50.0 GB/day");
});

test("tiles put the ratio in the middle", () => {
  assert.deepEqual(Model.TILE_ORDER, ["up", "ratio", "down"]);
  assert.deepEqual([...Model.TILE_ORDER].sort(), [...Model.METRICS].sort());
});

test("parseTargets: units mean upload, ratio/r/x mean ratio, a bare number means both", () => {
  const T = (q) => Model.parseTargets(q);
  assert.deepEqual(T("10 TB"), { targets: [{ metric: "up", value: 10 * TiB, text: "10.00 TB" }] });
  assert.equal(T("850gb").targets[0].value, 850 * GiB);
  assert.equal(T("1.5 To").targets[0].value, 1.5 * TiB);      // French unit spelling
  assert.equal(T("2,5 tib").targets[0].value, 2.5 * TiB);     // decimal comma
  assert.deepEqual(T("ratio 3.5").targets, [{ metric: "ratio", value: 3.5, text: "ratio 3.50" }]);
  assert.equal(T("r 2").targets[0].value, 2);
  assert.deepEqual(T("5x").targets.map((t) => t.metric), ["ratio"]);
  assert.deepEqual(T("ratio 5x").targets.map((t) => t.metric), ["ratio"]);
  // Bare number: both readings, upload first.
  assert.deepEqual(T("5").targets, [
    { metric: "up", value: 5 * TiB, text: "5.00 TB" },
    { metric: "ratio", value: 5, text: "ratio 5.00" },
  ]);
  // Only the readings that are in range survive.
  assert.deepEqual(T("2000000").targets.map((t) => t.metric), ["up"]);
  assert.equal(T("  ").empty, true);
  for (const bad of ["abc", "ratio 5 TB", "0", "10 XB", "-3", "1e9999", "ratio 9999999", "9999999x", "99999999999 PB", "5 x 3"]) {
    assert.ok(T(bad).error, bad);
  }
  // parseTarget is the single-target shorthand.
  assert.equal(Model.parseTarget("5").metric, "up");
  assert.ok(Model.parseTarget("abc").error);
});

test("simulate: upload targets", () => {
  const s = steady();                       // +50 GiB/day up, +10 GiB/day down
  const now = s.at(-1).t;
  const ahead = Model.simulate(s, now, 7, Model.parseTarget(`${(s.at(-1).up + 100 * GiB) / GiB} GB`));
  assert.equal(ahead.status, "eta");
  assert.ok(Math.abs((ahead.when - now) / DAY - 2) < 1e-6);
  const crossed = Model.simulate(s, now, 7, { metric: "up", value: s[10].up });
  assert.equal(crossed.status, "reached");
  assert.equal(crossed.when, s[10].t);      // the reading where it was crossed
  const before = Model.simulate(s, now, 7, { metric: "up", value: 1 });
  assert.equal(before.status, "reached");
  assert.equal(before.when, null);          // already there at the first reading
  const idle = steady({ upPerDay: 0 });
  assert.equal(Model.simulate(idle, idle.at(-1).t, 7, { metric: "up", value: 100 * TiB }).reason, "no-upload");
});

test("simulate: ratio rising, capped, falling, reached", () => {
  const s = steady();                       // ratio rises towards 50/10 = 5
  const now = s.at(-1).t;
  const last = s.at(-1);
  const rise = Model.simulate(s, now, 7, { metric: "ratio", value: 3 });
  assert.equal(rise.status, "eta");
  assert.equal(rise.direction, "rise");
  assert.ok(Math.abs(Model.projectAt(last, rise.rates, rise.when).ratio - 3) < 1e-9);
  assert.ok(Math.abs(rise.ceiling - 5) < 1e-9);
  const capped = Model.simulate(s, now, 7, { metric: "ratio", value: 6 });
  assert.equal(capped.status, "never");
  assert.equal(capped.reason, "ceiling");
  assert.equal(Model.simulate(s, now, 7, { metric: "ratio", value: 1 }).status, "reached");

  // Heavy leecher: ratio 3 falling towards 10/50 = 0.2.
  const leech = steady({ up0: 12 * TiB, down0: 4 * TiB, upPerDay: 10 * GiB, downPerDay: 50 * GiB });
  const lnow = leech.at(-1).t;
  const fall = Model.simulate(leech, lnow, 7, { metric: "ratio", value: 1 });
  assert.equal(fall.status, "eta");
  assert.equal(fall.direction, "fall");
  assert.ok(Math.abs(Model.projectAt(leech.at(-1), fall.rates, fall.when).ratio - 1) < 1e-9);
  const floor = Model.simulate(leech, lnow, 7, { metric: "ratio", value: 0.1 });
  assert.equal(floor.reason, "floor");      // falls towards 0.2, never down to 0.1
  assert.match(Model.describeSimulation(floor, lnow, 7).detail, /falling but levels off near 0\.20/);
  assert.equal(Model.simulate(leech, lnow, 7, { metric: "ratio", value: 5 }).reason, "not-rising");

  // Nothing downloaded yet: ratio is infinite and stays so.
  const seedOnly = steady({ down0: 0, downPerDay: 0 });
  assert.equal(Model.simulate(seedOnly, seedOnly.at(-1).t, 7, { metric: "ratio", value: 50 }).status, "reached");
});

test("simulate: no data and no pace", () => {
  assert.equal(Model.simulate([], 0, 7, { metric: "up", value: 1 }).status, "no-data");
  const one = steady().slice(0, 1);
  assert.equal(Model.simulate(one, one[0].t, 7, { metric: "up", value: 100 * TiB }).status, "no-pace");
});

test("describeSimulation covers every status in plain English", () => {
  const s = steady();
  const now = s.at(-1).t;
  const cases = [
    [{ metric: "up", value: s.at(-1).up + 100 * GiB, text: "x" }, /^\d+\.\d{2} TB uploaded in 2 days$/],
    [{ metric: "ratio", value: 3 }, /^Ratio 3\.00 in /],
    [{ metric: "ratio", value: 6 }, /out of reach/],
    [{ metric: "ratio", value: 1 }, /already there/],
    [{ metric: "up", value: 1, text: "1 B" }, /already there/],
  ];
  for (const [target, re] of cases) {
    const d = Model.describeSimulation(Model.simulate(s, now, 7, target), now, 7);
    assert.match(d.headline, re);
    assert.ok(d.detail.length > 10);
    assert.doesNotMatch(d.headline + d.detail, /undefined|NaN|null/);
  }
  const capped = Model.describeSimulation(Model.simulate(s, now, 7, { metric: "ratio", value: 6 }), now, 7);
  assert.match(capped.detail, /levels off near 5\.00/);
  for (const status of ["no-data", "no-pace"]) {
    const d = Model.describeSimulation({ status, target: { metric: "up", value: 1, text: "1 B" } }, now, 7);
    assert.ok(d.headline);
  }
});

test("formatShortDate drops the current year", () => {
  const now = new Date(2026, 8, 28).getTime() / 1000;
  assert.equal(Model.formatShortDate(new Date(2026, 8, 26).getTime() / 1000, now), "Sep 26");
  assert.equal(Model.formatShortDate(new Date(2025, 11, 31).getTime() / 1000, now), "Dec 31, 2025");
});

// --- Languages ----------------------------------------------------------------

test("both catalogues have the same keys and the same placeholders", () => {
  const holes = (str) => [...String(str).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  assert.deepEqual(Object.keys(Model.FR.t).sort(), Object.keys(Model.EN.t).sort());
  for (const key of Object.keys(Model.EN.t)) {
    assert.equal(holes(Model.FR.t[key]), holes(Model.EN.t[key]), key);
  }
  for (const part of ["units", "months"]) assert.equal(Model.FR[part].length, Model.EN[part].length, part);
  assert.deepEqual(Object.keys(Model.FR.rangeLabels).sort(), Model.RANGES.map((r) => r.key).sort());
});

test("resolveLanguage: explicit setting first, then the session locale", () => {
  const R = Model.resolveLanguage;
  assert.equal(R("English", "fr_FR.UTF-8"), "en");
  assert.equal(R("Français", "en_US.UTF-8"), "fr");
  assert.equal(R("Auto", "fr_FR.UTF-8"), "fr");
  assert.equal(R("Auto", "fr_CA.UTF-8"), "fr");
  assert.equal(R("Auto", "en_US.UTF-8"), "en");
  assert.equal(R("Auto", "de_DE.UTF-8"), "en");
  assert.equal(R("", ""), "en");
  assert.equal(R(undefined, undefined), "en");
  assert.equal(R("fr"), "fr");
  assert.equal(R("nonsense", "fr_BE"), "fr");
});

test("French formatting: comma decimals, French units, dates and plurals", () => {
  const L = Model.locale("fr");
  assert.equal(L.bytes(12.3456 * TiB), "12,346 To");
  assert.equal(L.bytes(1536), "1,5 Ko");
  assert.equal(L.bytes(0), "0 o");
  assert.equal(L.rate(50 * GiB), "+50,0 Go/j");
  assert.equal(L.ratio(3.876), "3,88");
  const t = new Date(2026, 10, 12, 14, 5).getTime() / 1000;
  assert.equal(L.date(t), "12 nov. 2026");
  assert.equal(L.dateTime(t), "12 nov. 14:05");
  assert.equal(L.shortDate(t, t), "12 nov.");
  assert.equal(L.inTime(DAY), "dans 1 jour");
  assert.equal(L.inTime(3 * DAY), "dans 3 jours");
  assert.equal(L.inTime(92 * DAY), "dans 3 mois");
  assert.equal(L.inTime(800 * DAY), "dans 2,2 ans");
  assert.equal(L.ago(30), "à l'instant");
  assert.equal(L.ago(3 * DAY), "il y a 3 jours");
  assert.equal(L.rangeLabel("all"), "Tout");
  assert.equal(L.target("xyz").error, "Essaie « 10 To », « 850 Go », « ratio 5 » ou « 5x »");
  assert.deepEqual(L.targets("5").targets.map((t) => t.text), ["5,00 To", "ratio 5,00"]);
});

test("English stays the default everywhere", () => {
  const L = Model.locale("de");                     // unknown -> English
  assert.equal(L.code, "en");
  assert.equal(L.bytes(1536), "1.5 KB");
  assert.equal(Model.formatBytes(1536), Model.locale("en").bytes(1536));
});

test("French what-if answers carry no English", () => {
  const s = steady();
  const now = s.at(-1).t;
  const L = Model.locale("fr");
  for (const q of ["10 To", "ratio 3", "ratio 6", "ratio 1", "1 o"]) {
    const d = L.describe(Model.simulate(s, now, 7, L.target(q)), now, 7);
    assert.doesNotMatch(d.headline + " " + d.detail, /\b(uploaded|already|reach|Around|over|days|pace|your)\b/, q);
    assert.doesNotMatch(d.headline + d.detail, /undefined|NaN|\{\d\}/, q);
  }
});

test("forecast rows follow the locale", () => {
  const s = steady();
  const f = Model.locale("fr").forecast(s, s.at(-1).t, { windowDays: 7 });
  assert.match(f.upload[0].text, /To$/);
  assert.match(f.ratio[0].text, /,/);
});

// --- Bar label compositions ------------------------------------------------------

test("bar label: compositions, aliases, escapes, spacing and case", () => {
  const s = steady();                                  // +50 GiB/day up, +10 GiB/day down
  const now = s.at(-1).t;
  const ctx = { samples: s, now, rates: Model.rates(s, now, 7), user: { username: "x99" } };
  const B = (tpl, extra = {}, lang = "en") => Model.locale(lang).bar(tpl, { ...ctx, ...extra });
  assert.equal(B("{up}"), Model.formatBytes(s.at(-1).up));
  assert.equal(B("{upload}|{UL}|{ up }|{Up}"), Array(4).fill(Model.formatBytes(s.at(-1).up)).join("|"));
  assert.equal(B("{dl}"), B("{down}"));
  assert.equal(B("{bonus}"), B("{credit}"));
  assert.equal(B("{uprate}"), "+50.0 GB/day");
  assert.equal(B("{downrate}"), "+10.0 GB/day");
  assert.equal(B("{up7d}"), "+350.0 GB");
  assert.equal(B("{down24h}"), "+10.0 GB");
  assert.match(B("{ratio7d}"), /^\+0\.\d{3}$/);
  assert.equal(B("{buffer}"), Model.formatBytes(s.at(-1).up - s.at(-1).down));
  assert.equal(B("{user}"), "x99");
  assert.equal(B("{{up}} = {up}"), "{up} = " + B("{up}"));
  assert.equal(B("{nope} {up}"), "{nope} " + B("{up}"));
  assert.equal(B("  {user}   ·   {user}  "), "x99 · x99");     // whitespace collapsed, trimmed
  assert.equal(B(""), "");
  assert.equal(B("↑{up} · {ratio}", {}, "fr"), "↑" + Model.locale("fr").bytes(s.at(-1).up) + " · " + Model.locale("fr").ratio(s.at(-1).ratio));
});

test("bar label: targets", () => {
  const s = steady();                                  // ratio rises towards 5
  const now = s.at(-1).t;
  const ctx = { samples: s, now, rates: Model.rates(s, now, 7) };
  const B = (tpl, extra = {}) => Model.formatBar(tpl, { ...ctx, ...extra });
  assert.equal(B("{goal}"), "");                                             // no goal set
  assert.equal(B("{goal}", { uploadGoal: s.at(-1).up + 100 * GiB }), "2 days");
  assert.equal(B("{goal}", { uploadGoal: 1 }), "✓");
  assert.equal(B("{ratiogoal}", { ratioGoal: 1 }), "✓");
  assert.equal(B("{ratiogoal}", { ratioGoal: 6 }), "∞");                      // above the 5 ceiling
  assert.match(B("{next} in {nexteta}"), /^\d+(\.\d)? TB in .+$/);
  assert.equal(B("{goal}", { rates: null, uploadGoal: 100 * TiB }), "");      // no pace yet
  // Every documented key resolves to something other than itself.
  for (const key of Model.BAR_KEYS) assert.notEqual(B(`{${key}}`, { uploadGoal: 20 * TiB, ratioGoal: 4, user: { username: "u" } }), `{${key}}`, key);
});

test("bar keys documented in the manifest match the model", async () => {
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url)));
  const field = manifest.barWidget.schema.find((f) => f.key === "barFormat");
  const documented = [...field.description.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  for (const key of Model.BAR_KEYS) assert.ok(documented.includes(key), `manifest misses {${key}}`);
  const language = manifest.barWidget.schema.find((f) => f.key === "language");
  assert.deepEqual(language.options, Model.LANGUAGES);
});

test("QML property names start with a lower-case letter", async () => {
  // QML rejects `property var L`, and qmllint does not say so: the widget just
  // fails to load. Guard it here.
  const { readFileSync, readdirSync } = await import("node:fs");
  const root = new URL("..", import.meta.url);
  for (const name of readdirSync(root).filter((f) => f.endsWith(".qml"))) {
    const src = readFileSync(new URL(name, root), "utf8");
    for (const m of src.matchAll(/^\s*(?:readonly\s+|required\s+|default\s+)*property\s+\S+\s+(\w+)/gm)) {
      assert.match(m[1], /^[a-z_]/, `${name}: property ${m[1]}`);
    }
    for (const m of src.matchAll(/^\s+([A-Z]\w*)\s*:/gm)) {
      assert.fail(`${name}: binding to upper-case property ${m[1]}`);
    }
  }
});

test("bar label: prototype names are not keys, and the pill stays short", () => {
  const s = steady();
  const ctx = { samples: s, now: s.at(-1).t, rates: null };
  for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
    assert.equal(Model.formatBar(`{${k}}`, ctx), `{${k}}`, k);
  }
  const long = Model.formatBar("{ratio} ".repeat(200), ctx);
  assert.equal(long.length, Model.MAX_BAR_CHARS);
  assert.ok(long.endsWith("…"));
});

test("what-if input is bounded", () => {
  assert.ok(Model.parseTargets("5".repeat(Model.MAX_TARGET_CHARS + 1)).error);
  assert.ok(Model.parseTargets(" ".repeat(10000) + "x").error);
  const t0 = Date.now();
  Model.parseTargets("ratio " + " ".repeat(5000) + "5");   // no pathological backtracking
  assert.ok(Date.now() - t0 < 50);
});

// --- Regression: huge "levels off near 61495463179088" -------------------------

// Real-world shape: ~4 TB of upload growing, download frozen at ~1.1 TB,
// readings at irregular times over four days.
function frozenDownload() {
  const out = [];
  let t = 1_790_400_000, up = 4.3 * TiB;
  const down = 1220388150663;
  for (let i = 0; i < 94; i++) {
    t += 1800 + ((i * 7919) % 1300);
    up += 80 * GiB * (t % 5000) / 86400 / 2.5;
    out.push({ t, up, down, ratio: up / down, credit: 0 });
  }
  return out;
}

test("a flat counter has a zero slope, even at 10^12 bytes", () => {
  const s = frozenDownload();
  assert.equal(Model.slope(s, "down"), 0);
  assert.equal(Model.rates(s, s.at(-1).t, 14).down, 0);
});

test("paces below the noise floor count as zero", () => {
  const s = steady({ downPerDay: Model.MIN_PACE / 2 });
  assert.equal(Model.rates(s, s.at(-1).t, 7).down, 0);
  const real = steady({ downPerDay: 2 * Model.MIN_PACE });
  assert.ok(Model.rates(real, real.at(-1).t, 7).down > 0);
});

test("what-if answers never print an absurd ratio ceiling", () => {
  const cases = [frozenDownload(), steady({ downPerDay: 2 * Model.MIN_PACE })];  // none / ~2 MiB a day
  for (const s of cases) {
    const now = s.at(-1).t;
    for (const lang of ["en", "fr"]) {
      const L = Model.locale(lang);
      for (const q of ["ratio 5", "ratio 50", "5"]) {
        for (const target of L.targets(q).targets) {
          const d = L.describe(Model.simulate(s, now, 14, target), now, 14);
          assert.doesNotMatch(d.detail, /\d{5,}/, `${lang} ${q}: ${d.detail}`);
          if (target.metric === "ratio") assert.doesNotMatch(d.detail, /levels off|plafonne/, `${lang} ${q}`);
        }
      }
    }
  }
});

// --- Daily pace chart ------------------------------------------------------------

test("dailyPace: a steady seeder gets the same bar every full day", () => {
  const s = steady({ days: 10, upPerDay: 50 * GiB, downPerDay: 10 * GiB });
  const now = s.at(-1).t;
  const days = Model.dailyPace(s, now, 7);
  assert.equal(days.length, 7);
  for (const d of days) {
    assert.equal(d.t, Model.dayStart(d.t));                 // local midnights
    if (d.covered < 20 * 3600) continue;                     // today may be partial
    assert.ok(Math.abs(d.up - 50 * GiB) < 1, `up ${d.up}`);
    assert.ok(Math.abs(d.down - 10 * GiB) < 1, `down ${d.down}`);
  }
});

test("dailyPace: a gap is spread over the days it spans, empty days get no bar", () => {
  const day0 = Model.dayStart(1_790_400_000) + 3 * DAY;     // some local midnight
  const s = [
    { t: day0 + 6 * 3600, up: 0, down: 0 },
    { t: day0 + 18 * 3600, up: 60 * GiB, down: 0 },          // 12 h: 60 GiB -> 120 GiB/day
    // PC off from day0 18:00 to day0+1 18:00: 24 h, 100 GiB, spread by time:
    // 6 h (25 GiB) on day0, 18 h (75 GiB) on day0+1.
    { t: day0 + DAY + 18 * 3600, up: 160 * GiB, down: 0 },
    // Nothing on day0+2; one reading on day0+3 closes a 24 h+ gap.
  ];
  const now = day0 + 3 * DAY + 12 * 3600;
  const days = Model.dailyPace(s, now, 4);
  assert.deepEqual(days.map((d) => d.t), [day0, day0 + DAY, day0 + 2 * DAY, day0 + 3 * DAY]);
  // day0: 60 GiB over 12 h + 25 GiB over 6 h -> 85 GiB over 18 h.
  assert.ok(Math.abs(days[0].up - 85 * GiB / 18 * 24) < 1);
  // day0+1: 75 GiB over its first 18 h.
  assert.ok(Math.abs(days[1].up - 75 * GiB / 18 * 24) < 1);
  assert.equal(days[2].up, null);
  assert.equal(days[3].up, null);
});

test("dailyPace: counters that go backwards never make negative bars", () => {
  const t = Model.dayStart(1_790_400_000) + 2 * DAY;
  const s = [{ t, up: 10 * GiB, down: 5 * GiB }, { t: t + 6 * 3600, up: 2 * GiB, down: 1 * GiB }];
  const [d] = Model.dailyPace(s, t + 7 * 3600, 1);
  assert.equal(d.up, 0);
  assert.equal(d.down, 0);
  assert.deepEqual(Model.dailyPace([], t, 3).map((x) => x.up), [null, null, null]);
});
