import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import type { GLPISession } from '../types/glpi';
import { GLPIService } from '../services/glpiService';
import { renderPdfPagesForViewing } from '../services/pdfRender';
import { ImageViewer } from './ImageViewer';
import { X, ExternalLink, RefreshCw, FileWarning, ZoomIn } from 'lucide-react';

export interface ViewableDocument {
  id: number;
  name: string;
  filename?: string;
  mime?: string;
}

interface DocumentViewerProps {
  session: GLPISession;
  doc: ViewableDocument;
  onClose: () => void;
}

type Kind = 'image' | 'pdf' | 'docx' | 'text' | 'other';

const TEXT_EXTENSIONS = ['txt', 'csv', 'log', 'json', 'xml', 'md', 'ini', 'conf', 'cfg', 'sql', 'yml', 'yaml', 'html', 'htm'];
const MAX_TEXT_CHARS = 500_000;
const MAX_PDF_PAGES = 60;

const kindOf = (doc: ViewableDocument): Kind => {
  const mime = (doc.mime || '').toLowerCase();
  const ext = (doc.filename || doc.name).toLowerCase().split('.').pop() || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mime.startsWith('text/') || TEXT_EXTENSIONS.includes(ext) || mime === 'application/json' || mime === 'application/xml') return 'text';
  return 'other';
};

