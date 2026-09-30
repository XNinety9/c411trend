.pragma library

// Pure data helpers for C411 Trend: history parsing, formatting, linear
// forecasts and chart geometry. No Qt imports so node can test it.

var DAY = 86400
var METRICS = ["up", "down", "ratio"]
// Chart ranges, in days; 0 = everything recorded. Labels come from the locale.
var RANGES = [
  { key: "24h", days: 1 },
  { key: "7d", days: 7 },
  { key: "30d", days: 30 },
  { key: "all", days: 0 }
]

// --- Locales ------------------------------------------------------------------
//
// Every user-facing string lives here. Sizes use binary multiples in both
// languages, as the tracker counts: 1 TB (1 To) is 1024^4 bytes.

var EN = {
  code: "en",
  decimal: ".",
  units: ["B", "KB", "MB", "GB", "TB", "PB", "EB"],
  months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  perDay: "/day",
  metricNames: { up: "Upload", down: "Download", ratio: "Ratio" },
  rangeLabels: { "24h": "24h", "7d": "7d", "30d": "30d", "all": "All" },
  words: { day: ["day", "days"], week: ["week", "weeks"], month: ["month", "months"], year: ["year", "years"] },
  t: {
    date: "{m} {d}, {y}",
    shortDate: "{m} {d}",
    shortDateYear: "{m} {d}, {y}",
    dateTime: "{m} {d}, {hm}",
    axisDay: "{m} {d}",
    axisMonth: "{m} {y}",
    inTime: "in {0}",
    ago: "{0} ago",
    justNow: "just now",
    minAgo: "{0} min ago",
    hAgo: "{0} h ago",

    fetching: "fetching…",
    updated: "updated {0}",
    lastReading: "last reading {0}",
    noReading: "no reading yet",
    loginHint: "Log in to c411.org in your browser, then middle-click the bar icon to retry.",
    paceNeedHour: "Forecasts need at least an hour of readings.",
    paceOverPartial: "over the last {0} (all there is so far)",
    paceOver: "over {0} days",
    pace: "Pace {0}: ↑ {1} · ↓ {2}",
    outOfReach: "out of reach at this pace",
    reached: "reached",
    forecast: "FORECAST",
    whatIf: "WHAT IF",
    horizonRow: "+{0} days · {1}",
    whatIfHint: "Type an upload amount (10 TB) or a ratio (ratio 5, 5x) to see when you would get there at your current pace. A bare number gets both answers.",
    placeholderTarget: "10 TB, 850 GB, ratio 5…",
    footerField: "⏎ keep · Esc back · \"10 TB\", \"ratio 5\", \"5x\", \"5\" for both",
    footer: "u/r/d metric · 1-4 or ←/→ range · f what-if · R refresh · o c411.org · {0} readings",
    in7days: "{0} in 7 days",
    since: "{0} since {1}",
    uploadedRow: "{0} uploaded",
    ratioRow: "Ratio {0}",
    noRange: "No readings in this range yet",
    fetchingTitle: "Fetching…",
    now: "now",
    forecastHover: "forecast · ",
    noData: "No data yet",
    summaryPace: "{0} upload pace ({1} average)",
    errPython: "python3 not found: c411trend-fetch cannot start",
    errExit: "c411trend-fetch exited without an answer (code {0})",
    errUnknown: "unknown error",
    errWatchdog: "c411trend-fetch stopped responding, poll abandoned",
    ipcUsage: "usage: when \"10 TB\" | when \"ratio 5\"",
    ipcNoHistory: "not enough history",

    simNoDataHead: "No readings yet",
    simNoDataDetail: "Forecasts start once the first poll lands.",
    simNoPaceHead: "Not enough history yet",
    simRatio: "Ratio {0}",
    simUp: "{0} uploaded",
    simAlready: "{0}: already there",
    simRatioHolding: "Your ratio is {0} and not falling.",
    simBeforeFirst: "Reached before your first reading.",
    simCrossed: "Crossed on {0}.",
    simEta: "{0} {1}",
    simFall: "Ratio falls to {0} {1}",
    simAround: "Around {0}, at {1}.",
    simPaceDays: "{0} over {1} days",
    simPaceLast: "{0} over the last {1}",
    simRatioPace: "↑ {0} · ↓ {1}",
    simCeiling: "At this pace your ratio levels off near {0}.",
    simFallNote: "You are downloading faster than your ratio can hold.",
    simOut: "{0}: out of reach at this pace",
    simWhyNoUpload: "Nothing uploaded over the last {0} days.",
    simWhyNotRising: "Your ratio is not rising at the moment ({0}).",
    simWhyCeiling: "Your ratio cannot climb that high at this pace.",
    simWhyFloor: "Your ratio is falling but levels off near {0} at this pace, above that.",

    targetHint: "Try \"10 TB\", \"850 GB\", \"ratio 5\" or \"5x\"",
    targetRatioUnit: "A ratio has no unit",
    targetUnknownUnit: "Unknown unit \"{0}\"",
    targetAboveZero: "The target must be above zero",
    targetRatioRange: "That ratio is out of range",
    targetAmountRange: "That amount is out of range",
    targetRatioText: "ratio {0}",

    goalReached: "✓",
    goalNever: "∞"
  }
}

