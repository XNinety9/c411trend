# C411 Trend

*Version française : [README.fr.md](README.fr.md).*

An Omarchy bar widget for the [C411](https://c411.org) private tracker. It
records your upload, download and ratio, charts them, and forecasts where they
are heading: *"at this pace, 15 TB uploaded on Nov 12, 2026"*. Ask it about
your own targets too: *"20 TB uploaded in 2 months"*, *"ratio 5.00 in 8 weeks"*.

![C411 Trend panel: tiles, chart with the forecast dashed past "now", forecast list and a what-if answer](preview.png)

## Install

```bash
omarchy plugin add https://github.com/XNinety9/c411trend.git --enable
```

Be logged in to c411.org in your browser. The widget finds the session by
itself (see [Browsers](#browsers)).

## Uninstall

```bash
omarchy plugin remove x99.c411trend
```

This deletes `~/.config/omarchy/plugins/x99.c411trend/` and drops the widget
from the bar. Your history stays in `~/.local/state/c411trend/` (and, with the
`File` browser setting, your pasted cookie in `~/.config/c411trend/`), so a
reinstall picks up where you left off; delete those two directories to erase
everything. The plugin never touches your browser's data.

## What you get

- **Bar pill** with your ratio, or any composition of values you like (see
  [Bar label](#bar-label)).
- **Panel** with three tiles (upload, ratio, download, each with its change over
  7 days) and a chart over 24h, 7d, 30d or everything. Hover the chart for exact
  values.
- **Forecasts**:
  - the next round upload figures and ratio steps, with the estimated date;
  - your own targets (`uploadTargetTo`, `ratioTarget`), marked ◆;
  - projected upload, download and ratio in 30, 90 and 365 days;
  - the trend continued as a dashed line past "now" on the chart.
- **What if**: type a target and read when you get there at the current pace.
  - `10 TB`, `850 GB`, `1.5 To`: an upload amount;
  - `ratio 3.5`, `r 5`, `5x`: a ratio;
  - `5`: a bare number could be either, so you get both answers, as 5 TB and
    as a ratio of 5;
  - the answer says *when* ("in 2 months, around Nov 28, 2026"), *at what
    pace*, or *why not*: already reached (with the day it was crossed), no
    recent upload, or a ratio that levels off before the target;
  - the last question is kept across restarts.

### How forecasts work

The pace is the least-squares slope of upload and of download over the last
*N* days (14 by default, `forecastWindowDays`). The projected ratio is derived
from both, `(U + a·t) / (D + b·t)`, rather than extrapolated on its own. That
is why a target above `a/b` shows as out of reach at the current pace, and why a
falling ratio can be forecast too ("ratio falls to 1.00 in 3 weeks"). Forecasts
appear once there is an hour of history; they settle as the window fills.

## Browsers

With **Browser** set to `Auto` (the default), the widget tries, in order: the
cookie store that worked last time, your default browser, then every other
browser below until one holds a live c411.org session.

| Family | Browsers | Where |
| --- | --- | --- |
| Chromium | Brave, Chrome, Chromium, Edge, Vivaldi, Opera, Thorium | native, Flatpak, Snap (Chromium) |
| Firefox | Firefox, Zen, LibreWolf, Floorp, Waterfox | native, Flatpak, Snap (Firefox), including `~/.config/mozilla` |
| Manual | any | `File`: paste the `Cookie` header into `~/.config/c411trend/cookie` |

Chromium cookies are decrypted with the browser's "Safe Storage" key from the
Secret Service (`secret-tool`), so GNOME Keyring or KWallet with the Secret
Service enabled must be unlocked. Firefox cookies are not encrypted.

`bin/c411trend-fetch --list` shows which stores would be tried, without opening
them.

## Privacy and security

The cookie is only ever sent to `https://c411.org/api/auth/me`, never written,
logged or put on a command line. The history holds numbers only. The full
details, including trust boundaries and limits, are in [SECURITY.md](SECURITY.md).

Requires `python3` and `curl`. Chromium-family browsers also need `secret-tool`
(libsecret, part of Omarchy's base) and the Python `cryptography` module, which
is not always installed: `omarchy pkg add python-cryptography` if the panel
says it is missing. Firefox-family browsers and `File` mode need neither.

## Use

| Action | Effect |
| --- | --- |
| click | open the panel |
| middle click | poll now |
| right click | open c411.org |
| `u` / `r` / `d`, `j` / `k` | chart metric |
| `1`–`4`, `h` / `l` | range: 24 h, 7 d, 30 d, all |
| `R` | poll now |
| `o` | open c411.org |
| `f` or `/` | type a what-if target (`Enter` keeps it, `Esc` goes back) |

IPC: `omarchy-shell x99.c411trend refresh | status | forecast | samples | version`,
and `omarchy-shell x99.c411trend when "10 TB"` (or `"ratio 5"`) for a what-if
from the command line.

## Language

The panel, the bar label and the error messages come in US English and in
French. **Language** (`language`) is `Auto` by default and follows your session
locale: French when `LANG` starts with `fr`, English otherwise. Set it to
`English` or `Français` to choose. The switch is live, no restart needed.

French uses the tracker's units and habits: `14,129 To`, `+98,4 Go/j`,
`12 nov. 2026`, `dans 3 semaines`. In both languages sizes are binary
multiples, like the tracker: 1 TB (1 To) is 1024⁴ bytes.

<img src="docs/shots/panel-fr.png" alt="The same panel in French" width="460">

## Bar label

`barFormat` is a template, as in Dockarchy: each `{key}` is replaced by its
value and everything else is kept, so you can compose several values with your
own separators.

![The bar pill with barFormat '↑{up} · {ratio}'](docs/shots/bar.png)

| Key | Value |
| --- | --- |
| `{up}` `{down}` `{ratio}` | totals, as the site shows them |
| `{credit}` | upload credit (bonus) |
| `{buffer}` | upload minus download |
| `{rate}` `{downrate}` | daily upload / download pace |
| `{up24h}` `{up7d}` `{up30d}` | upload gained over the last 24 h, 7 or 30 days |
| `{down24h}` `{down7d}` `{down30d}` | same for download |
| `{ratio24h}` `{ratio7d}` `{ratio30d}` | ratio change over the same windows |
| `{next}` `{nexteta}` | next round upload figure and the time to get there |
| `{goal}` `{ratiogoal}` | time to your upload / ratio goal (`uploadTargetTo`, `ratioTarget`): a duration, `✓` once there, `∞` if out of reach |
| `{user}` | your C411 username |

Aliases: `{upload}` `{ul}` = `{up}`, `{download}` `{dl}` = `{down}`,
`{bonus}` = `{credit}`, `{uprate}` = `{rate}`. Keys are case-insensitive and
may hold spaces (`{ up }`); `{{` and `}}` print literal braces; an unknown key
is left as typed so a typo shows. An empty template shows the icon alone.

```bash
omarchy bar set x99.c411trend barFormat '{ratio}'                     # 4.06
omarchy bar set x99.c411trend barFormat '↑{up} · {ratio}'              # ↑14.129 TB · 4.06
omarchy bar set x99.c411trend barFormat '{ratio} ({ratio7d})'          # 4.06 (+0.102)
omarchy bar set x99.c411trend barFormat '{up24h} today · {rate}'       # +131.6 GB today · +98.4 GB/day
omarchy bar set x99.c411trend barFormat '{next} in {nexteta}'          # 15.0 TB in 9 days
omarchy bar set x99.c411trend barFormat '20 TB in {goal}'              # 20 TB in 2 months (uploadTargetTo = 20)
omarchy bar set x99.c411trend barFormat ''                             # icon only
```

## Settings

From the shell settings, or `omarchy bar set x99.c411trend <key> <value>`:

| Key | Default | |
| --- | --- | --- |
| `language` | `Auto` | `Auto`, `English` or `Français` |
| `browser` | `Auto` | or a browser name, or `File` |
| `browserProfile` | *(all)* | profile directory: `Default`, `Profile 1`, `default-release`… |
| `refreshIntervalMin` | `30` | minutes between polls |
| `forecastWindowDays` | `14` | days the pace is measured over |
| `uploadTargetTo` | `0` | upload goal always listed in the forecast, in TB |
| `ratioTarget` | `0` | ratio goal always listed in the forecast |
| `defaultRange` | `30d` | `24h`, `7d`, `30d`, `all` |
| `barFormat` | `{ratio}` | see [Bar label](#bar-label) |
| `panelWidth` | `672` | pixels |

## Data

History lives in `~/.local/state/c411trend/history.jsonl`, one JSON object per
line (`t`, `up`, `down`, `ratio`, `credit`, optional `"manual": true`). You can
add older readings by hand. Polls only happen while you are logged in to your
desktop, so the chart joins the points across the gaps. The file is compacted
past 2 MiB and keeps full detail for 90 days.

## Development

From a checkout of this repository in `~/Projects/C411Trend`:

```bash
ln -s ~/Projects/C411Trend ~/.config/omarchy/plugins/x99.c411trend
omarchy bar put x99.c411trend

npm test                                       # node model tests + Python script tests
MARKETPLACE_DIR=../omarchy-plugin-marketplace npm run baseline
omarchy plugin validate .
```

The shell does not hot-reload files behind a symlinked plugin directory: run
`omarchy restart shell` after editing the QML, then check
`omarchy-shell x99.c411trend version`.

Screenshots use fictitious data only. `docs/demo/photo-session.sh <dir>` swaps
in a made-up history (`docs/demo/fake-history.py`) and a stub fetch script,
takes the English, French and bar shots, then restores your real history,
fetch script and settings byte for byte, even if it fails halfway.

## License

[WTFPL](LICENSE).