// Visor de documentos dentro de la app: PDF (páginas con zoom y galería), imágenes, texto y
// Word (.docx). Lo que no se puede mostrar se ofrece para abrir fuera de la app.
export const DocumentViewer: React.FC<DocumentViewerProps> = ({ session, doc, onClose }) => {
  const kind = kindOf(doc);
  const title = doc.filename || doc.name;
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [pages, setPages] = useState<{ url: string; width: number; height: number }[]>([]);
  const [pageCount, setPageCount] = useState<number>(0);
  const [text, setText] = useState<string>('');
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [zoomPage, setZoomPage] = useState<number | null>(null);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const track = (url: string) => { urlsRef.current.push(url); return url; };
    (async () => {
      try {
        const blob = await GLPIService.getDocumentBlob(session, doc.id);
        if (cancelled) return;
        setBlobUrl(track(URL.createObjectURL(blob)));
        if (kind === 'pdf') {
          const total = await renderPdfPagesForViewing(blob, (index, page) => {
            track(page.url);
            if (!cancelled) setPages(prev => { const next = [...prev]; next[index] = page; return next; });
          }, { maxPages: MAX_PDF_PAGES, isCancelled: () => cancelled });
          if (!cancelled) setPageCount(total);
        } else if (kind === 'text') {
          const content = await blob.text();
          if (!cancelled) setText(content.length > MAX_TEXT_CHARS ? `${content.slice(0, MAX_TEXT_CHARS)}\n\n[… el archivo es muy grande; ábrelo fuera de la app para verlo completo]` : content);
        } else if (kind === 'docx') {
          // mammoth solo se descarga al abrir un documento de Word
          const mammothModule: any = await import('mammoth');
          const mammoth = mammothModule.default || mammothModule;
          const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
          if (!cancelled) setHtml(DOMPurify.sanitize(result.value, { FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'] }));
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'No se pudo abrir el documento.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session, doc.id, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && zoomPage === null) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, zoomPage]);

  useEffect(() => () => { urlsRef.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const openOutside = () => {
    if (blobUrl && !window.open(blobUrl, '_blank')) setError('Permite las ventanas emergentes para abrir el documento fuera de la app.');
  };

  // Una imagen se muestra directo en el visor con zoom
  if (kind === 'image' && blobUrl) {
    return <ImageViewer src={blobUrl} alt={title} onClose={onClose} />;
  }

  const buttonStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '9px', border: 'none', borderRadius: '12px',
    background: 'rgba(255, 255, 255, 0.12)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem'
  };
  const readyPages = pages.filter(Boolean);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', inset: 0, zIndex: 1250, display: 'flex', flexDirection: 'column', background: '#16181d' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: 'calc(10px + env(safe-area-inset-top, 0px)) 12px 10px', color: '#f4f4f2' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.86rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {kind === 'pdf' && pageCount > 0 && (
            <div style={{ fontSize: '0.72rem', color: '#a9afbc' }}>
              {pageCount} página{pageCount === 1 ? '' : 's'}{pageCount > MAX_PDF_PAGES ? ` · se muestran las primeras ${MAX_PDF_PAGES}` : ''}
            </div>
          )}
        </div>
        {blobUrl && (
          <button type="button" onClick={openOutside} style={buttonStyle} aria-label="Abrir fuera de la app" title="Abrir fuera de la app">
            <ExternalLink size={17} />
          </button>
        )}
        <button type="button" onClick={onClose} style={buttonStyle} aria-label="Cerrar documento">
          <X size={19} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '4px 12px calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        {error ? (
          <div style={{ marginTop: '40px', textAlign: 'center', color: '#fca5a5', fontSize: '0.85rem', fontWeight: 600 }}>{error}</div>
        ) : kind === 'pdf' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
            {readyPages.map((page, i) => (
              <button
                key={page.url}
                type="button"
                onClick={() => setZoomPage(i)}
                aria-label={`Página ${i + 1}: ampliar`}
                style={{ position: 'relative', width: '100%', maxWidth: '900px', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
              >
                <img src={page.url} alt={`Página ${i + 1}`} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '6px', boxShadow: '0 4px 18px rgba(0, 0, 0, 0.4)' }} />
                <span style={{ position: 'absolute', right: '8px', bottom: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '999px', background: 'rgba(0, 0, 0, 0.6)', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
                  <ZoomIn size={12} /> {i + 1}
                </span>
              </button>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px', color: '#a9afbc', fontSize: '0.82rem' }}>
                <RefreshCw size={16} className="spin" /> {readyPages.length ? `Cargando página ${readyPages.length + 1}...` : 'Abriendo PDF...'}
              </div>
            )}
          </div>
        ) : loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '40px', color: '#a9afbc', fontSize: '0.85rem' }}>
            <RefreshCw size={16} className="spin" /> Abriendo documento...
          </div>
        ) : kind === 'text' ? (
          <pre style={{ margin: 0, padding: '14px', borderRadius: '12px', background: '#0f1115', color: '#e5e7eb', fontSize: '0.78rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
            {text || '(archivo vacío)'}
          </pre>
        ) : kind === 'docx' ? (
          <div
            className="kb-content"
            style={{ padding: '18px', borderRadius: '12px', background: '#ffffff', color: '#1c1f26' }}
            dangerouslySetInnerHTML={{ __html: html || '<p>(documento vacío)</p>' }}
          />
        ) : (
          <div style={{ marginTop: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center', color: '#e5e7eb' }}>
            <FileWarning size={40} color="#f5a524" />
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Este tipo de archivo no se puede ver dentro de la app.</div>
            <div style={{ fontSize: '0.8rem', color: '#a9afbc', maxWidth: '320px' }}>Se pueden ver PDF, imágenes, Word (.docx) y archivos de texto. Ábrelo con otra aplicación del teléfono.</div>
            <button type="button" onClick={openOutside} disabled={!blobUrl} style={{ ...buttonStyle, padding: '11px 16px', background: '#f5a524', color: '#1c1f26' }}>
              <ExternalLink size={16} /> Abrir fuera de la app
            </button>
          </div>
        )}
      </div>

      {zoomPage !== null && (
        <ImageViewer
          images={readyPages.map((p, i) => ({ src: p.url, alt: `Página ${i + 1}` }))}
          initialIndex={zoomPage}
          onClose={() => setZoomPage(null)}
        />
      )}
    </div>,
    document.body
  );
};