var FR = {
  code: "fr",
  decimal: ",",
  units: ["o", "Ko", "Mo", "Go", "To", "Po", "Eo"],
  months: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  perDay: "/j",
  metricNames: { up: "Upload", down: "Download", ratio: "Ratio" },
  rangeLabels: { "24h": "24 h", "7d": "7 j", "30d": "30 j", "all": "Tout" },
  words: { day: ["jour", "jours"], week: ["semaine", "semaines"], month: ["mois", "mois"], year: ["an", "ans"] },
  t: {
    date: "{d} {m} {y}",
    shortDate: "{d} {m}",
    shortDateYear: "{d} {m} {y}",
    dateTime: "{d} {m} {hm}",
    axisDay: "{d} {m}",
    axisMonth: "{m} {y}",
    inTime: "dans {0}",
    ago: "il y a {0}",
    justNow: "à l'instant",
    minAgo: "il y a {0} min",
    hAgo: "il y a {0} h",

    fetching: "récupération…",
    updated: "mis à jour {0}",
    lastReading: "dernier relevé {0}",
    noReading: "pas encore de relevé",
    loginHint: "Connecte-toi sur c411.org dans ton navigateur, puis clic milieu sur l'icône pour réessayer.",
    paceNeedHour: "Les prévisions demandent au moins une heure de relevés.",
    paceOverPartial: "sur les {0} disponibles",
    paceOver: "sur {0} jours",
    pace: "Rythme {0} : ↑ {1} · ↓ {2}",
    outOfReach: "hors d'atteinte à ce rythme",
    reached: "atteint",
    forecast: "PRÉVISIONS",
    whatIf: "ET SI…",
    horizonRow: "+{0} j · {1}",
    whatIfHint: "Tape un volume d'upload (10 To) ou un ratio (ratio 5, 5x) pour savoir quand tu l'atteindras à ton rythme actuel. Un nombre seul donne les deux réponses.",
    placeholderTarget: "10 To, 850 Go, ratio 5…",
    footerField: "⏎ garder · Échap retour · « 10 To », « ratio 5 », « 5x », « 5 » pour les deux",
    footer: "u/r/d métrique · 1-4 ou ←/→ période · f et si · R actualiser · o c411.org · {0} relevés",
    in7days: "{0} sur 7 j",
    since: "{0} depuis le {1}",
    uploadedRow: "{0} d'upload",
    ratioRow: "Ratio {0}",
    noRange: "Pas encore de relevé sur cette période",
    fetchingTitle: "Récupération…",
    now: "maintenant",
    forecastHover: "prévu · ",
    noData: "Pas encore de données",
    summaryPace: "rythme d'upload {0} (moyenne sur {1})",
    errPython: "python3 introuvable : c411trend-fetch ne peut pas démarrer",
    errExit: "c411trend-fetch s'est arrêté sans réponse (code {0})",
    errUnknown: "erreur inconnue",
    errWatchdog: "c411trend-fetch ne répond plus, relevé abandonné",
    ipcUsage: "usage : when \"10 To\" | when \"ratio 5\"",
    ipcNoHistory: "pas assez d'historique",

    simNoDataHead: "Aucun relevé pour l'instant",
    simNoDataDetail: "Les prévisions démarrent dès le premier relevé.",
    simNoPaceHead: "Pas encore assez d'historique",
    simRatio: "Ratio {0}",
    simUp: "{0} d'upload",
    simAlready: "{0} : déjà atteint",
    simRatioHolding: "Ton ratio est à {0} et ne baisse pas.",
    simBeforeFirst: "Atteint avant ton premier relevé.",
    simCrossed: "Franchi le {0}.",
    simEta: "{0} {1}",
    simFall: "Ratio à {0} {1}",
    simAround: "Vers le {0}, à {1}.",
    simPaceDays: "{0} sur {1} jours",
    simPaceLast: "{0} sur {1}",
    simRatioPace: "↑ {0} · ↓ {1}",
    simCeiling: "À ce rythme, ton ratio plafonne vers {0}.",
    simFallNote: "Tu télécharges plus vite que ton ratio ne peut suivre.",
    simOut: "{0} : hors d'atteinte à ce rythme",
    simWhyNoUpload: "Aucun upload sur les {0} derniers jours.",
    simWhyNotRising: "Ton ratio ne monte pas en ce moment ({0}).",
    simWhyCeiling: "Ton ratio ne peut pas monter aussi haut à ce rythme.",
    simWhyFloor: "Ton ratio baisse mais se stabilise vers {0} à ce rythme, au-dessus de la cible.",

    targetHint: "Essaie « 10 To », « 850 Go », « ratio 5 » ou « 5x »",
    targetRatioUnit: "Un ratio n'a pas d'unité",
    targetUnknownUnit: "Unité « {0} » inconnue",
    targetAboveZero: "La cible doit être supérieure à zéro",
    targetRatioRange: "Ce ratio est hors limites",
    targetAmountRange: "Ce volume est hors limites",
    targetRatioText: "ratio {0}",

    goalReached: "✓",
    goalNever: "∞"
  }
}

var LOCALES = { en: EN, fr: FR }
var LANGUAGES = ["Auto", "English", "Français"]

// Setting ("Auto", "English", "Français", or a code) + the environment's
// LC_MESSAGES/LANG -> "en" | "fr".
function resolveLanguage(setting, envLang) {
  var s = String(setting || "").toLowerCase()
  if (s === "english" || s === "en" || s === "en-us" || s === "en_us") return "en"
  if (s === "français" || s === "francais" || s === "french" || s === "fr" || s === "fr-fr" || s === "fr_fr") return "fr"
  return /^fr/i.test(String(envLang || "")) ? "fr" : "en"
}

function loc(l) { return l && l.t ? l : EN }

