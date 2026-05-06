# mochan-linux v1.0.1

v1.0.1 is a documentation and release-readiness patch for the current
server-backed desktop state.

## Added

- README preview screenshots generated from the local app preview at
  `http://127.0.0.1:3001/` against the local Go backend.
- Screenshot coverage for the desktop, app launcher, File Manager, Terminal,
  Settings, and Browser start page under `docs/img/`.
- README backend completion summary that states which applications are already
  backed by real server APIs or server-side persistence.
- Clear README separation between applications still being migrated to backend
  support and local-only tools or games that do not yet need dedicated backend
  APIs.

## Backend Status Snapshot

Implemented server-backed applications through P15:

- System and desktop: login gate, File Manager, Terminal, Trash, System
  Monitor, Task Manager, Audit Log, Settings, and Browser.
- File and network tools: Text Editor, Markdown Editor, Image Viewer, Download
  Manager, API Tester, RSS Reader, Git Client, SSH Client, FTP/SFTP Client,
  Bookmarks, Weather, and Email Client.
- Personal data apps: Chat App, Notes, Calendar, and Notebook.

Still queued for backend migration:

- Spreadsheet, Mind Map, Presentation, Pomodoro, Habit Tracker, Dictionary,
  Translator, Photo Album, Camera, Voice Recorder, Music Player, Video Player,
  PDF Reader, and Paint.

Deferred until there is a concrete sync, history, export, preset, or
leaderboard requirement:

- Calculator, Clock, Color Picker, Base64 Tool, QR Code Generator, Password
  Generator, Regex Tester, JSON Editor, board games, puzzle games, White Noise,
  and Metronome.

## Validation

- Generated and checked README preview screenshots locally.
- `npm run build` passed.
- `GOCACHE=/Users/alysechen/alysechen/github/mochan-linux/.tmp/go-cache make build VERSION="v1.0.1-docs"` passed.
- The GitHub Release workflow is triggered by pushing the `v1.0.1` tag.

## Notes

- This patch does not change runtime application code.
- The in-app Browser remains a server-side proxy feature: authenticated browser
  requests are fetched by the mochan-linux backend, so it can reach addresses
  available from the server host.
