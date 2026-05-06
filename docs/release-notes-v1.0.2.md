# mochan-linux v1.0.2

v1.0.2 finishes the tracked application backend-completion queue. The desktop
apps that had meaningful browser-local state now write to the server through
existing `/api/app-state`, `/api/fs/upload`, and `/api/fs/download` surfaces.

## Added

- Spreadsheet, Mind Map, Presentation, Pomodoro, Habit Tracker, Dictionary,
  and Translator now persist their user data through `/api/app-state`.
- Photo Album, Camera, Voice Recorder, Music Player, Video Player, PDF Reader,
  and Paint use the shared media-library helpers for server-side files under
  `~/.mochan/media/<kind>`.
- Music Player stores audio files under `~/.mochan/media/music`, opens audio
  files launched from File Manager, and persists playlist/playback preferences.
- Video Player stores video files under `~/.mochan/media/videos`, opens video
  files launched from File Manager, and persists playlist/playback preferences.
- PDF Reader opens server PDF paths, accepts File Manager PDF launches, uploads
  local PDFs under `~/.mochan/media/documents`, and persists recent files plus
  reading position.
- Paint saves PNG drawings under `~/.mochan/media/drawings`, persists tool
  settings and recent drawings, and can open local or server images into the
  canvas.
- Calculator history, Snake high score, 2048 best score, and Radio favorites
  and preferences now persist through generic app-state.

## Changed

- File Manager now routes `.pdf`, audio, and video extensions to PDF Reader,
  Music Player, and Video Player.
- README backend status now reflects the completed P0-P30 queue.

## Deferred

- Translator provider execution remains deferred until a provider and
  secret-handling policy are selected.
- Dedicated backend APIs for stateless generators, clocks, board games, and
  audio tools remain deferred until there is a concrete saved-data, file,
  preset, or leaderboard requirement.

## Validation

- `cd web && npm run build` passed.
- No new Go backend endpoint was added in this release, so no backend test run
  was required for the final P26-P30 pass.
- The GitHub Release workflow is triggered by pushing the `v1.0.2` tag.