// "{0} since {1}" + ["a", "b"] -> "a since b"; named keys from an object.
function fill(template, args) {
  return String(template).replace(/\{(\w+)\}/g, function(m, k) {
    return args && args[k] !== undefined ? String(args[k]) : m
  })
}

function tr(l, key, args) {
  var L = loc(l)
  var s = L.t[key]
  if (s === undefined) s = EN.t[key]
  return fill(s === undefined ? key : s, args || [])
}

function fixed(v, decimals, l) {
  return v.toFixed(decimals).replace(".", loc(l).decimal)
}

function plural(n, word, l) {
  var forms = loc(l).words[word]
  return n + " " + (n === 1 || (loc(l).code === "fr" && n < 2) ? forms[0] : forms[1])
}

// Same scale as the site (powers of 1024), three decimals from TB upwards so
// the pill matches the figures c411.org shows.
function formatBytes(bytes, decimals, l) {
  var units = loc(l).units
  if (bytes === null || bytes === undefined || isNaN(bytes)) return "—"
  var sign = bytes < 0 ? "-" : ""
  var b = Math.abs(bytes)
  if (b < 1) return "0 " + units[0]
  var i = Math.floor(Math.log(b) / Math.log(1024))
  i = Math.max(0, Math.min(units.length - 1, i))
  var v = b / Math.pow(1024, i)
  if (v >= 1000 && i < units.length - 1) { i++; v = b / Math.pow(1024, i) }
  var d = decimals !== undefined && decimals !== null ? decimals : (i >= 4 ? 3 : 1)
  if (i === 0) d = 0
  return sign + fixed(v, d, l) + " " + units[i]
}

function formatRate(bytesPerDay, l) {
  if (bytesPerDay === null || bytesPerDay === undefined || isNaN(bytesPerDay)) return "—"
  return (bytesPerDay >= 0 ? "+" : "") + formatBytes(bytesPerDay, 1, l) + loc(l).perDay
}

function formatRatio(r, l) {
  if (r === null || r === undefined) return "∞"
  if (isNaN(r)) return "—"
  return fixed(r, r >= 100 ? 0 : 2, l)
}

function pad2(n) { return n < 10 ? "0" + n : String(n) }

function dateParts(t, l) {
  var d = new Date(t * 1000)
  return { d: d.getDate(), m: loc(l).months[d.getMonth()], y: d.getFullYear(), hm: pad2(d.getHours()) + ":" + pad2(d.getMinutes()) }
}

function formatDate(t, l) {
  return tr(l, "date", dateParts(t, l))
}

// "Sep 26" / "26 sept.", with the year only when it is not the current one.
function formatShortDate(t, now, l) {
  var p = dateParts(t, l)
  var ref = new Date((now === undefined || now === null ? Date.now() / 1000 : now) * 1000)
  return tr(l, p.y === ref.getFullYear() ? "shortDate" : "shortDateYear", p)
}

function formatDateTime(t, l) {
  return tr(l, "dateTime", dateParts(t, l))
}

// Short axis label: hours inside a day, month+day otherwise.
function formatAxis(t, spanSec, l) {
  var p = dateParts(t, l)
  if (spanSec <= 2 * DAY) return p.hm
  if (spanSec <= 400 * DAY) return tr(l, "axisDay", p)
  return tr(l, "axisMonth", p)
}

// "3 days", "5 weeks", "1.5 years": a duration without the "in".
function formatDuration(seconds, l) {
  if (seconds === null || seconds === undefined || !isFinite(seconds)) return ""
  var days = seconds / DAY
  if (days < 1) return Math.max(1, Math.round(seconds / 3600)) + " h"
  if (days < 14) return plural(Math.round(days), "day", l)
  if (days < 60) return plural(Math.round(days / 7), "week", l)
  if (days < 730) return plural(Math.round(days / 30.44), "month", l)
  return fixed(days / 365.25, 1, l) + " " + loc(l).words.year[1]
}

function formatIn(seconds, l) {
  var d = formatDuration(seconds, l)
  return d === "" ? "" : tr(l, "inTime", [d])
}

function formatAgo(seconds, l) {
  if (seconds < 90) return tr(l, "justNow")
  if (seconds < 3600) return tr(l, "minAgo", [Math.round(seconds / 60)])
  if (seconds < 2 * DAY) return tr(l, "hAgo", [Math.round(seconds / 3600)])
  return tr(l, "ago", [plural(Math.round(seconds / DAY), "day", l)])
}

// history.jsonl -> [{t, up, down, ratio, credit}] sorted by time. Broken
// lines (a crash mid-write) are skipped rather than poisoning the lot.
// The file is ours, but a hand edit or a disk hiccup must not take the panel
// down: only finite, non-negative numbers survive, and a runaway file is read
// from its tail (MAX_HISTORY_CHARS, ~5 years of 30-minute polls).
var MAX_HISTORY_CHARS = 16 * 1024 * 1024

function goodNumber(v) {
  return typeof v === "number" && isFinite(v) && v >= 0
}

function parseHistory(text) {
  var out = []
  var src = String(text || "")
  if (src.length > MAX_HISTORY_CHARS) src = src.slice(src.length - MAX_HISTORY_CHARS)
  var lines = src.split("\n")
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (line === "") continue
    try {
      var s = JSON.parse(line)
      if (!s || typeof s !== "object") continue
      if (!goodNumber(s.t) || !goodNumber(s.up) || !goodNumber(s.down)) continue
      var ratio = goodNumber(s.ratio) ? s.ratio : (s.down > 0 ? s.up / s.down : null)
      out.push({ t: s.t, up: s.up, down: s.down, ratio: ratio, credit: goodNumber(s.credit) ? s.credit : 0, manual: s.manual === true })
    } catch (e) {}
  }
  out.sort(function(a, b) { return a.t - b.t })
  return out
}

