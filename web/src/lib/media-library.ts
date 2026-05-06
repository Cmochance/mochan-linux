import { appStateClient } from './app-state';
import { fsClient } from './fs';

export const PHOTO_ALBUM_APP_ID = 'photoalbum';

export type MediaKind = 'photos' | 'audio' | 'music' | 'videos' | 'drawings' | 'documents';

export interface MediaAlbum {
  id: string;
  name: string;
  createdAt: number;
}

export interface MediaPhoto {
  id: string;
  url: string;
  path?: string;
  source?: 'photoalbum' | 'camera';
  name: string;
  width: number;
  height: number;
  size: number;
  type: string;
  timestamp: number;
  albumId: string;
  favorite: boolean;
  exif: {
    camera: string;
    aperture: string;
    shutter: string;
    iso: string;
    dateTaken: string;
  };
}

export interface PhotoAlbumState {
  albums: MediaAlbum[];
  photos: MediaPhoto[];
}

export interface SavedMediaFile {
  path: string;
  url: string;
  size: number;
}

export interface MediaLibraryFile extends SavedMediaFile {
  id: string;
  name: string;
  mtime: number;
  type: string;
}

function sanitizeFilename(name: string): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_');
  return trimmed || 'media-file';
}

function uniqueFilename(name: string): string {
  const safe = sanitizeFilename(name);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${suffix}-${safe}`;
}

export function serverMediaURL(path?: string, fallback = ''): string {
  return path ? fsClient.downloadURL(path) : fallback;
}

export function serializablePhotos(photos: MediaPhoto[]): MediaPhoto[] {
  return photos
    .filter(photo => photo.path)
    .map(photo => ({
      ...photo,
      url: '',
    }));
}

export function normalizePhotos(photos: MediaPhoto[] | undefined): MediaPhoto[] {
  if (!Array.isArray(photos)) return [];
  return photos
    .filter(photo => photo && (photo.path || photo.url))
    .map(photo => ({
      ...photo,
      url: serverMediaURL(photo.path, photo.url),
      source: photo.source ?? 'photoalbum',
    }));
}

export async function ensureMediaDir(kind: MediaKind): Promise<string> {
  const home = await fsClient.home();
  const dir = `${home}/.mochan/media/${kind}`;
  await fsClient.mkdir(dir, true);
  return dir;
}

export async function saveMediaBlob(
  kind: MediaKind,
  filename: string,
  blob: Blob,
  type?: string,
): Promise<SavedMediaFile> {
  const dir = await ensureMediaDir(kind);
  const entry = await fsClient.uploadFileToPath(`${dir}/${uniqueFilename(filename)}`, blob, type);
  return {
    path: entry.path,
    url: fsClient.downloadURL(entry.path),
    size: entry.size,
  };
}

function extensionOf(name: string): string {
  const slash = name.lastIndexOf('/');
  const dot = name.lastIndexOf('.');
  if (dot <= slash) return '';
  return name.slice(dot + 1).toLowerCase();
}

function inferMediaType(name: string, fallback = 'application/octet-stream'): string {
  const ext = extensionOf(name);
  if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'flac', 'opus'].includes(ext)) return `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
  if (['mp4', 'webm', 'ogv', 'mov', 'mkv'].includes(ext)) return `video/${ext === 'ogv' ? 'ogg' : ext}`;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  if (ext === 'pdf') return 'application/pdf';
  return fallback;
}

export async function listMediaFiles(kind: MediaKind, extensions: readonly string[]): Promise<MediaLibraryFile[]> {
  const dir = await ensureMediaDir(kind);
  const allowed = new Set(extensions.map(ext => ext.replace(/^\./, '').toLowerCase()));
  const listing = await fsClient.list(dir);
  return listing.entries
    .filter(entry => !entry.is_dir && allowed.has(extensionOf(entry.name)))
    .map(entry => ({
      id: entry.path,
      path: entry.path,
      name: entry.name,
      url: fsClient.downloadURL(entry.path),
      size: entry.size,
      mtime: entry.mtime,
      type: inferMediaType(entry.name),
    }))
    .sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
}

export async function loadPhotoLibrary(fallback: PhotoAlbumState): Promise<PhotoAlbumState> {
  const state = await appStateClient.getOrDefault<PhotoAlbumState>(PHOTO_ALBUM_APP_ID, fallback);
  return {
    albums: Array.isArray(state.albums) ? state.albums : fallback.albums,
    photos: normalizePhotos(Array.isArray(state.photos) ? state.photos : fallback.photos),
  };
}

export function savePhotoLibrary(state: PhotoAlbumState) {
  return appStateClient.put<PhotoAlbumState>(PHOTO_ALBUM_APP_ID, {
    albums: state.albums,
    photos: serializablePhotos(state.photos),
  });
}

export async function appendPhotoToLibrary(photo: MediaPhoto): Promise<void> {
  const state = await loadPhotoLibrary({ albums: [], photos: [] });
  await savePhotoLibrary({
    albums: state.albums,
    photos: [photo, ...state.photos.filter(item => item.id !== photo.id)],
  });
}
