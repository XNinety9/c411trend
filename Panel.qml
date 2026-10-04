import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "x99.c411trend"
  ipcTarget: "x99.c411trend"
  manageIpc: false

  property string metric: "up"
  property int rangeIndex: Math.max(0, rangeKeys().indexOf(String(setting("defaultRange", "30d"))))
  readonly property var range: Model.RANGES[rangeIndex]

  function rangeKeys() { return Model.RANGES.map(function(r) { return r.key }) }

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color accent: Color.accent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property color warning: blend(foreground, urgent, 0.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property color hoverFill: bar ? Style.hoverFillFor(bar.foreground, Color.accent) : "transparent"
  readonly property color tileFill: Util.alpha(foreground, 0.05)
  readonly property int panelWidth: svc.intSetting("panelWidth", 672, 380, 1400)

  // "Auto" follows the session's locale (LC_ALL, then LC_MESSAGES, then LANG).
  readonly property string lang: Model.resolveLanguage(setting("language", "Auto"),
    Quickshell.env("LC_ALL") || Quickshell.env("LC_MESSAGES") || Quickshell.env("LANG"))
  readonly property var i18n: Model.locale(lang)

  function blend(a, b, t) {
    return Qt.rgba(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, 1)
  }

  readonly property string barFormat: String(svc.setting("barFormat", "{ratio}"))
  readonly property string barLabel: root.i18n.bar(barFormat, {
    samples: svc.samples, now: svc.now, rates: svc.rates, user: svc.user,
    uploadGoal: svc.uploadTargetTo * Math.pow(1024, 4), ratioGoal: svc.ratioTarget
  })
  readonly property var chart: Model.chartModel(svc.samples, metric, range.days, svc.now, svc.rates, 240)

  readonly property string heroMeta: {
    var who = svc.user && svc.user.username ? svc.user.username + " · " : ""
    if (svc.source && svc.source.label) who += svc.source.label + (svc.source.profile && svc.source.profile !== "Default" && svc.source.profile !== "default" ? " (" + svc.source.profile + ")" : "") + " · "
    if (svc.fetching && !svc.last) return who + root.i18n.t.fetching
    if (svc.lastFetchAt > 0) return who + root.i18n.tr("updated", [root.i18n.ago(svc.now - svc.lastFetchAt)])
    if (svc.last) return who + root.i18n.tr("lastReading", [root.i18n.ago(svc.now - svc.last.t)])
    return who + root.i18n.t.noReading
  }

  readonly property string paceText: {
    var r = svc.rates
    if (!r) return root.i18n.t.paceNeedHour
    var span = r.partial ? root.i18n.tr("paceOverPartial", [root.i18n.duration(r.spanDays * Model.DAY)])
                         : root.i18n.tr("paceOver", [svc.forecastWindowDays])
    return root.i18n.tr("pace", [span, root.i18n.rate(r.up), root.i18n.rate(r.down)])
  }

  // A tracker-side drop of the counters inside the pace window: paces ignore
  // it (Model.continuous), and this says so. The most recent one, or null.
  readonly property var paceReset: {
    var r = Model.resets(Model.since(svc.samples, svc.now - svc.forecastWindowDays * Model.DAY))
    return r.length ? r[r.length - 1] : null
  }
  readonly property string resetText: paceReset
    ? root.i18n.tr("resetNote", [root.i18n.shortDate(paceReset.t, svc.now),
        root.i18n.metricNames[paceReset.metric].toLowerCase() + " −" + root.i18n.bytes(paceReset.drop, 1)])
    : ""

  // Pace per calendar day over the pace window, starting at the first day
  // that has readings (leading empty days would only squeeze the bars).
  readonly property var paceDays: {
    var all = Model.dailyPace(svc.samples, svc.now, svc.forecastWindowDays)
    var i = 0
    while (i < all.length && all[i].up === null) i++
    return all.slice(i)
  }

  // What-if: the target typed in the panel, and how the current pace meets it.
  // A bare number is read both ways (TB and ratio), so there is no mode to pick.
  // Kept in shell.json, so bounded like the field that edits it.
  property string simQuery: String(setting("simQuery", "")).slice(0, Model.MAX_TARGET_CHARS)
  readonly property var simParsed: root.i18n.targets(simQuery)
  readonly property var simResults: simParsed.targets ? answers(simParsed.targets) : []

  function answers(targets) {
    var out = []
    for (var i = 0; i < targets.length; i++)
      out.push(root.i18n.describe(Model.simulate(svc.samples, svc.now, svc.forecastWindowDays, targets[i]), svc.now, svc.forecastWindowDays))
    return out
  }

  // Merge a patch into this widget's shell.json entry, so the last what-if
  // survives restarts; `settings` flows back in unchanged.
  function persist(patch) {
    if (!root.bar || !root.bar.shell || typeof root.bar.shell.updateEntryInline !== "function") return
    var entry = { id: root.moduleName }
    for (var key in root.settings) if (key !== "id") entry[key] = root.settings[key]
    for (var k in patch) entry[k] = patch[k]
    root.bar.shell.updateEntryInline(root.moduleName, entry)
  }

  function commitSim() {
    persist({ simQuery: simQuery })
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function focusSim() {
    simField.forceActiveFocus()
    simField.selectAll()
  }

  function setMetric(m) { metric = m }
  // j/k walk the tiles in the order they are drawn.
  function cycleMetric(step) {
    var order = Model.TILE_ORDER
    var i = order.indexOf(metric)
    metric = order[(i + step + order.length) % order.length]
  }
  function cycleRange(step) {
    rangeIndex = (rangeIndex + step + Model.RANGES.length) % Model.RANGES.length
  }

  function whenText(row) {
    if (row.when === null) return root.i18n.t.outOfReach
    if (svc.last && row.when <= svc.last.t) return root.i18n.t.reached
    return root.i18n.date(row.when) + " (" + root.i18n.inTime(row.when - svc.now) + ")"
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onOpenedChanged: if (opened) {
    svc.refreshIfStale()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  Service {
    id: svc
    settings: root.settings
    i18n: root.i18n
  }

  IpcHandler {
    target: root.ipcTarget
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): string { svc.refresh(); return "ok" }
    function status(): string { return svc.summaryText }
    function version(): string { return "1.1.1" }
    function samples(): string { return String(svc.samples.length) }
    function forecast(): string {
      var f = svc.forecast
      if (!f.rates) return root.i18n.t.ipcNoHistory
      var out = [root.paceText]
      for (var i = 0; i < f.upload.length; i++) out.push("upload " + f.upload[i].text + ": " + root.whenText(f.upload[i]))
      for (var j = 0; j < f.ratio.length; j++) out.push("ratio " + f.ratio[j].text + ": " + root.whenText(f.ratio[j]))
      return out.join("\n")
    }
    // omarchy-shell x99.c411trend when "10 TB" | "ratio 5"  (a bare number is TB)
    function when(query: string): string {
      var parsed = root.i18n.targets(query)
      if (parsed.empty) return root.i18n.t.ipcUsage
      if (parsed.error) return parsed.error
      return root.answers(parsed.targets).map(function(d) { return d.headline + "\n" + d.detail }).join("\n\n")
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    active: !svc.healthy
    activeColor: root.warning
    text: root.barLabel !== "" && !vertical ? "󰕒 " + root.barLabel : "󰕒"
    slotSize: vertical ? Style.bar.iconSlot : Math.max(Style.bar.iconSlot, button.glyphPaintedWidth + Style.space(14))
    tooltipText: svc.summaryText
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.MiddleButton) svc.refresh()
      else if (buttonCode === Qt.RightButton) Quickshell.execDetached(["xdg-open", "https://c411.org/"])
      else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(root.panelWidth))
    contentHeight: panel.fittedContentHeight(content.implicitHeight, Style.space(900))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      // Typing in the what-if field must reach the field, not the shortcuts.
      blocked: simField.activeFocus
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onMoveRequested: function(dx, dy) {
        if (dx !== 0) root.cycleRange(dx)
        else root.cycleMetric(dy)
      }
      onTextKey: function(t) {
        if (t === "u") root.setMetric("up")
        else if (t === "d") root.setMetric("down")
        else if (t === "r") root.setMetric("ratio")
        else if (t === "R") svc.refresh()
        else if (t === "o") Quickshell.execDetached(["xdg-open", "https://c411.org/"])
        else if (t === "f" || t === "/") root.focusSim()
        else if (t >= "1" && t <= String(Model.RANGES.length)) root.rangeIndex = parseInt(t, 10) - 1
      }

      ColumnLayout {
        id: content
        anchors.left: parent.left
        anchors.right: parent.right
        spacing: Style.space(12)

        PanelHero {
          Layout.fillWidth: true
          title: "C411"
          meta: root.heroMeta
          foreground: root.foreground
          fontFamily: root.fontFamily
          iconOpacity: svc.last ? 1.0 : 0.5
          iconComponent: Component {
            Text {
              textFormat: Text.PlainText
              text: "󰕒"
              color: svc.healthy ? root.foreground : root.warning
              font.family: root.fontFamily
              font.pixelSize: Style.font.display
            }
          }
        }

        // Fetch problems: say what broke and what to do about it.
        Rectangle {
          Layout.fillWidth: true
          visible: svc.lastError !== ""
          color: Util.alpha(root.urgent, 0.12)
          radius: Style.cornerRadius
          implicitHeight: errorText.implicitHeight + Style.space(16)
          Text {
            textFormat: Text.PlainText
            id: errorText
            anchors.fill: parent
            anchors.margins: Style.space(8)
            text: svc.lastError + (svc.errorKind === "expired" || svc.errorKind === "no-cookie"
              ? "\n" + root.i18n.t.loginHint : "")
            color: root.warning
            wrapMode: Text.Wrap
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
          }
        }

        // Upload / Ratio / Download tiles; the selected one drives the chart.
        RowLayout {
          Layout.fillWidth: true
          spacing: Style.space(8)
          Repeater {
            model: Model.TILE_ORDER
            delegate: StatTile {
              required property string modelData
              Layout.fillWidth: true
              Layout.preferredWidth: 1
              metricKey: modelData
            }
          }
        }

        // Range selector.
        RowLayout {
          Layout.fillWidth: true
          spacing: Style.space(4)
          Text {
            textFormat: Text.PlainText
            text: root.i18n.metricNames[root.metric]
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
            font.bold: true
          }
          Item { Layout.fillWidth: true }
          Repeater {
            model: Model.RANGES.length
            delegate: Rectangle {
              required property int index
              readonly property bool current: index === root.rangeIndex
              implicitWidth: rangeLabel.implicitWidth + Style.space(14)
              implicitHeight: rangeLabel.implicitHeight + Style.space(6)
              radius: Style.cornerRadius
              color: current ? Util.alpha(root.accent, 0.22) : rangeMouse.containsMouse ? root.hoverFill : "transparent"
              Text {
                textFormat: Text.PlainText
                id: rangeLabel
                anchors.centerIn: parent
                text: root.i18n.rangeLabel(Model.RANGES[parent.index].key)
                color: parent.current ? root.foreground : root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
              }
              MouseArea {
                id: rangeMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.rangeIndex = parent.index
              }
            }
          }
        }

        Chart {
          id: chartView
          Layout.fillWidth: true
          Layout.preferredHeight: Style.space(190)
          model: root.chart
        }

        PanelSeparator { Layout.fillWidth: true }

        PanelSectionHeader {
          text: root.i18n.t.forecast
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        Text {
          textFormat: Text.PlainText
          Layout.fillWidth: true
          text: root.paceText
          color: root.dim
          wrapMode: Text.Wrap
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }

        Text {
          Layout.fillWidth: true
          visible: root.resetText !== ""
          textFormat: Text.PlainText
          text: root.resetText
          color: root.warning
          wrapMode: Text.Wrap
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }

        PaceChart {
          Layout.fillWidth: true
          Layout.preferredHeight: Style.space(70)
          visible: root.paceDays.length >= 2
          days: root.paceDays
          average: svc.rates ? svc.rates.up : 0
        }

        GridLayout {
          Layout.fillWidth: true
          visible: svc.forecast.rates !== null
          columns: 2
          columnSpacing: Style.space(12)
          rowSpacing: Style.space(4)

          Repeater {
            model: svc.forecast.upload.concat(svc.forecast.ratio)
            delegate: ForecastRow {
              required property var modelData
              row: modelData
            }
          }
        }

        // Where the counters land 30 / 90 / 365 days out.
        GridLayout {
          Layout.fillWidth: true
          Layout.topMargin: Style.space(4)
          visible: svc.forecast.horizons.length > 0
          columns: 4
          columnSpacing: Style.space(12)
          rowSpacing: Style.space(2)

          Repeater {
            model: ["", "↑ Upload", "↓ Download", "Ratio"]
            delegate: Text {
              textFormat: Text.PlainText
              required property string modelData
              text: modelData
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }
          Repeater {
            model: svc.forecast.horizons.length * 4
            delegate: Text {
              textFormat: Text.PlainText
              required property int index
              readonly property var h: svc.forecast.horizons[Math.floor(index / 4)]
              readonly property int col: index % 4
              Layout.fillWidth: col > 0
              text: col === 0 ? root.i18n.tr("horizonRow", [h.days, root.i18n.date(h.t)])
                  : col === 1 ? root.i18n.bytes(h.up)
                  : col === 2 ? root.i18n.bytes(h.down)
                  : root.i18n.ratio(h.ratio)
              color: col === 0 ? root.dim : root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
            }
          }
        }

        PanelSeparator { Layout.fillWidth: true }

        PanelSectionHeader {
          text: root.i18n.t.whatIf
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        // The answer updates as you type; Enter keeps the question for next time.
        TextField {
          id: simField
          Layout.fillWidth: true
          text: root.simQuery
          maximumLength: Model.MAX_TARGET_CHARS
          placeholderText: root.i18n.t.placeholderTarget
          onTextEdited: root.simQuery = text
          onAccepted: root.commitSim()
          Keys.onEscapePressed: function(event) {
            event.accepted = true
            root.commitSim()
          }
        }

        Text {
          Layout.fillWidth: true
          visible: root.simParsed.empty === true
          textFormat: Text.PlainText
          text: root.i18n.t.whatIfHint
          color: root.dim
          wrapMode: Text.Wrap
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }

        Text {
          Layout.fillWidth: true
          visible: root.simParsed.error !== undefined
          textFormat: Text.PlainText
          text: root.simParsed.error || ""
          color: root.warning
          wrapMode: Text.Wrap
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
        }

        // One answer, or two for a bare number (as TB, then as a ratio).
        Repeater {
          model: root.simResults
          delegate: Column {
            required property var modelData
            Layout.fillWidth: true
            spacing: Style.space(2)
            Text {
              width: parent.width
              textFormat: Text.PlainText
              text: parent.modelData.headline
              color: root.foreground
              wrapMode: Text.Wrap
              font.family: root.fontFamily
              font.pixelSize: Style.font.subtitle
              font.bold: true
            }
            Text {
              width: parent.width
              textFormat: Text.PlainText
              text: parent.modelData.detail
              color: root.dim
              wrapMode: Text.Wrap
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }
        }

        Text {
          textFormat: Text.PlainText
          Layout.fillWidth: true
          Layout.topMargin: Style.space(4)
          text: simField.activeFocus
            ? root.i18n.t.footerField
            : root.i18n.tr("footer", [svc.samples.length])
          color: root.dim
          elide: Text.ElideRight
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }
  }

  component StatTile: Rectangle {
    id: tile
    property string metricKey: "up"
    readonly property bool current: root.metric === metricKey
    readonly property var delta: Model.deltaOver(svc.samples, metricKey, svc.now, 7)
    implicitHeight: tileColumn.implicitHeight + Style.space(16)
    radius: Style.cornerRadius
    color: tileMouse.containsMouse && !current ? root.hoverFill : root.tileFill
    border.width: current ? Math.max(1, Style.space(2)) : 0
    border.color: root.accent

    Column {
      id: tileColumn
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(10)
      anchors.rightMargin: Style.space(10)
      spacing: Style.space(2)
      Text {
        textFormat: Text.PlainText
        text: (tile.metricKey === "up" ? "↑ " : tile.metricKey === "down" ? "↓ " : "") + root.i18n.metricNames[tile.metricKey]
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: svc.last ? root.i18n.metric(tile.metricKey, Model.valueOf(svc.last, tile.metricKey)) : "—"
        color: tile.metricKey === "ratio" && svc.user && svc.user.canDownload === false ? root.warning : root.foreground
        elide: Text.ElideRight
        font.family: root.fontFamily
        font.pixelSize: Style.font.heading
        font.bold: true
      }
      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: !tile.delta ? " "
          : tile.delta.full ? root.i18n.tr("in7days", [root.i18n.delta(tile.metricKey, tile.delta)])
          : root.i18n.tr("since", [root.i18n.delta(tile.metricKey, tile.delta), root.i18n.shortDate(tile.delta.from, svc.now)])
        color: root.dim
        elide: Text.ElideRight
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }

    MouseArea {
      id: tileMouse
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: root.setMetric(tile.metricKey)
    }
  }

  // Daily pace as bars (upload in the accent colour, download narrow and dim),
  // the forecast pace as a dashed line; hovering a day shows its figures.
  component PaceChart: Item {
    id: pc
    property var days: []
    property real average: 0
    property int hovered: -1
    readonly property real plotH: Math.max(1, height - caption.implicitHeight - Style.space(4))
    readonly property real maxV: {
      var m = average
      for (var i = 0; i < days.length; i++)
        if (days[i].up !== null) m = Math.max(m, days[i].up, days[i].down)
      return m > 0 ? m * 1.1 : 1
    }
    readonly property var hoveredDay: hovered >= 0 && hovered < days.length ? days[hovered] : null

    onDaysChanged: canvas.requestPaint()
    onAverageChanged: canvas.requestPaint()
    onHoveredChanged: canvas.requestPaint()
    onWidthChanged: canvas.requestPaint()
    onPlotHChanged: canvas.requestPaint()

    Canvas {
      id: canvas
      width: parent.width
      height: pc.plotH
      antialiasing: true
      onPaint: {
        var ctx = getContext("2d")
        ctx.reset()
        var n = pc.days.length
        if (n === 0) return
        var W = width, H = height - 1, slot = W / n
        var fg = root.foreground, ac = root.accent
        function y(v) { return H - v / pc.maxV * H }

        ctx.strokeStyle = Qt.rgba(fg.r, fg.g, fg.b, 0.12)
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(0, H + 0.5); ctx.lineTo(W, H + 0.5); ctx.stroke()

        for (var i = 0; i < n; i++) {
          var d = pc.days[i]
          if (d.up === null) continue
          var hot = i === pc.hovered
          // Bars stay slim when there are only a few days: capped, centred.
          var upW = Math.min(slot * 0.5, Style.space(24))
          var downW = Math.min(slot * 0.17, Style.space(8))
          var gap = Math.min(slot * 0.03, Style.space(2))
          var x = i * slot + (slot - upW - (d.down > 0 ? gap + downW : 0)) / 2
          ctx.fillStyle = Qt.rgba(ac.r, ac.g, ac.b, hot ? 1 : 0.7)
          ctx.fillRect(x, y(d.up), upW, H - y(d.up))
          if (d.down > 0) {
            ctx.fillStyle = Qt.rgba(fg.r, fg.g, fg.b, hot ? 0.7 : 0.4)
            ctx.fillRect(x + upW + gap, y(d.down), downW, H - y(d.down))
          }
        }

        // Forecast pace (the regression the forecasts use), dashed by hand
        // (Canvas setLineDash is unreliable in Qt).
        if (pc.average > 0) {
          var ay = Math.round(y(pc.average)) + 0.5
          var dash = Style.space(4), gap = Style.space(3)
          ctx.strokeStyle = Qt.rgba(fg.r, fg.g, fg.b, 0.55)
          ctx.lineWidth = 1
          for (var dx = 0; dx < W; dx += dash + gap) {
            ctx.beginPath(); ctx.moveTo(dx, ay); ctx.lineTo(Math.min(W, dx + dash), ay); ctx.stroke()
          }
        }
      }
    }

    MouseArea {
      width: parent.width
      height: pc.plotH
      hoverEnabled: true
      onPositionChanged: function(mouse) {
        var n = Math.max(1, pc.days.length)
        pc.hovered = Math.max(0, Math.min(n - 1, Math.floor(mouse.x / (width / n))))
      }
      onExited: pc.hovered = -1
    }

    Text {
      id: caption
      anchors.bottom: parent.bottom
      width: parent.width
      textFormat: Text.PlainText
      elide: Text.ElideRight
      color: pc.hoveredDay ? root.foreground : root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      text: {
        var i18n = root.i18n
        if (pc.hoveredDay) {
          var day = i18n.shortDate(pc.hoveredDay.t, svc.now)
          return pc.hoveredDay.up === null ? i18n.tr("paceDayNone", [day])
            : i18n.tr("paceDay", [day, i18n.rate(pc.hoveredDay.up), i18n.rate(pc.hoveredDay.down)])
        }
        if (pc.days.length === 0) return ""
        return i18n.tr("paceDaily", [i18n.shortDate(pc.days[0].t, svc.now), i18n.shortDate(pc.days[pc.days.length - 1].t, svc.now)])
      }
    }
  }

  component ForecastRow: Item {
    id: frow
    property var row: null
    Layout.columnSpan: 2
    Layout.fillWidth: true
    implicitHeight: Math.max(fLabel.implicitHeight, fWhen.implicitHeight)
    Text {
      textFormat: Text.PlainText
      id: fLabel
      anchors.left: parent.left
      text: (frow.row.isRatio ? root.i18n.tr("ratioRow", [frow.row.text]) : root.i18n.tr("uploadedRow", [frow.row.text])) + (frow.row.custom ? "  ◆" : "")
      color: frow.row.custom ? root.accent : root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
    }
    Text {
      textFormat: Text.PlainText
      id: fWhen
      anchors.right: parent.right
      anchors.left: fLabel.right
      anchors.leftMargin: Style.space(12)
      horizontalAlignment: Text.AlignRight
      elide: Text.ElideLeft
      text: root.whenText(frow.row)
      color: frow.row.when === null ? root.dim : root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
    }
  }

  // History as a solid line, the linear forecast as a dashed tail, a "now"
  // marker between them, and a hover readout.
  component Chart: Item {
    id: chartItem
    property var model: null
    property var hovered: null
    readonly property real leftPad: Style.space(64)
    readonly property real bottomPad: Style.space(18)
    readonly property real plotW: Math.max(1, width - leftPad)
    readonly property real plotH: Math.max(1, height - bottomPad)

    function px(p) { return leftPad + p.x * plotW }
    function py(p) { return (1 - p.y) * plotH }

    onModelChanged: canvas.requestPaint()
    onWidthChanged: canvas.requestPaint()
    onHeightChanged: canvas.requestPaint()
    onHoveredChanged: canvas.requestPaint()

    Text {
      textFormat: Text.PlainText
      visible: !chartItem.model
      anchors.centerIn: parent
      text: svc.fetching ? root.i18n.t.fetchingTitle : root.i18n.t.noRange
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
    }

    // Y axis: max, mid, min.
    Repeater {
      model: chartItem.model ? 3 : 0
      delegate: Text {
        textFormat: Text.PlainText
        required property int index
        readonly property real frac: 1 - index / 2
        x: 0
        width: chartItem.leftPad - Style.space(8)
        y: Math.max(0, Math.min(chartItem.plotH - height, (1 - frac) * chartItem.plotH - height / 2))
        horizontalAlignment: Text.AlignRight
        text: root.i18n.metric(root.metric, chartItem.model.vMin + frac * (chartItem.model.vMax - chartItem.model.vMin))
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }

    // X axis: start, now, projection end.
    Repeater {
      model: chartItem.model ? [chartItem.model.t0, chartItem.model.lastT, chartItem.model.t1] : []
      delegate: Text {
        textFormat: Text.PlainText
        required property var modelData
        required property int index
        readonly property real fx: (modelData - chartItem.model.t0) / (chartItem.model.t1 - chartItem.model.t0)
        visible: index !== 2 || chartItem.model.t1 > chartItem.model.lastT
        y: chartItem.plotH + Style.space(3)
        x: Math.max(chartItem.leftPad, Math.min(chartItem.width - width, chartItem.leftPad + fx * chartItem.plotW - (index === 0 ? 0 : index === 2 ? width : width / 2)))
        text: index === 1 ? root.i18n.t.now : root.i18n.axis(modelData, chartItem.model.t1 - chartItem.model.t0)
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }

    Canvas {
      id: canvas
      anchors.fill: parent
      antialiasing: true
      onPaint: {
        var ctx = getContext("2d")
        ctx.reset()
        var m = chartItem.model
        if (!m) return
        var L = chartItem.leftPad, W = chartItem.plotW, H = chartItem.plotH
        var fg = root.foreground, ac = root.accent

        // Grid.
        ctx.strokeStyle = Qt.rgba(fg.r, fg.g, fg.b, 0.08)
        ctx.lineWidth = 1
        for (var g = 0; g <= 2; g++) {
          var gy = Math.round(g / 2 * (H - 1)) + 0.5
          ctx.beginPath(); ctx.moveTo(L, gy); ctx.lineTo(L + W, gy); ctx.stroke()
        }

        var hist = m.history
        if (hist.length >= 1) {
          // Area under the history.
          ctx.beginPath()
          ctx.moveTo(chartItem.px(hist[0]), H)
          for (var i = 0; i < hist.length; i++) ctx.lineTo(chartItem.px(hist[i]), chartItem.py(hist[i]))
          ctx.lineTo(chartItem.px(hist[hist.length - 1]), H)
          ctx.closePath()
          var grad = ctx.createLinearGradient(0, 0, 0, H)
          grad.addColorStop(0, Qt.rgba(ac.r, ac.g, ac.b, 0.28))
          grad.addColorStop(1, Qt.rgba(ac.r, ac.g, ac.b, 0.02))
          ctx.fillStyle = grad
          ctx.fill()

          ctx.beginPath()
          for (var j = 0; j < hist.length; j++) {
            if (j === 0) ctx.moveTo(chartItem.px(hist[j]), chartItem.py(hist[j]))
            else ctx.lineTo(chartItem.px(hist[j]), chartItem.py(hist[j]))
          }
          ctx.strokeStyle = ac
          ctx.lineWidth = 2
          ctx.lineJoin = "round"
          ctx.stroke()
        }

        // "Now" divider.
        var nx = L + (m.lastT - m.t0) / (m.t1 - m.t0) * W
        if (m.projection.length > 1) {
          ctx.strokeStyle = Qt.rgba(fg.r, fg.g, fg.b, 0.18)
          ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(Math.round(nx) + 0.5, 0); ctx.lineTo(Math.round(nx) + 0.5, H); ctx.stroke()

          // Forecast, dashed by hand (Canvas setLineDash is unreliable in Qt).
          ctx.strokeStyle = Qt.rgba(ac.r, ac.g, ac.b, 0.75)
          ctx.lineWidth = 1.6
          var dash = Style.space(5), gap = Style.space(4)
          for (var k = 1; k < m.projection.length; k++) {
            var ax = chartItem.px(m.projection[k - 1]), ay = chartItem.py(m.projection[k - 1])
            var bx = chartItem.px(m.projection[k]), by = chartItem.py(m.projection[k])
            var len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay))
            for (var d = 0; d < len; d += dash + gap) {
              var e = Math.min(len, d + dash)
              ctx.beginPath()
              ctx.moveTo(ax + (bx - ax) * d / len, ay + (by - ay) * d / len)
              ctx.lineTo(ax + (bx - ax) * e / len, ay + (by - ay) * e / len)
              ctx.stroke()
            }
          }
        }

        // Last-sample dot.
        if (hist.length) {
          var lp = hist[hist.length - 1]
          ctx.fillStyle = ac
          ctx.beginPath(); ctx.arc(chartItem.px(lp), chartItem.py(lp), Style.space(3), 0, Math.PI * 2); ctx.fill()
        }

        // Hover crosshair.
        var hv = chartItem.hovered
        if (hv) {
          ctx.strokeStyle = Qt.rgba(fg.r, fg.g, fg.b, 0.35)
          ctx.lineWidth = 1
          var hx = Math.round(chartItem.px(hv)) + 0.5
          ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, H); ctx.stroke()
          ctx.fillStyle = fg
          ctx.beginPath(); ctx.arc(chartItem.px(hv), chartItem.py(hv), Style.space(3), 0, Math.PI * 2); ctx.fill()
        }
      }
    }

    MouseArea {
      anchors.fill: parent
      anchors.leftMargin: chartItem.leftPad
      anchors.bottomMargin: chartItem.bottomPad
      hoverEnabled: true
      onPositionChanged: function(mouse) {
        if (!chartItem.model) return
        var x = mouse.x / chartItem.plotW
        var pts = chartItem.model.history.concat(chartItem.model.projection.slice(1))
        chartItem.hovered = Model.nearest(pts, x)
      }
      onExited: chartItem.hovered = null
    }

    // Hover readout.
    Rectangle {
      visible: chartItem.hovered !== null
      readonly property real hx: chartItem.hovered ? chartItem.px(chartItem.hovered) : 0
      x: Math.max(chartItem.leftPad, Math.min(chartItem.width - width, hx - width / 2))
      y: Style.space(2)
      implicitWidth: readout.implicitWidth + Style.space(12)
      implicitHeight: readout.implicitHeight + Style.space(6)
      radius: Style.cornerRadius
      color: Color.popups.background
      border.width: 1
      border.color: Util.alpha(root.foreground, 0.2)
      Text {
        textFormat: Text.PlainText
        id: readout
        anchors.centerIn: parent
        readonly property bool future: chartItem.hovered && chartItem.model && chartItem.hovered.t > chartItem.model.lastT + 1
        text: chartItem.hovered
          ? (future ? root.i18n.t.forecastHover : "") + root.i18n.dateTime(chartItem.hovered.t) + " · " + root.i18n.metric(root.metric, chartItem.hovered.v)
          : ""
        color: future ? root.dim : root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }
  }
}