function ratioOf(s) {
  if (typeof s.ratio === "number") return s.ratio
  return s.down > 0 ? s.up / s.down : null
}

function valueOf(sample, metric) {
  if (metric === "ratio") return ratioOf(sample)
  return sample[metric]
}

function since(samples, t0) {
  var out = []
  for (var i = 0; i < samples.length; i++) if (samples[i].t >= t0) out.push(samples[i])
  return out
}

// Least-squares slope of `metric` against time, per second.
// Both axes are taken relative to the first sample: counters are ~10^12
// bytes, and summing their raw squares loses enough precision that a flat
// series comes out with a tiny non-zero slope.
function slope(samples, metric) {
  var n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0
  var t0 = samples.length ? samples[0].t : 0
  var y0 = null
  for (var i = 0; i < samples.length; i++) {
    var v = valueOf(samples[i], metric)
    if (v === null || v === undefined || isNaN(v)) continue
    if (y0 === null) y0 = v
    var y = v - y0
    var x = samples[i].t - t0
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y
  }
  if (n < 2) return null
  var den = n * sxx - sx * sx
  if (den <= 0) return null
  return (n * sxy - sx * sy) / den
}

// Below this a pace is rounding noise, not torrent activity; it counts as
// zero so it can never become a divisor (a ratio "levelling off near 10^13").
var MIN_PACE = 1024 * 1024  // bytes per day

function pace(perSecond) {
  var perDay = Math.max(0, perSecond) * DAY
  return perDay < MIN_PACE ? 0 : perDay
}

// Upload and download rates over the last `windowDays`, in bytes per day.
// Needs at least an hour of data, otherwise a single poll's jitter would be
// extrapolated to months.
function rates(samples, now, windowDays) {
  var win = since(samples, now - windowDays * DAY)
  if (win.length < 2) win = samples.slice(-2)
  if (win.length < 2) return null
  var span = win[win.length - 1].t - win[0].t
  if (span < 3600) return null
  var up = slope(win, "up"), down = slope(win, "down")
  if (up === null || down === null) return null
  return {
    up: pace(up),
    down: pace(down),
    samples: win.length,
    spanDays: span / DAY,
    partial: span < windowDays * DAY * 0.9
  }
}

// Where the counters will be at time `t` if the current pace holds.
function projectAt(last, r, t) {
  var dt = (t - last.t) / DAY
  var up = last.up + r.up * dt
  var down = last.down + r.down * dt
  return { t: t, up: up, down: down, ratio: down > 0 ? up / down : null }
}

// Unix time at which a cumulative counter reaches `target`, or null.
function timeToReach(last, r, metric, target) {
  if (!r) return null
  if (metric === "ratio") {
    // (U + a·d) / (D + b·d) = R  =>  d = (R·D − U) / (a − R·b)
    var U = last.up, D = last.down, a = r.up, b = r.down
    var cur = D > 0 ? U / D : null
    if (cur !== null && cur >= target) return last.t
    var den = a - target * b
    if (den <= 0) return null
    var d = (target * D - U) / den
    return d >= 0 ? last.t + d * DAY : null
  }
  var rate = r[metric]
  if (last[metric] >= target) return last.t
  if (!(rate > 0)) return null
  return last.t + (target - last[metric]) / rate * DAY
}

// Next round figures above `value`: 1-2-5 steps one decade below its size, so
// 12.3 TB gives 13, 14, 15 TB and 850 GB gives 900 GB, 950 GB, 1 TB.
function niceStep(value) {
  if (!(value > 0)) return 1
  var mag = Math.pow(10, Math.floor(Math.log(value) / Math.LN10) - 1)
  var f = value / mag
  return mag * (f < 20 ? 1 : f < 50 ? 2 : 5)
}

function nextRound(value, count) {
  var out = []
  var step = niceStep(value)
  var next = (Math.floor(value / step + 1e-9) + 1) * step
  for (var i = 0; i < count; i++) { out.push(next); next += step }
  return out
}

// Upload milestones in bytes, rounded in the unit the pill uses.
function uploadMilestones(up, count) {
  var i = Math.max(0, Math.floor(Math.log(Math.max(up, 1)) / Math.log(1024)))
  var unit = Math.pow(1024, i)
  var inUnit = up / unit
  if (inUnit >= 1000) { unit *= 1024; inUnit = up / unit }
  var vals = nextRound(inUnit, count)
  return vals.map(function(v) { return v * unit })
}

function ratioMilestones(ratio, count) {
  if (ratio === null || ratio === undefined) return []
  var step = ratio < 2 ? 0.25 : ratio < 5 ? 0.5 : ratio < 20 ? 1 : 5
  var out = []
  var next = (Math.floor(ratio / step + 1e-9) + 1) * step
  for (var i = 0; i < count; i++) { out.push(next); next += step }
  return out
}

