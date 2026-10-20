# Minimal website

A standalone static research website with seven sections, interactive charts,
video timelines, and downloadable results. This folder includes the web-ready
media and page files; raw recordings, analysis intermediates, and Git history
are kept outside it.

## Requirements and platform support

You can edit and preview this website on **macOS and Linux, including Ubuntu**.
It uses plain HTML, CSS, JavaScript, and Python's standard library. There are no
npm packages, pip packages, or build steps required for development.

- Python 3.8 or newer, available as `python3`.
- A modern browser with JavaScript and H.264/MP4 playback support.
- Any text editor. Git is optional for tracking changes.

Check Python with `python3 --version`. On Ubuntu, if Python is missing:

```sh
sudo apt update
sudo apt install python3
```

On macOS, install Python 3 if needed; do not assume it is preinstalled.
The launcher uses `/bin/sh`, so Linux users do not need to install zsh.

## Start a local preview

### macOS

Double-click **`start.command`** in Finder. It starts the local server and asks
your default browser to open the Results section. Keep its Terminal window open
while using the website; press **Ctrl-C** in that window to stop the server.

If the file has lost its executable permission after copying or downloading it,
use the terminal instructions below, or run `chmod +x start.command` first.

### Linux / Ubuntu, or the terminal on macOS

Open a terminal in this folder and run:

```sh
sh start.command
```

Alternatively, run the Python launcher directly:

```sh
python3 -B launch.py
```

The launcher chooses an available port from **8766–8786** and prints the exact
URL, such as `http://127.0.0.1:8766/#benchmark`. If a browser does not open
automatically, open the printed URL yourself. Linux file managers differ in how
they handle double-clicking scripts; the terminal commands work independently
of those settings.

### Manual preview or a machine without a desktop browser

To choose a fixed port and skip automatic browser opening:

```sh
python3 -B serve.py --port 8766
```

Open `http://127.0.0.1:8766/` on the same machine. If that port is occupied,
choose another one, for example `--port 8767`.

The server listens only on `127.0.0.1`. For development on a remote Linux
machine, forward the port over SSH instead of expecting its localhost URL to
work directly on your laptop:

```sh
# Run on your laptop, while the server runs on the remote machine:
ssh -L 8766:127.0.0.1:8766 user@remote-host
```

Then open `http://127.0.0.1:8766/` on your laptop.

## Why use start.command instead of opening index.html?

`start.command` is a convenience launcher, not a required application or build
step. It changes to this folder and runs `launch.py`, which serves the files
through local HTTP and opens the browser.

The charts read **`benchmark-results.json`** using JavaScript `fetch()`. Opening
`index.html` directly gives it a `file://` URL; browsers generally block fetching
adjacent local files in that mode. Opening the page through `http://127.0.0.1`
allows the HTML and JSON to load from the same origin. The included server also
supports HTTP byte ranges so videos can seek to a selected timestamp.

The data remains JSON. No conversion to JavaScript or duplicate data file is
needed. On a static web host, the host already provides HTTP/HTTPS, so visitors
do not need Python or `start.command`.

## Edit and refresh

1. Start the local preview using one of the commands above.
2. Edit the relevant files in your editor.
3. Save and reload the browser. There is no build step or automatic live reload.

| File | Purpose |
| --- | --- |
| `index.html`, `app.js`, `style.css` | Page structure, interactions, and styling |
| `benchmark-results.json` | Editable benchmark values and task categories |
| `benchmark.js`, `benchmark.css` | Benchmark validation, charts, and styling |
| `experiments.js` | Demonstration metadata, decision notes, and timestamps |
| `assets/` | Web videos, posters, and trajectory images |
| `media-manifest.json` | Asset usage, checksums, dimensions, and durations |
| Other CSV/JSON files | Existing downloadable study records |
| `start.command`, `launch.py`, `serve.py` | Local preview helpers |

Keep `benchmark-results.json` valid JSON: use double quotes, no comments, and no
trailing commas. Preserve its schema, task identifiers, and source references.
To check JSON syntax:

```sh
python3 -m json.tool benchmark-results.json > /dev/null
```

The page also validates the benchmark schema. If Results fails to load over
HTTP, its error message and the browser console provide details. Benchmark data
is requested without using the browser cache; a reload picks up saved edits.
A hard refresh can help after changing JavaScript or CSS.

## Maintain videos and publish

Keep only web-ready media in `assets/`; store original recordings and analysis
outputs separately. Preserve each video's timeline when replacing it. If a clip
is trimmed or retimed, update its associated timestamps in `experiments.js`.
Update the manifest's checksum, dimensions, and duration when assets change.
Editing page text or result values does not require video-processing tools.

This folder can be maintained as a standalone Git repository and deployed to a
static host. Preserve the relative paths and filename capitalization, including
on Linux, where filenames are normally case-sensitive. Local preview helpers
are not required by the hosted page.

Changes in this folder do not automatically update the original project or any
online preview. Review locally, then commit and publish deliberately. Export a
fresh copy into a new folder rather than overwriting manual edits here.

## Verification scope

Local HTTP serving, JSON loading, charts, and video seeking have been checked on
macOS. The launcher and server use portable shell/Python APIs compatible with
Linux and Ubuntu; a native Linux desktop browser run has not been performed in
this workspace.
