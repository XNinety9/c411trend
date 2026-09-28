import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "Model.js" as Model

// Polls C411 through bin/c411trend-fetch, which appends each sample to
// history.jsonl; the history file is the single source of truth for the
// charts and forecasts, so a shell restart loses nothing.
Item {
  id: root

  property var settings: ({})
  // Locale object from Model.locale(), set by the panel; strings and formatters.
  property var i18n: Model.locale("en")

  property var samples: []
  property var user: null
  // {browser, label, profile} of the cookie store that answered.
  property var source: null
  property bool fetching: false
  property bool everFetched: false
  property string lastError: ""
  property string errorKind: ""
  property double lastFetchAt: 0
  // Seconds since epoch, ticked once a minute so "3 min ago" stays honest.
  property double now: Date.now() / 1000

  readonly property string browser: String(setting("browser", "Auto")).toLowerCase()
  readonly property string profile: String(setting("browserProfile", ""))
  readonly property int refreshIntervalMin: intSetting("refreshIntervalMin", 30, 5, 1440)
  readonly property int forecastWindowDays: intSetting("forecastWindowDays", 14, 1, 365)
  readonly property real uploadTargetTo: numberSetting("uploadTargetTo", 0)
  readonly property real ratioTarget: numberSetting("ratioTarget", 0)

  readonly property var last: samples.length ? samples[samples.length - 1] : null
  readonly property var rates: last ? Model.rates(samples, now, forecastWindowDays) : null
  readonly property var forecast: i18n.forecast(samples, now, {
    windowDays: forecastWindowDays,
    uploadTarget: uploadTargetTo * Math.pow(1024, 4),
    ratioTarget: ratioTarget
  })
  readonly property bool healthy: lastError === ""
  readonly property string summaryText: {
    if (!last) return lastError !== "" ? lastError : (fetching ? i18n.t.fetchingTitle : i18n.t.noData)
    var s = "↑ " + i18n.bytes(last.up) + "  ↓ " + i18n.bytes(last.down) + "  ratio " + i18n.ratio(Model.ratioOf(last))
    if (rates) s += "\n" + i18n.tr("summaryPace", [i18n.rate(rates.up), i18n.duration(rates.spanDays * Model.DAY)])
    if (lastError !== "") s += "\n⚠ " + lastError
    return s
  }

  readonly property string pluginDir: {
    var url = Qt.resolvedUrl(".").toString()
    return url.replace(/^file:\/\//, "").replace(/\/$/, "")
  }
  readonly property string historyPath: (Quickshell.env("XDG_STATE_HOME") || (Quickshell.env("HOME") + "/.local/state")) + "/c411trend/history.jsonl"

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null || value === "" ? fallback : value
  }

  function intSetting(name, fallback, min, max) {
    var v = parseInt(setting(name, fallback), 10)
    if (isNaN(v)) v = fallback
    return Math.max(min, Math.min(max, v))
  }

  function numberSetting(name, fallback) {
    var v = parseFloat(String(setting(name, fallback)).replace(",", "."))
    return isNaN(v) || v < 0 ? fallback : v
  }

  // The script gives up on its own after `deadlineSec`; the watchdog below
  // only exists for a script that hangs anyway.
  readonly property int deadlineSec: 90
  property bool _timedOut: false

  function refresh() {
    if (fetchProcess.running) return
    fetching = true
    fetchProcess.command = [pluginDir + "/bin/c411trend-fetch", "--browser", browser, "--profile", profile,
      "--deadline", String(deadlineSec), "--lang", i18n.code]
    fetchProcess.running = true
    watchdog.restart()
  }

  // Opening the panel refreshes only if the data is getting stale, so the
  // tracker is not hit every time the popup is glanced at.
  function refreshIfStale() {
    if (Date.now() / 1000 - lastFetchAt > 300) refresh()
  }

  function applyResult(text, exitCode) {
    var res = null
    try { res = JSON.parse(text) } catch (e) {}
    if (!res || typeof res !== "object") {
      lastError = exitCode === 127 ? i18n.t.errPython : i18n.tr("errExit", [exitCode])
      errorKind = "internal"
      return
    }
    if (res.ok) {
      user = res.user
      source = res.source || null
      lastError = ""
      errorKind = ""
      lastFetchAt = Date.now() / 1000
      historyFile.reload()
    } else {
      lastError = res.message || res.error || i18n.t.errUnknown
      errorKind = res.error || "internal"
    }
  }

  Process {
    id: fetchProcess
    running: false
    command: []
    stdout: StdioCollector { id: fetchStdout; waitForEnd: true }
    onExited: function(exitCode) {
      root.fetching = false
      root.everFetched = true
      watchdog.stop()
      if (root._timedOut) { root._timedOut = false; return }
      root.applyResult(String(fetchStdout.text || ""), exitCode)
    }
  }

  Timer {
    id: watchdog
    interval: (root.deadlineSec + 30) * 1000
    repeat: false
    onTriggered: if (fetchProcess.running) {
      root._timedOut = true
      fetchProcess.running = false
      root.fetching = false
      root.lastError = i18n.t.errWatchdog
      root.errorKind = "internal"
    }
  }

  // An error on screen is in the old language until the next poll: poll now.
  onI18nChanged: if (lastError !== "") Qt.callLater(refresh)

  // A new browser or profile deserves an immediate try, not a 30 min wait.
  onBrowserChanged: Qt.callLater(refresh)
  onProfileChanged: Qt.callLater(refresh)

  FileView {
    id: historyFile
    path: root.historyPath
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.samples = Model.parseHistory(text())
    onLoadFailed: root.samples = []
  }

  Timer {
    interval: root.refreshIntervalMin * 60 * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  Timer {
    interval: 60 * 1000
    running: true
    repeat: true
    onTriggered: root.now = Date.now() / 1000
  }

  // `now` also moves whenever new data lands, so forecasts use fresh time.
  onSamplesChanged: now = Date.now() / 1000
}