// Forecast rows for the panel: {label, value, when, whenText, inText}.
function forecast(samples, now, opts) {
  opts = opts || {}
  var last = samples.length ? samples[samples.length - 1] : null
  var r = last ? rates(samples, now, opts.windowDays || 14) : null
  var out = { rates: r, last: last, upload: [], ratio: [], horizons: [] }
  if (!last || !r) return out
  var upTargets = uploadMilestones(last.up, 3)
  if (opts.uploadTarget > 0) upTargets.push(opts.uploadTarget)
  for (var i = 0; i < upTargets.length; i++) {
    var t = timeToReach(last, r, "up", upTargets[i])
    out.upload.push({ value: upTargets[i], custom: i >= 3, when: t, text: formatBytes(upTargets[i], upTargets[i] >= Math.pow(1024, 4) ? 1 : 0, opts.loc) })
  }
  var ratioTargets = ratioMilestones(ratioOf(last), 2)
  if (opts.ratioTarget > 0) ratioTargets.push(opts.ratioTarget)
  for (var j = 0; j < ratioTargets.length; j++) {
    var tRatio = timeToReach(last, r, "ratio", ratioTargets[j])
    out.ratio.push({ isRatio: true, value: ratioTargets[j], custom: j >= 2, when: tRatio, text: formatRatio(ratioTargets[j], opts.loc) })
  }
  var horizons = [30, 90, 365]
  for (var k = 0; k < horizons.length; k++) {
    var p = projectAt(last, r, last.t + horizons[k] * DAY)
    p.days = horizons[k]
    out.horizons.push(p)
  }
  return out
}

// Reduce a series to at most `maxPoints` by averaging time buckets, so a year
// of 30-minute polls still paints fast.
function downsample(points, maxPoints) {
  if (points.length <= maxPoints) return points
  var t0 = points[0].t, t1 = points[points.length - 1].t
  var width = (t1 - t0) / maxPoints
  var out = []
  var bucket = null
  for (var i = 0; i < points.length; i++) {
    var b = Math.min(maxPoints - 1, Math.floor((points[i].t - t0) / width))
    if (!bucket || bucket.b !== b) {
      if (bucket) out.push({ t: bucket.st / bucket.n, v: bucket.sv / bucket.n })
      bucket = { b: b, st: 0, sv: 0, n: 0 }
    }
    bucket.st += points[i].t; bucket.sv += points[i].v; bucket.n++
  }
  if (bucket) out.push({ t: bucket.st / bucket.n, v: bucket.sv / bucket.n })
  // Keep the true latest value as the line's end.
  out[out.length - 1] = points[points.length - 1]
  return out
}

// Everything the chart canvas needs, in 0..1 coordinates:
// {history: [{x, y, t, v}], projection: [{x, y, t, v}], t0, t1, vMin, vMax, now}.
function chartModel(samples, metric, rangeDays, now, r, maxPoints) {
  var start = rangeDays > 0 ? now - rangeDays * DAY : (samples.length ? samples[0].t : now)
  var pts = []
  for (var i = 0; i < samples.length; i++) {
    if (samples[i].t < start) continue
    var v = valueOf(samples[i], metric)
    if (v === null || v === undefined || isNaN(v)) continue
    pts.push({ t: samples[i].t, v: v })
  }
  if (pts.length === 0) return null
  pts = downsample(pts, maxPoints || 240)
  var last = samples[samples.length - 1]
  var histEnd = pts[pts.length - 1].t
  var histStart = Math.min(pts[0].t, histEnd - 3600)
  // Projection runs a third of the visible span past the last sample.
  var ahead = Math.max(3600, (histEnd - histStart) / 3)
  var proj = []
  if (r) {
    var steps = metric === "ratio" ? 24 : 1
    for (var s = 0; s <= steps; s++) {
      var p = projectAt(last, r, last.t + ahead * s / steps)
      var pv = valueOf(p, metric)
      if (pv !== null) proj.push({ t: p.t, v: pv })
    }
  }
  var t0 = histStart, t1 = r ? last.t + ahead : histEnd
  var vMin = Infinity, vMax = -Infinity
  var all = pts.concat(proj)
  for (var j = 0; j < all.length; j++) {
    vMin = Math.min(vMin, all[j].v); vMax = Math.max(vMax, all[j].v)
  }
  if (vMax - vMin < Math.abs(vMax) * 1e-6 || vMax === vMin) {
    var padV = Math.max(Math.abs(vMax) * 0.01, metric === "ratio" ? 0.01 : 1024)
    vMin -= padV; vMax += padV
  } else {
    var m = (vMax - vMin) * 0.08
    vMin -= m; vMax += m
  }
  if (metric !== "ratio" || vMin < 0) vMin = Math.max(0, vMin)
  function place(p) { return { t: p.t, v: p.v, x: (p.t - t0) / (t1 - t0), y: (p.v - vMin) / (vMax - vMin) } }
  return { history: pts.map(place), projection: proj.map(place), t0: t0, t1: t1, vMin: vMin, vMax: vMax, lastT: last.t }
}

function nearest(points, x) {
  var best = null, dist = Infinity
  for (var i = 0; i < points.length; i++) {
    var d = Math.abs(points[i].x - x)
    if (d < dist) { dist = d; best = points[i] }
  }
  return best
}

function formatMetric(metric, v, l) {
  return metric === "ratio" ? formatRatio(v, l) : formatBytes(v, undefined, l)
}

// Change over the last `days`: {delta, from} or null when history is shorter.
function deltaOver(samples, metric, now, days) {
  if (samples.length < 2) return null
  var last = samples[samples.length - 1]
  var target = now - days * DAY
  var base = null
  for (var i = 0; i < samples.length; i++) {
    if (samples[i].t <= target) base = samples[i]
    else break
  }
  if (!base) base = samples[0]
  if (base === last) return null
  var a = valueOf(base, metric), b = valueOf(last, metric)
  if (a === null || b === null) return null
  return { delta: b - a, from: base.t, full: base.t <= target }
}

