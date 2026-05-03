import { lazy } from 'react';

// System Tools
export const FileManager = lazy(() => import('./FileManager'));
export const Terminal = lazy(() => import('./Terminal'));
export const SystemMonitor = lazy(() => import('./SystemMonitor'));
export const Settings = lazy(() => import('./Settings'));
export const Calculator = lazy(() => import('./Calculator'));
export const Calendar = lazy(() => import('./Calendar'));
export const Clock = lazy(() => import('./Clock'));
export const Screenshot = lazy(() => import('./Screenshot'));
export const Notes = lazy(() => import('./Notes'));
export const Trash = lazy(() => import('./Trash'));
export const TaskManager = lazy(() => import('./TaskManager'));
export const Weather = lazy(() => import('./Weather'));

// Office
export const TextEditor = lazy(() => import('./TextEditor'));
export const MarkdownEditor = lazy(() => import('./MarkdownEditor'));
export const Spreadsheet = lazy(() => import('./Spreadsheet'));
export const Paint = lazy(() => import('./Paint'));
export const MindMap = lazy(() => import('./MindMap'));
export const Presentation = lazy(() => import('./Presentation'));
export const PDFReader = lazy(() => import('./PDFReader'));
export const Translator = lazy(() => import('./Translator'));

// Media
export const MusicPlayer = lazy(() => import('./MusicPlayer'));
export const VideoPlayer = lazy(() => import('./VideoPlayer'));
export const ImageViewer = lazy(() => import('./ImageViewer'));
export const VoiceRecorder = lazy(() => import('./VoiceRecorder'));
export const PhotoAlbum = lazy(() => import('./PhotoAlbum'));
export const Radio = lazy(() => import('./Radio'));
export const Camera = lazy(() => import('./Camera'));
export const Metronome = lazy(() => import('./Metronome'));

// Network
export const Browser = lazy(() => import('./Browser'));
export const EmailClient = lazy(() => import('./EmailClient'));
export const ChatApp = lazy(() => import('./ChatApp'));
export const FTPClient = lazy(() => import('./FTPClient'));
export const SSHClient = lazy(() => import('./SSHClient'));
export const DownloadManager = lazy(() => import('./DownloadManager'));
export const RSSReader = lazy(() => import('./RSSReader'));
export const Bookmarks = lazy(() => import('./Bookmarks'));

// Dev
export const GitClient = lazy(() => import('./GitClient'));
export const JSONEditor = lazy(() => import('./JSONEditor'));
export const RegexTester = lazy(() => import('./RegexTester'));
export const APITester = lazy(() => import('./APITester'));
export const ColorPicker = lazy(() => import('./ColorPicker'));
export const Base64Tool = lazy(() => import('./Base64Tool'));
export const QRCodeGenerator = lazy(() => import('./QRCodeGenerator'));
export const PasswordGenerator = lazy(() => import('./PasswordGenerator'));

// Games
export const GoGame = lazy(() => import('./GoGame'));
export const ChineseChess = lazy(() => import('./ChineseChess'));
export const Mahjong = lazy(() => import('./Mahjong'));
export const Gomoku = lazy(() => import('./Gomoku'));
export const Sudoku = lazy(() => import('./Sudoku'));
export const Snake = lazy(() => import('./Snake'));
export const Puzzle2048 = lazy(() => import('./Puzzle2048'));
export const JigsawPuzzle = lazy(() => import('./JigsawPuzzle'));

// Education
export const Dictionary = lazy(() => import('./Dictionary'));
export const Notebook = lazy(() => import('./Notebook'));
export const WhiteNoise = lazy(() => import('./WhiteNoise'));
export const Pomodoro = lazy(() => import('./Pomodoro'));
export const HabitTracker = lazy(() => import('./HabitTracker'));

// Map app IDs to lazy components
export const lazyAppComponents: Record<string, React.LazyExoticComponent<React.ComponentType<{ windowId?: string }>>> = {
  filemanager: FileManager,
  terminal: Terminal,
  systemmonitor: SystemMonitor,
  settings: Settings,
  calculator: Calculator,
  calendar: Calendar,
  clock: Clock,
  screenshot: Screenshot,
  notes: Notes,
  trash: Trash,
  taskmanager: TaskManager,
  weather: Weather,
  texteditor: TextEditor,
  markdowneditor: MarkdownEditor,
  spreadsheet: Spreadsheet,
  paint: Paint,
  mindmap: MindMap,
  presentation: Presentation,
  pdfreader: PDFReader,
  translator: Translator,
  musicplayer: MusicPlayer,
  videoplayer: VideoPlayer,
  imageviewer: ImageViewer,
  voicerecorder: VoiceRecorder,
  photoalbum: PhotoAlbum,
  radio: Radio,
  camera: Camera,
  metronome: Metronome,
  browser: Browser,
  emailclient: EmailClient,
  chatapp: ChatApp,
  ftpclient: FTPClient,
  sshclient: SSHClient,
  downloadmanager: DownloadManager,
  rssreader: RSSReader,
  bookmarks: Bookmarks,
  gitclient: GitClient,
  jsoneditor: JSONEditor,
  regextester: RegexTester,
  apitester: APITester,
  colorpicker: ColorPicker,
  base64tool: Base64Tool,
  qrcodegenerator: QRCodeGenerator,
  passwordgenerator: PasswordGenerator,
  gogame: GoGame,
  chinesechess: ChineseChess,
  mahjong: Mahjong,
  gomoku: Gomoku,
  sudoku: Sudoku,
  snake: Snake,
  puzzle2048: Puzzle2048,
  jigsawpuzzle: JigsawPuzzle,
  dictionary: Dictionary,
  notebook: Notebook,
  whitenoise: WhiteNoise,
  pomodoro: Pomodoro,
  habittracker: HabitTracker,
};
