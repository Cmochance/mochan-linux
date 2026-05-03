import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload, Plus, Grid3X3, List, Star, StarOff, Trash2, X, ChevronLeft, ChevronRight,
  Play, Pause, Download, FolderPlus, Images, Clock, Info
} from 'lucide-react';

interface Photo {
  id: string;
  url: string;
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

interface Album {
  id: string;
  name: string;
  createdAt: number;
}

type ViewMode = 'grid' | 'list';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

const DEFAULT_ALBUMS: Album[] = [
  { id: 'all', name: '全部照片 (All Photos)', createdAt: 0 },
  { id: 'favorites', name: '收藏 (Favorites)', createdAt: 0 },
  { id: 'recent', name: '最近 (Recent)', createdAt: 0 },
];

function simulateEXIF(): Photo['exif'] {
  const cameras = ['Canon EOS R5', 'Sony A7 IV', 'Nikon Z6 II', 'Fujifilm X-T4', 'iPhone 15 Pro', 'Huawei Mate 60'];
  const apertures = ['f/1.4', 'f/1.8', 'f/2.8', 'f/4.0', 'f/5.6', 'f/8.0'];
  const shutters = ['1/60', '1/125', '1/250', '1/500', '1/1000', '1/30'];
  const isos = ['100', '200', '400', '800', '1600', '3200'];
  return {
    camera: cameras[Math.floor(Math.random() * cameras.length)],
    aperture: apertures[Math.floor(Math.random() * apertures.length)],
    shutter: shutters[Math.floor(Math.random() * shutters.length)],
    iso: isos[Math.floor(Math.random() * isos.length)],
    dateTaken: new Date(Date.now() - Math.random() * 365 * 24 * 3600 * 1000).toLocaleString('zh-CN'),
  };
}

export default function PhotoAlbum() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [currentAlbumId, setCurrentAlbumId] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [lightboxPhotoId, setLightboxPhotoId] = useState<string | null>(null);
  const [slideshow, setSlideshow] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(3);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const slideshowTimerRef = useRef<ReturnType<typeof setInterval>>(null);