function formatDelta(metric, d, l) {
  if (!d) return ""
  if (metric === "ratio") return (d.delta >= 0 ? "+" : "") + fixed(d.delta, 3, l)
  return (d.delta >= 0 ? "+" : "") + formatBytes(d.delta, 1, l)
}

// --- Bar label ------------------------------------------------------------------
//
// A Python-style template, as in Dockarchy: `{key}` is replaced, `{{`/`}}` are
// literal braces, keys are case-insensitive and may carry spaces (`{ up }`),
// unknown keys are left as typed so a typo shows. Anything else is free text,
// so "↑{up} · {ratio} ({ratio7d})" composes several values.
var BAR_KEYS = [
  "up", "down", "ratio", "credit", "buffer",
  "rate", "downrate",
  "up24h", "up7d", "up30d", "down24h", "down7d", "down30d", "ratio24h", "ratio7d", "ratio30d",
  "next", "nexteta", "goal", "ratiogoal", "user"
]
var BAR_ALIASES = { upload: "up", ul: "up", download: "down", dl: "down", bonus: "credit", uprate: "rate" }
// The bar is a pill, not a paragraph: a runaway template is cut here.
var MAX_BAR_CHARS = 160

function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key) }

// Compact time-to-target for the bar: "7 weeks", "✓" once there, "∞" if the
// current pace never gets there, "" when there is no pace yet.
function barEta(when, lastT, now, l) {
  if (when === undefined) return ""
  if (when === null) return tr(l, "goalNever")
  if (when <= lastT) return tr(l, "goalReached")
  return formatDuration(when - now, l)
}

// ctx: {samples, now, rates, user, uploadGoal (bytes), ratioGoal}
function barValues(ctx, l) {
  var samples = ctx.samples || []
  var last = samples.length ? samples[samples.length - 1] : null
  if (!last) return null
  var r = ctx.rates || null
  var now = ctx.now || last.t
  function gain(metric, days) { return formatDelta(metric, deltaOver(samples, metric, now, days), l) }
  function eta(metric, target) {
    if (!(target > 0)) return ""
    if (!r) return valueOf(last, metric) >= target ? tr(l, "goalReached") : ""
    return barEta(timeToReach(last, r, metric, target), last.t, now, l)
  }
  var next = uploadMilestones(last.up, 1)[0]
  return {
    up: formatBytes(last.up, undefined, l),
    down: formatBytes(last.down, undefined, l),
    ratio: formatRatio(ratioOf(last), l),
    credit: formatBytes(last.credit || 0, undefined, l),
    buffer: formatBytes(Math.max(0, last.up - last.down), undefined, l),
    rate: r ? formatRate(r.up, l) : "",
    downrate: r ? formatRate(r.down, l) : "",
    up24h: gain("up", 1), up7d: gain("up", 7), up30d: gain("up", 30),
    down24h: gain("down", 1), down7d: gain("down", 7), down30d: gain("down", 30),
    ratio24h: gain("ratio", 1), ratio7d: gain("ratio", 7), ratio30d: gain("ratio", 30),
    next: formatBytes(next, next >= Math.pow(1024, 4) ? 1 : 0, l),
    nexteta: eta("up", next),
    goal: eta("up", ctx.uploadGoal),
    ratiogoal: eta("ratio", ctx.ratioGoal),
    user: ctx.user && ctx.user.username ? String(ctx.user.username) : ""
  }
}

function formatBar(template, ctx, l) {
  var values = barValues(ctx || {}, l)
  if (!values) return ""
  var out = String(template || "")
    .replace(/\{\{/g, "\u0001").replace(/\}\}/g, "\u0002")
    .replace(/\{\s*([a-zA-Z0-9_]+)\s*\}/g, function(match, name) {
      var key = name.toLowerCase()
      if (own(BAR_ALIASES, key)) key = BAR_ALIASES[key]
      return own(values, key) ? values[key] : match
    })
    .replace(/\u0001/g, "{").replace(/\u0002/g, "}")
    .replace(/\s+/g, " ")
    .trim()
  return out.length > MAX_BAR_CHARS ? out.slice(0, MAX_BAR_CHARS - 1) + "…" : out
}

// --- What-if forecasts --------------------------------------------------------

// Panel tiles, left to right: ratio sits in the middle.
var TILE_ORDER = ["up", "ratio", "down"]

var UNIT_POWERS = {
  b: 0, o: 0,
  k: 1, kb: 1, kib: 1, ko: 1,
  m: 2, mb: 2, mib: 2, mo: 2,
  g: 3, gb: 3, gib: 3, go: 3,
  t: 4, tb: 4, tib: 4, to: 4,
  p: 5, pb: 5, pib: 5, po: 5
}
var MAX_TARGET_BYTES = 1e21
var MAX_SHOWN_CEILING = 1000
var MAX_TARGET_RATIO = 1e6

function ratioTarget(n, l) {
  return { metric: "ratio", value: n, text: tr(l, "targetRatioText", [formatRatio(n, l)]) }
}

function uploadTarget(bytes, l) {
  return { metric: "up", value: bytes, text: formatBytes(bytes, bytes >= Math.pow(1024, 4) ? 2 : 1, l) }
}

// What the what-if field asks, as a list of targets:
//   "10 TB", "850gb", "1,5 To"  -> upload (any unit, English or French)
//   "ratio 5", "r 2,5", "5x"    -> ratio
//   "5"                         -> both: 5 TB of upload and a ratio of 5, since
//                                  a bare number could mean either
// Result: {targets: [...]} (one or two), {empty: true} or {error}.
var MAX_TARGET_CHARS = 64

