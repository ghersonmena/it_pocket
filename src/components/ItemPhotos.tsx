import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { GLPISession, GLPITaskPhoto, PhotoCategory } from '../types/glpi';
import { GLPIService } from '../services/glpiService';
import { CameraCapture } from './CameraCapture';
import { RefreshCw, Camera, Image as ImageIcon, X, Upload } from 'lucide-react';

interface ItemPhotosProps {
  session: GLPISession;
  // Identifica el elemento (p. ej. "ProjectTask#21"): al cambiar, se recargan las fotos
  sourceKey: string;
  // Rubros de documento entre los que se elige; con uno solo se asigna automáticamente
  categories: PhotoCategory[];
  loadPhotos: () => Promise<GLPITaskPhoto[]>;
  uploadPhoto: (photo: Blob, categoryId: number, index: number) => Promise<GLPITaskPhoto>;
  indent?: number;
  onCountChange?: (count: number) => void;
}

// Foto tomada o elegida que todavía no se sube a GLPI
interface PendingPhoto {
  key: number;
  blob: Blob;
  url: string;
}

const formatDate = (value: string): string => {
  const date = new Date(value.replace(' ', 'T'));
  if (isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const actionButtonStyle = (disabled: boolean): React.CSSProperties => ({
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '8px 10px',
  borderRadius: '10px',
  border: '1px solid var(--primary)',
  background: 'rgba(59, 130, 246, 0.08)',
  color: 'var(--primary)',
  fontWeight: 700,
  fontSize: '0.75rem',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1
});

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 800,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  margin: '10px 0 6px'
};

let pendingKeySeq = 0;

// Fotos de un elemento de GLPI (tarea de mantenimiento, activo...): se toman varias con la
// cámara o se eligen de la galería, se clasifican con un rubro de documento y se suben juntas
// como Documents ligados al elemento.
export const ItemPhotos: React.FC<ItemPhotosProps> = ({
  session, sourceKey, categories, loadPhotos, uploadPhoto, indent = 0, onCountChange
}) => {
  // Con un solo rubro posible no hay nada que elegir
  const fixedCategory = categories.length === 1 ? categories[0].id : null;
  const [photos, setPhotos] = useState<GLPITaskPhoto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(fixedCategory);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [cameraOpen, setCameraOpen] = useState<boolean>(false);
  const [viewing, setViewing] = useState<GLPITaskPhoto | null>(null);

  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const onCountChangeRef = useRef(onCountChange);
  const loadPhotosRef = useRef(loadPhotos);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
    loadPhotosRef.current = loadPhotos;
  });

  const trackUrl = (url?: string) => {
    if (url) objectUrlsRef.current.push(url);
    return url;
  };

  // Liberar todas las imágenes en memoria al cerrar el panel
  useEffect(() => () => {
    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const list = await loadPhotosRef.current();
        if (cancelled) return;
        setPhotos(list);
        onCountChangeRef.current?.(list.length);
        setLoading(false);

        // Descargar las imágenes en paralelo; cada una aparece al terminar de llegar
        await Promise.all(list.map(async photo => {
          try {
            const url = trackUrl(await GLPIService.getPhotoObjectUrl(session, photo));
            if (!cancelled) setPhotos(prev => prev.map(p => (p.id === photo.id ? { ...p, url } : p)));
          } catch (err) {
            console.warn(`[GLPI] No se pudo descargar la foto #${photo.id}:`, err);
          }
        }));
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'No se pudieron cargar las fotos.');
          setLoading(false);
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [session, sourceKey]);

  const addPending = (blobs: Blob[]) => {
    if (blobs.length === 0) return;
    const items = blobs.map(blob => ({ key: ++pendingKeySeq, blob, url: trackUrl(URL.createObjectURL(blob))! }));
    setPending(prev => [...prev, ...items]);
    setUploadStatus(null);
  };

  const removePending = (key: number) => {
    setPending(prev => prev.filter(p => p.key !== key));
  };

  // Fotos de la galería o de la cámara nativa: se comprimen y quedan pendientes
  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
    if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (files.length === 0) return;

    setError(null);
    try {
      addPending(await Promise.all(files.map(file => GLPIService.compressPhoto(file))));
    } catch (err: any) {
      setError(err.message || 'No se pudo procesar la imagen.');
    }
  };

  // Subir todas las pendientes de un jalón. Las que fallen se quedan pendientes para reintentar.
  const uploadPending = async () => {
    if (!categoryId || pending.length === 0 || uploading) return;

    setUploading(true);
    setError(null);
    const queue = [...pending];
    const failed: PendingPhoto[] = [];
    let uploaded = 0;
    let lastError = '';

    for (const [index, item] of queue.entries()) {
      setUploadStatus(`Subiendo foto ${index + 1} de ${queue.length}...`);
      try {
        const photo = await uploadPhoto(item.blob, categoryId, index);
        trackUrl(photo.url);
        uploaded++;
        setPhotos(prev => {
          const next = [photo, ...prev];
          onCountChangeRef.current?.(next.length);
          return next;
        });
      } catch (err: any) {
        failed.push(item);
        lastError = err.message || 'Error al subir';
      }
    }

    setPending(failed);
    setUploading(false);
    if (failed.length === 0) {
      setUploadStatus(`✓ ${uploaded} foto${uploaded === 1 ? '' : 's'} subida${uploaded === 1 ? '' : 's'} a GLPI.`);
      setCategoryId(fixedCategory);
    } else {
      setUploadStatus(null);
      setError(`Se subieron ${uploaded} de ${queue.length}. Las ${failed.length} restantes siguen pendientes; vuelve a intentarlo. (${lastError})`);
    }
  };

  const renderThumb = (photo: GLPITaskPhoto) => (
    <button
      key={photo.id}
      type="button"
      onClick={() => photo.url && setViewing(photo)}
      title={photo.name}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        padding: 0,
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        background: 'var(--bg-main)',
        cursor: photo.url ? 'zoom-in' : 'default'
      }}
    >
      {photo.url ? (
        <img src={photo.url} alt={photo.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <RefreshCw size={14} className="spin" color="var(--text-muted)" />
      )}
      <span
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, padding: '2px 4px',
          fontSize: '0.6rem', fontWeight: 600, color: '#fff', background: 'rgba(15, 23, 42, 0.6)'
        }}
      >
        {formatDate(photo.date)}
      </span>
    </button>
  );

  // Galería agrupada por rubro; las de otros rubros o sin rubro van al final
  const groups = [
    ...categories.map(cat => ({ key: String(cat.id), label: cat.label, items: photos.filter(p => p.categoryId === cat.id) })),
    {
      key: 'other',
      label: categories.length === 1 ? 'Otras imágenes' : 'Sin clasificar',
      items: photos.filter(p => !categories.some(cat => cat.id === p.categoryId))
    }
  ].filter(group => group.items.length > 0);

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        marginTop: '4px',
        marginLeft: `${indent}px`,
        padding: '10px 12px',
        background: 'var(--card-bg)',
        border: '1px dashed var(--border-color)',
        borderRadius: 'var(--radius-md)'
      }}
    >
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={e => handleFiles(e.target.files)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => handleFiles(e.target.files)}
      />

      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" disabled={uploading} onClick={() => setCameraOpen(true)} style={actionButtonStyle(uploading)}>
          <Camera size={14} /> Cámara
        </button>
        <button type="button" disabled={uploading} onClick={() => galleryInputRef.current?.click()} style={actionButtonStyle(uploading)}>
          <ImageIcon size={14} /> Galería
        </button>
      </div>

      {/* Fotos pendientes de subir */}
      {pending.length > 0 && (
        <div
          style={{
            marginTop: '10px',
            padding: '10px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.35)'
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', marginBottom: '8px' }}>
            {pending.length} foto{pending.length === 1 ? '' : 's'} sin subir
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {pending.map(item => (
              <div key={item.key} style={{ position: 'relative' }}>
                <img src={item.url} alt="Foto pendiente" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', display: 'block' }} />
                {!uploading && (
                  <button
                    type="button"
                    onClick={() => removePending(item.key)}
                    aria-label="Quitar foto"
                    style={{
                      position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                      borderRadius: '50%', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer'
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Rubro del documento en GLPI: obligatorio elegirlo antes de subir (si hay varios) */}
          {fixedCategory === null && <>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', margin: '10px 0 6px' }}>
            Tipo de foto
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {categories.map(cat => {
              const selected = categoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  disabled={uploading}
                  onClick={() => setCategoryId(cat.id)}
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: '10px',
                    border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border-color)'}`,
                    background: selected ? 'rgba(59, 130, 246, 0.12)' : 'var(--card-bg)',
                    color: selected ? 'var(--primary)' : 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    cursor: uploading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
          </>}
          {fixedCategory !== null && (
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginTop: '10px' }}>
              Se guardarán en el rubro “{categories[0].label}”
            </div>
          )}

          <button
            type="button"
            onClick={uploadPending}
            disabled={!categoryId || uploading}
            style={{
              width: '100%',
              marginTop: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--primary-gradient)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: !categoryId || uploading ? 'not-allowed' : 'pointer',
              opacity: !categoryId || uploading ? 0.6 : 1
            }}
          >
            {uploading ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
            {categoryId
              ? `Subir ${pending.length} foto${pending.length === 1 ? '' : 's'}`
              : 'Elige el tipo de foto para subir'}
          </button>
        </div>
      )}

      {uploadStatus && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '0.75rem', fontWeight: 600, color: uploading ? 'var(--primary)' : '#059669' }}>
          {uploading && <RefreshCw size={12} className="spin" />} {uploadStatus}
        </div>
      )}

      {error && (
        <div style={{ marginTop: '8px', fontSize: '0.75rem', fontWeight: 600, color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* Fotos ya guardadas en GLPI */}
      <div style={{ marginTop: '4px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <RefreshCw size={12} className="spin" /> Cargando fotos...
          </div>
        ) : photos.length === 0 ? (
          pending.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <Camera size={12} /> Sin fotos todavía.
            </div>
          )
        ) : (
          groups.map(group => (
            <div key={group.key}>
              <div style={sectionTitleStyle}>{group.label} ({group.items.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {group.items.map(renderThumb)}
              </div>
            </div>
          ))
        )}
      </div>

      {cameraOpen && (
        <CameraCapture
          onDone={blobs => {
            setCameraOpen(false);
            addPending(blobs);
          }}
          onUseNativeCamera={() => nativeCameraInputRef.current?.click()}
        />
      )}

      {/* Visor a pantalla completa (portal a <body> por el transform del contenedor animado) */}
      {viewing?.url && createPortal(
        <div
          onClick={() => setViewing(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0, 0, 0, 0.9)'
          }}
        >
          <button
            type="button"
            onClick={() => setViewing(null)}
            aria-label="Cerrar"
            style={{
              position: 'absolute', top: 'calc(12px + env(safe-area-inset-top, 0px))', right: '12px',
              background: 'rgba(255, 255, 255, 0.15)', border: 'none', borderRadius: '50%',
              padding: '8px', color: '#fff', cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>
          <img src={viewing.url} alt={viewing.name} style={{ maxWidth: '100%', maxHeight: '85dvh', objectFit: 'contain' }} />
          <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#cbd5e1', textAlign: 'center' }}>
            {viewing.name}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