  // Load from localStorage
  useEffect(() => {
    const savedAlbums = localStorage.getItem('photo_albums');
    if (savedAlbums) {
      try {
        setAlbums(JSON.parse(savedAlbums));
      } catch { /* ignore */ }
    }
    const savedPhotosMeta = localStorage.getItem('photos_meta');
    if (savedPhotosMeta) {
      try {
        const metaList = JSON.parse(savedPhotosMeta);
        setPhotos(metaList);
      } catch { /* ignore */ }
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('photo_albums', JSON.stringify(albums));
  }, [albums]);

  useEffect(() => {
    localStorage.setItem('photos_meta', JSON.stringify(photos.map(p => ({
      ...p,
      url: '',
    }))));
  }, [photos]);

  const handleFileUpload = useCallback((files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    imageFiles.forEach(file => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const newPhoto: Photo = {
          id: generateId(),
          url,
          name: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
          size: file.size,
          type: file.type,
          timestamp: Date.now(),
          albumId: currentAlbumId === 'favorites' || currentAlbumId === 'recent' ? 'all' : currentAlbumId,
          favorite: false,
          exif: simulateEXIF(),
        };
        setPhotos(prev => [newPhoto, ...prev]);
      };
      img.src = url;
    });
  }, [currentAlbumId]);

  // Filter photos
  const filteredPhotos = photos.filter(photo => {
    if (currentAlbumId === 'all') return true;
    if (currentAlbumId === 'favorites') return photo.favorite;
    if (currentAlbumId === 'recent') return Date.now() - photo.timestamp < 7 * 24 * 3600 * 1000;
    return photo.albumId === currentAlbumId;
  });

  // Sort
  const sortedPhotos = [...filteredPhotos].sort((a, b) => {
    if (sortBy === 'date') return b.timestamp - a.timestamp;
    return a.name.localeCompare(b.name);
  });

  // Slideshow
  useEffect(() => {
    if (slideshow && lightboxPhotoId && sortedPhotos.length > 1) {
      slideshowTimerRef.current = setInterval(() => {
        const currentIdx = sortedPhotos.findIndex(p => p.id === lightboxPhotoId);
        if (currentIdx >= 0) {
          const nextIdx = (currentIdx + 1) % sortedPhotos.length;
          setLightboxPhotoId(sortedPhotos[nextIdx].id);
        }
      }, slideshowInterval * 1000);
    }
    return () => {
      if (slideshowTimerRef.current) clearInterval(slideshowTimerRef.current);
    };
  }, [slideshow, lightboxPhotoId, sortedPhotos, slideshowInterval]);

  const toggleFavorite = (photoId: string) => {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, favorite: !p.favorite } : p));
  };

  const deletePhoto = (photoId: string) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === photoId);
      if (photo) URL.revokeObjectURL(photo.url);
      return prev.filter(p => p.id !== photoId);
    });
    if (lightboxPhotoId === photoId) {
      setLightboxPhotoId(null);
    }
  };

  const createAlbum = () => {
    if (!newAlbumName.trim()) return;
    const newAlbum: Album = {
      id: generateId(),
      name: newAlbumName.trim(),
      createdAt: Date.now(),
    };
    setAlbums(prev => [...prev, newAlbum]);
    setNewAlbumName('');
    setShowCreateAlbum(false);
  };

  const deleteAlbum = (albumId: string) => {
    if (['all', 'favorites', 'recent'].includes(albumId)) return;
    setAlbums(prev => prev.filter(a => a.id !== albumId));
    setPhotos(prev => prev.map(p => p.albumId === albumId ? { ...p, albumId: 'all' } : p));
    if (currentAlbumId === albumId) setCurrentAlbumId('all');
  };

  const moveToAlbum = (photoIds: string[], albumId: string) => {
    const targetAlbum = albumId === 'favorites' || albumId === 'recent' ? 'all' : albumId;
    setPhotos(prev => prev.map(p => photoIds.includes(p.id) ? { ...p, albumId: targetAlbum } : p));
    setSelectedPhotos(new Set());
  };

  const currentPhoto = photos.find(p => p.id === lightboxPhotoId);
  const allAlbums = [...DEFAULT_ALBUMS, ...albums];

  const photoCount = (albumId: string) => {
    if (albumId === 'all') return photos.length;
    if (albumId === 'favorites') return photos.filter(p => p.favorite).length;
    if (albumId === 'recent') return photos.filter(p => Date.now() - p.timestamp < 7 * 24 * 3600 * 1000).length;
    return photos.filter(p => p.albumId === albumId).length;
  };

  return (
    <div
      className="w-full h-full flex overflow-hidden select-none"
      style={{ backgroundColor: 'var(--ink-50)' }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
    >
      {/* Drag overlay */}
      {dragOver && !lightboxPhotoId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed rounded-lg"
          style={{ backgroundColor: 'rgba(179,57,47,0.1)', borderColor: 'var(--cinnabar)' }}>
          <div className="text-center">
            <Upload size={48} style={{ color: 'var(--cinnabar)' }} />
            <p className="mt-2 text-body-md" style={{ color: 'var(--cinnabar)' }}>拖入照片 (Drop photos)</p>
          </div>
        </div>
      )}

      {/* Album Sidebar */}
      {!lightboxPhotoId && (
        <div
          className="flex-shrink-0 overflow-y-auto border-r"
          style={{
            width: 180,
            backgroundColor: 'var(--ink-100)',
            borderColor: 'var(--ink-200)',
          }}
        >
          <div className="px-3 py-3">
            <button
              onClick={() => setShowCreateAlbum(true)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded text-body-sm transition-all duration-75"
              style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-700)' }}
            >
              <FolderPlus size={14} />
              新建相册 (New)
            </button>
          </div>

          {showCreateAlbum && (
            <div className="px-3 pb-2">
              <input
                type="text"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createAlbum(); if (e.key === 'Escape') setShowCreateAlbum(false); }}
                placeholder="相册名称 (Album name)"
                className="w-full px-2 py-1 rounded text-body-sm mb-1"
                style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-300)', color: 'var(--ink-800)' }}
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  onClick={createAlbum}
                  className="px-2 py-1 rounded text-caption"
                  style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
                >
                  确认 (OK)
                </button>
                <button
                  onClick={() => setShowCreateAlbum(false)}
                  className="px-2 py-1 rounded text-caption"
                  style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-600)' }}
                >
                  取消 (Cancel)
                </button>
              </div>
            </div>
          )}

          <div className="px-2">
            {allAlbums.map(album => (
              <button
                key={album.id}
                onClick={() => setCurrentAlbumId(album.id)}
                className="flex items-center justify-between w-full px-3 py-2 rounded text-left text-body-sm transition-all duration-75 group"
                style={{
                  backgroundColor: currentAlbumId === album.id ? 'var(--wash-light)' : 'transparent',
                  borderLeft: currentAlbumId === album.id ? '3px solid var(--cinnabar)' : '3px solid transparent',
                  color: 'var(--ink-700)',
                }}
              >
                <span className="truncate flex-1">{album.name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{photoCount(album.id)}</span>
                  {!['all', 'favorites', 'recent'].includes(album.id) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteAlbum(album.id); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 transition-opacity"
                      style={{ color: 'var(--cinnabar)' }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!lightboxPhotoId ? (
          <>
            {/* Toolbar */}
            <div
              className="flex items-center justify-between px-4 py-2 flex-shrink-0 border-b"
              style={{ borderColor: 'var(--ink-200)' }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-body-sm transition-all duration-75"
                  style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
                >
                  <Upload size={14} />
                  上传 (Upload)
                </button>
                <div className="w-px h-4" style={{ backgroundColor: 'var(--ink-300)' }} />
                <button
                  onClick={() => setViewMode('grid')}
                  className="p-1.5 rounded transition-all duration-75"
                  style={{ color: viewMode === 'grid' ? 'var(--cinnabar)' : 'var(--ink-500)' }}
                  title="网格 (Grid)"
                >
                  <Grid3X3 size={16} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className="p-1.5 rounded transition-all duration-75"
                  style={{ color: viewMode === 'list' ? 'var(--cinnabar)' : 'var(--ink-500)' }}
                  title="列表 (List)"
                >
                  <List size={16} />
                </button>
                <div className="w-px h-4" style={{ backgroundColor: 'var(--ink-300)' }} />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'name')}
                  className="text-body-sm rounded px-2 py-1"
                  style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)', color: 'var(--ink-700)' }}
                >
                  <option value="date">日期 (Date)</option>
                  <option value="name">名称 (Name)</option>
                </select>
              </div>

              {/* Batch actions */}
              {selectedPhotos.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
                    {selectedPhotos.size} 已选
                  </span>
                  <select
                    onChange={(e) => { if (e.target.value) moveToAlbum(Array.from(selectedPhotos), e.target.value); }}
                    className="text-caption rounded px-2 py-1"
                    style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)', color: 'var(--ink-700)' }}
                    value=""
                  >
                    <option value="">移动到... (Move to...)</option>
                    {albums.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      selectedPhotos.forEach(id => deletePhoto(id));
                      setSelectedPhotos(new Set());
                    }}
                    className="p-1.5 rounded transition-all duration-75"
                    style={{ color: 'var(--cinnabar)' }}
                    title="删除 (Delete)"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}

              <div className="text-caption" style={{ color: 'var(--ink-400)' }}>
                {filteredPhotos.length} 张照片
              </div>
            </div>

            {/* Photo Grid/List */}
            <div className="flex-1 overflow-y-auto p-4">
              {sortedPhotos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Images size={48} style={{ color: 'var(--ink-300)' }} />
                  <p className="mt-4 text-body-md" style={{ color: 'var(--ink-400)' }}>
                    暂无照片 (No photos)
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 px-4 py-2 rounded text-body-sm transition-all duration-75"
                    style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-700)' }}
                  >
                    上传照片 (Upload)
                  </button>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-3 gap-2">
                  {sortedPhotos.map(photo => (
                    <div
                      key={photo.id}
                      className="relative group cursor-pointer rounded overflow-hidden transition-all duration-150 hover:scale-[1.03]"
                      style={{ boxShadow: 'var(--shadow-sm)' }}
                      onClick={(e) => {
                        if (e.shiftKey || e.ctrlKey || e.metaKey) {
                          setSelectedPhotos(prev => {
                            const next = new Set(prev);
                            if (next.has(photo.id)) next.delete(photo.id);
                            else next.add(photo.id);
                            return next;
                          });
                        } else {
                          setLightboxPhotoId(photo.id);
                        }
                      }}
                    >
                      <img
                        src={photo.url}
                        alt={photo.name}
                        className="w-full aspect-square object-cover"
                        loading="lazy"
                      />
                      {/* Selection overlay */}
                      {selectedPhotos.has(photo.id) && (
                        <div className="absolute inset-0 border-2 rounded" style={{ borderColor: 'var(--cinnabar)' }} />
                      )}
                      {/* Hover actions */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-75 flex items-start justify-end p-1.5 gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(photo.id); }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: photo.favorite ? 'var(--cinnabar)' : '#fff' }}
                        >
                          {photo.favorite ? <Star size={12} /> : <StarOff size={12} />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id); }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {sortedPhotos.map(photo => (
                    <div
                      key={photo.id}
                      className="flex items-center gap-3 px-3 py-2 rounded transition-all duration-75 cursor-pointer hover:bg-[var(--wash-light)]"
                      style={{
                        backgroundColor: selectedPhotos.has(photo.id) ? 'var(--wash-light)' : 'transparent',
                        borderLeft: selectedPhotos.has(photo.id) ? '3px solid var(--cinnabar)' : '3px solid transparent',
                      }}
                      onClick={(e) => {
                        if (e.shiftKey || e.ctrlKey || e.metaKey) {
                          setSelectedPhotos(prev => {
                            const next = new Set(prev);
                            if (next.has(photo.id)) next.delete(photo.id);
                            else next.add(photo.id);
                            return next;
                          });
                        } else {
                          setLightboxPhotoId(photo.id);
                        }
                      }}
                    >
                      <img src={photo.url} alt={photo.name} className="w-12 h-12 rounded object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-body-sm truncate" style={{ color: 'var(--ink-800)' }}>{photo.name}</div>
                        <div className="flex items-center gap-2 text-caption" style={{ color: 'var(--ink-400)' }}>
                          <span>{photo.width} x {photo.height}</span>
                          <span>{formatFileSize(photo.size)}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(photo.id); }}
                        className="p-1 transition-all duration-75"
                        style={{ color: photo.favorite ? 'var(--cinnabar)' : 'var(--ink-300)' }}
                      >
                        {photo.favorite ? <Star size={14} /> : <StarOff size={14} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Lightbox */
          <div className="fixed inset-0 z-[1000] flex flex-col" style={{ backgroundColor: 'rgba(26,26,26,0.95)' }}>
            {/* Lightbox toolbar */}
            <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setLightboxPhotoId(null); setSlideshow(false); }}
                  className="p-2 rounded transition-all duration-75"
                  style={{ color: '#fff' }}
                >
                  <X size={20} />
                </button>
                <span className="text-body-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {currentPhoto?.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSlideshow(!slideshow)}
                  className="p-2 rounded transition-all duration-75"
                  style={{ color: slideshow ? 'var(--cinnabar)' : 'rgba(255,255,255,0.7)' }}
                  title="幻灯片 (Slideshow)"
                >
                  {slideshow ? <Pause size={16} /> : <Play size={16} />}
                </button>
                {currentPhoto && (
                  <>
                    <button
                      onClick={() => toggleFavorite(currentPhoto.id)}
                      className="p-2 rounded transition-all duration-75"
                      style={{ color: currentPhoto.favorite ? 'var(--cinnabar)' : 'rgba(255,255,255,0.7)' }}
                      title="收藏 (Favorite)"
                    >
                      {currentPhoto.favorite ? <Star size={16} /> : <StarOff size={16} />}
                    </button>
                    <button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = currentPhoto.url;
                        link.download = currentPhoto.name;
                        link.click();
                      }}
                      className="p-2 rounded transition-all duration-75"
                      style={{ color: 'rgba(255,255,255,0.7)' }}
                      title="下载 (Download)"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => deletePhoto(currentPhoto.id)}
                      className="p-2 rounded transition-all duration-75"
                      style={{ color: 'var(--cinnabar)' }}
                      title="删除 (Delete)"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Lightbox image */}
            <div className="flex-1 relative flex items-center justify-center">
              {currentPhoto && (
                <>
                  {/* Navigation */}
                  <button
                    onClick={() => {
                      const idx = sortedPhotos.findIndex(p => p.id === lightboxPhotoId);
                      if (idx > 0) setLightboxPhotoId(sortedPhotos[idx - 1].id);
                    }}
                    className="absolute left-4 z-10 p-2 rounded-full"
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    onClick={() => {
                      const idx = sortedPhotos.findIndex(p => p.id === lightboxPhotoId);
                      if (idx < sortedPhotos.length - 1) setLightboxPhotoId(sortedPhotos[idx + 1].id);
                    }}
                    className="absolute right-4 z-10 p-2 rounded-full"
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                  >
                    <ChevronRight size={24} />
                  </button>

                  <img
                    src={currentPhoto.url}
                    alt={currentPhoto.name}
                    className="max-w-full max-h-full object-contain"
                    style={{ boxShadow: 'var(--shadow-xl)' }}
                  />
                </>
              )}
            </div>

            {/* Info bar */}
            {currentPhoto && (
              <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                <div className="flex items-center gap-4 text-caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  <span className="flex items-center gap-1"><Info size={12} /> {currentPhoto.width} x {currentPhoto.height}</span>
                  <span>{formatFileSize(currentPhoto.size)}</span>
                  <span className="flex items-center gap-1"><Clock size={12} /> {new Date(currentPhoto.timestamp).toLocaleString('zh-CN')}</span>
                </div>
                <div className="flex items-center gap-1 text-caption" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span>{sortedPhotos.findIndex(p => p.id === lightboxPhotoId) + 1} / {sortedPhotos.length}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
      />
    </div>
  );
}