function parseTargets(text, l) {
  var src = String(text || "").trim().toLowerCase()
  if (src === "") return { empty: true }
  if (src.length > MAX_TARGET_CHARS) return { error: tr(l, "targetHint") }
  var m = /^(ratio|r)?\s*([0-9]+(?:[.,][0-9]+)?)\s*([a-z]*)$/.exec(src)
  if (!m) return { error: tr(l, "targetHint") }
  var n = parseFloat(m[2].replace(",", "."))
  var prefix = m[1] !== undefined && m[1] !== ""
  var unit = m[3]
  if (!(n > 0) || !isFinite(n)) return { error: tr(l, "targetAboveZero") }
  var asRatio = prefix || unit === "x"
  if (prefix && unit !== "" && unit !== "x") return { error: tr(l, "targetRatioUnit") }
  if (asRatio) {
    if (n > MAX_TARGET_RATIO) return { error: tr(l, "targetRatioRange") }
    return { targets: [ratioTarget(n, l)] }
  }
  if (unit !== "") {
    if (!(unit in UNIT_POWERS)) return { error: tr(l, "targetUnknownUnit", [unit]) }
    var bytes = n * Math.pow(1024, UNIT_POWERS[unit])
    if (bytes > MAX_TARGET_BYTES) return { error: tr(l, "targetAmountRange") }
    return { targets: [uploadTarget(bytes, l)] }
  }
  // Bare number: answer both readings that make sense.
  var targets = []
  var tb = n * Math.pow(1024, 4)
  if (tb <= MAX_TARGET_BYTES) targets.push(uploadTarget(tb, l))
  if (n <= MAX_TARGET_RATIO) targets.push(ratioTarget(n, l))
  if (targets.length === 0) return { error: tr(l, "targetAmountRange") }
  return { targets: targets }
}

// Single-target shorthand: the first reading, or the {empty}/{error} result.
function parseTarget(text, l) {
  var r = parseTargets(text, l)
  return r.targets ? r.targets[0] : r
}

// First recorded sample at or above `value` for a cumulative counter.
function firstReached(samples, metric, value) {
  for (var i = 0; i < samples.length; i++) if (samples[i][metric] >= value) return samples[i]
  return null
}

// Solve one target against the current pace. Result:
//   {status: "eta", when, direction: "rise"|"fall", ...}
//   {status: "reached", when (null = before the first reading), ...}
//   {status: "never", reason: "no-upload"|"not-rising"|"ceiling"|"floor"}
//   {status: "no-pace"} / {status: "no-data"}
// Every result carries `current` and, when known, `rates` and `ceiling` (the
// ratio the current pace converges to).
function simulate(samples, now, windowDays, target) {
  var last = samples.length ? samples[samples.length - 1] : null
  if (!last) return { status: "no-data", target: target }
  var r = rates(samples, now, windowDays)
  var out = { target: target, rates: r, last: last, current: valueOf(last, target.metric) }

  if (target.metric === "up") {
    if (last.up >= target.value) {
      var hit = firstReached(samples, "up", target.value)
      out.status = "reached"
      out.when = hit && hit !== samples[0] ? hit.t : null
      return out
    }
    if (!r) { out.status = "no-pace"; return out }
    if (!(r.up > 0)) { out.status = "never"; out.reason = "no-upload"; return out }
    out.status = "eta"
    out.direction = "rise"
    out.when = last.t + (target.value - last.up) / r.up * DAY
    return out
  }

  // Ratio. With U, D the counters and a, b the daily paces:
  //   ratio(d) = (U + a·d) / (D + b·d), which moves monotonically towards a/b.
  var U = last.up, D = last.down, R = target.value
  var cur = D > 0 ? U / D : null  // null: nothing downloaded, ratio is infinite
  if (!r) {
    if (cur === null || Math.abs(cur - R) < 0.005) { out.status = "reached"; out.when = last.t; return out }
    out.status = "no-pace"
    return out
  }
  var a = r.up, b = r.down
  out.ceiling = b > 0 ? a / b : null
  // Sign of d(ratio)/dt: positive = rising.
  var trend = cur === null ? (b > 0 ? -1 : 0) : a * D - U * b
  var above = cur === null || cur >= R
  if (above && trend >= 0) { out.status = "reached"; out.when = last.t; return out }
  if (!above && trend <= 0) { out.status = "never"; out.reason = "not-rising"; return out }
  var den = a - R * b
  var d = den !== 0 ? (R * D - U) / den : Infinity
  if (!(d > 0) || !isFinite(d)) {
    out.status = "never"
    // The ratio moves towards a/b and stops short of the target: a ceiling
    // when climbing, a floor when falling.
    out.reason = above ? "floor" : "ceiling"
    return out
  }
  out.status = "eta"
  out.direction = above ? "fall" : "rise"
  out.when = last.t + d * DAY
  return out
}

