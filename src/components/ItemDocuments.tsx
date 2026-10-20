import React, { useEffect, useRef, useState } from 'react';
import type { GLPISession, GLPITaskPhoto } from '../types/glpi';
import { GLPIService } from '../services/glpiService';
import { FileText, Paperclip, RefreshCw, ExternalLink } from 'lucide-react';

// Rubro "ARCHIVOS DOCUMENTACION" (Configuración → Desplegables → Rubros de documentos)
export const DOCUMENTATION_CATEGORY_ID = 14;

interface ItemDocumentsProps {
  session: GLPISession;
  itemtype: string;
  itemId: number;
  itemName: string;
}

// Documentación (PDF, Office, etc.) ligada a una tarea o al proyecto. Las fotos van aparte.
export const ItemDocuments: React.FC<ItemDocumentsProps> = ({ session, itemtype, itemId, itemName }) => {
  const [docs, setDocs] = useState<GLPITaskPhoto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    GLPIService.getItemDocuments(session, itemtype, itemId)
      .then(list => { if (!cancelled) setDocs(list); })
      .catch(err => { if (!cancelled) setError(err.message || 'No se pudieron cargar los documentos.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session, itemtype, itemId]);

  useEffect(() => () => { urlsRef.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        const doc = await GLPIService.uploadItemPhoto(session, {
          itemtype,
          itemId,
          name: `Documento - ${itemName} - ${file.name}`,
          filename: file.name,
          categoryId: DOCUMENTATION_CATEGORY_ID,
          photo: file
        });
        setDocs(prev => [{ ...doc, mime: file.type }, ...prev]);
      }
    } catch (err: any) {
      setError(err.message || 'No se pudo subir el documento.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const open = async (doc: GLPITaskPhoto) => {
    // La pestaña se abre en el mismo toque (si no, el navegador la bloquea) y luego se carga
    const tab = window.open('', '_blank');
    setOpening(doc.id);
    try {
      const url = await GLPIService.getPhotoObjectUrl(session, doc);
      urlsRef.current.push(url);
      if (tab) tab.location.href = url;
      else if (!window.open(url, '_blank')) setError(`Permite las ventanas emergentes para abrir "${doc.filename || doc.name}".`);
    } catch {
      tab?.close();
      setError(`No se pudo abrir "${doc.filename || doc.name}".`);
    } finally {
      setOpening(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <RefreshCw size={14} className="spin" /> Cargando documentos...
        </div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin documentos todavía.</div>
      ) : (
        docs.map(doc => (
          <button
            key={doc.id}
            type="button"
            onClick={() => open(doc)}
            disabled={opening === doc.id}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '12px', textAlign: 'left',
              border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)', cursor: 'pointer'
            }}
          >
            <FileText size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, overflowWrap: 'anywhere' }}>{doc.filename || doc.name}</span>
              {doc.date && <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{doc.date.slice(0, 16)}</span>}
            </span>
            {opening === doc.id ? <RefreshCw size={14} className="spin" /> : <ExternalLink size={14} color="var(--text-muted)" />}
          </button>
        ))
      )}

      {error && <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#dc2626' }}>{error}</div>}

      <input ref={inputRef} type="file" multiple hidden onChange={e => upload(e.target.files)} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '12px',
          border: '1.5px dashed var(--border-color)', background: 'transparent', color: 'var(--primary)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer'
        }}
      >
        {uploading ? <RefreshCw size={15} className="spin" /> : <Paperclip size={15} />} {uploading ? 'Subiendo...' : 'Adjuntar documento'}
      </button>
    </div>
  );
};