// {headline, detail} for a simulate() result, as the panel shows it.
function describeSimulation(sim, now, windowDays, l) {
  var t = sim.target
  var amount = t.metric === "ratio" ? formatRatio(t.value, l) : formatBytes(t.value, t.value >= Math.pow(1024, 4) ? 2 : 1, l)
  var what = t.metric === "ratio" ? tr(l, "simRatio", [amount]) : tr(l, "simUp", [amount])
  var pace = ""
  if (sim.rates) {
    var speed = t.metric === "ratio"
      ? tr(l, "simRatioPace", [formatRate(sim.rates.up, l), formatRate(sim.rates.down, l)])
      : formatRate(sim.rates.up, l)
    pace = sim.rates.partial
      ? tr(l, "simPaceLast", [speed, formatDuration(sim.rates.spanDays * DAY, l)])
      : tr(l, "simPaceDays", [speed, windowDays])
  }
  // A ceiling in the thousands says "unbounded" better by being left out.
  var ceiling = sim.ceiling !== null && sim.ceiling !== undefined && sim.ceiling <= MAX_SHOWN_CEILING
    ? tr(l, "simCeiling", [formatRatio(sim.ceiling, l)]) : ""
  switch (sim.status) {
  case "no-data":
    return { headline: tr(l, "simNoDataHead"), detail: tr(l, "simNoDataDetail") }
  case "no-pace":
    return { headline: tr(l, "simNoPaceHead"), detail: tr(l, "paceNeedHour") }
  case "reached":
    if (t.metric === "ratio")
      return { headline: tr(l, "simAlready", [what]), detail: tr(l, "simRatioHolding", [formatRatio(sim.current, l)]) }
    return {
      headline: tr(l, "simAlready", [what]),
      detail: sim.when === null ? tr(l, "simBeforeFirst") : tr(l, "simCrossed", [formatDate(sim.when, l)])
    }
  case "eta":
    var head = t.metric === "ratio" && sim.direction === "fall"
      ? tr(l, "simFall", [amount, formatIn(sim.when - now, l)])
      : tr(l, "simEta", [what, formatIn(sim.when - now, l)])
    var detail = tr(l, "simAround", [formatDate(sim.when, l), pace])
    if (t.metric === "ratio" && sim.direction === "rise" && ceiling) detail += " " + ceiling
    if (t.metric === "ratio" && sim.direction === "fall") detail += " " + tr(l, "simFallNote")
    return { headline: head, detail: detail }
  case "never":
    var why = {
      "no-upload": tr(l, "simWhyNoUpload", [windowDays]),
      "not-rising": tr(l, "simWhyNotRising", [pace]),
      "ceiling": ceiling || tr(l, "simWhyCeiling"),
      "floor": tr(l, "simWhyFloor", [formatRatio(sim.ceiling, l)])
    }[sim.reason]
    return { headline: tr(l, "simOut", [what]), detail: why }
  }
  return { headline: "", detail: "" }
}

// Everything the QML needs in one object: strings (`t`), names, and the
// formatters bound to this locale. Bindings that read it re-evaluate when the
// language setting changes, so the switch is live.
function locale(lang) {
  var L = LOCALES[lang] || EN
  return {
    code: L.code,
    t: L.t,
    metricNames: L.metricNames,
    rangeLabel: function(key) { return L.rangeLabels[key] || key },
    tr: function(key, args) { return tr(L, key, args) },
    bytes: function(b, d) { return formatBytes(b, d, L) },
    rate: function(v) { return formatRate(v, L) },
    ratio: function(v) { return formatRatio(v, L) },
    metric: function(m, v) { return formatMetric(m, v, L) },
    delta: function(m, d) { return formatDelta(m, d, L) },
    date: function(t) { return formatDate(t, L) },
    shortDate: function(t, now) { return formatShortDate(t, now, L) },
    dateTime: function(t) { return formatDateTime(t, L) },
    axis: function(t, span) { return formatAxis(t, span, L) },
    duration: function(s) { return formatDuration(s, L) },
    inTime: function(s) { return formatIn(s, L) },
    ago: function(s) { return formatAgo(s, L) },
    bar: function(template, ctx) { return formatBar(template, ctx, L) },
    target: function(text) { return parseTarget(text, L) },
    targets: function(text) { return parseTargets(text, L) },
    describe: function(sim, now, days) { return describeSimulation(sim, now, days, L) },
    forecast: function(samples, now, opts) { opts = opts || {}; opts.loc = L; return forecast(samples, now, opts) }
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    DAY: DAY, METRICS: METRICS, RANGES: RANGES, EN: EN, FR: FR, LOCALES: LOCALES, LANGUAGES: LANGUAGES,
    resolveLanguage: resolveLanguage, locale: locale, tr: tr, fill: fill, BAR_KEYS: BAR_KEYS, BAR_ALIASES: BAR_ALIASES, barValues: barValues,
    formatBytes: formatBytes, formatRate: formatRate, formatRatio: formatRatio, formatDate: formatDate,
    formatDateTime: formatDateTime, formatShortDate: formatShortDate, formatAxis: formatAxis, formatIn: formatIn, formatAgo: formatAgo,
    parseHistory: parseHistory, MAX_HISTORY_CHARS: MAX_HISTORY_CHARS, goodNumber: goodNumber, ratioOf: ratioOf, valueOf: valueOf, since: since, slope: slope, rates: rates,
    projectAt: projectAt, timeToReach: timeToReach, niceStep: niceStep, nextRound: nextRound,
    uploadMilestones: uploadMilestones, ratioMilestones: ratioMilestones, forecast: forecast,
    downsample: downsample, chartModel: chartModel, nearest: nearest, formatMetric: formatMetric,
    deltaOver: deltaOver, formatDelta: formatDelta, formatBar: formatBar, formatDuration: formatDuration,
    TILE_ORDER: TILE_ORDER, parseTarget: parseTarget, parseTargets: parseTargets,
    MAX_BAR_CHARS: MAX_BAR_CHARS, MIN_PACE: MIN_PACE, MAX_SHOWN_CEILING: MAX_SHOWN_CEILING, MAX_TARGET_CHARS: MAX_TARGET_CHARS, firstReached: firstReached, simulate: simulate,
    describeSimulation: describeSimulation
  }
}
