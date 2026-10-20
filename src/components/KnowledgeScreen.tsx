import React, { useState, useEffect, useRef } from 'react';
import type { GLPISession } from '../types/glpi';
import { KnowledgeService } from '../services/knowledgeService';
import type { KbArticle, KbCategory, KbArticleContent, KbAttachment } from '../services/knowledgeService';
import { ImageViewer, type ViewerImage } from './ImageViewer';
import { DocumentViewer } from './DocumentViewer';
import { BookOpen, Search, RefreshCw, ArrowLeft, Eye, Paperclip, FolderOpen, ChevronRight, X } from 'lucide-react';

interface KnowledgeScreenProps {
  session: GLPISession;
  // Avisa si hay un artículo abierto (para desactivar el cambio de módulo deslizando)
  onArticleOpenChange?: (open: boolean) => void;
}

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const formatDate = (value: string) => {
  const d = new Date(value.replace(' ', 'T'));
  return isNaN(d.getTime()) ? value : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

const chipStyle = (active: boolean): React.CSSProperties => ({
  flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '999px',
  border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border-color)'}`,
  background: active ? 'rgba(245, 165, 36, 0.12)' : 'var(--card-bg)',
  color: active ? 'var(--primary)' : 'var(--text-main)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap'
});

// Base de conocimiento de GLPI (solo consulta): búsqueda, menú de categorías y lectura de artículos
export const KnowledgeScreen: React.FC<KnowledgeScreenProps> = ({ session, onArticleOpenChange }) => {
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [articles, setArticles] = useState<KbArticle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  // Ruta de categorías elegidas: [] = todas; [padre, hija, ...] al ir bajando por el menú
  const [path, setPath] = useState<number[]>([]);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [openArticle, setOpenArticle] = useState<KbArticle | null>(null);

  useEffect(() => { onArticleOpenChange?.(openArticle !== null); }, [openArticle, onArticleOpenChange]);
  useEffect(() => () => onArticleOpenChange?.(false), [onArticleOpenChange]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([KnowledgeService.getCategories(session), KnowledgeService.getArticles(session)])
      .then(([cats, arts]) => { if (!cancelled) { setCategories(cats); setArticles(arts); setError(null); } })
      .catch(err => { if (!cancelled) { setError(err.message || 'No se pudo cargar la base de conocimiento.'); setArticles([]); } });
    return () => { cancelled = true; };
  }, [session, reloadKey]);

  if (openArticle) {
    return (
      <ArticleView
        // key: al saltar a otro artículo (enlace interno) la vista se reinicia desde cero
        key={openArticle.id}
        session={session}
        article={openArticle}
        categories={categories}
        onBack={() => setOpenArticle(null)}
        onOpenArticle={(id) => {
          const target = (articles || []).find(a => a.id === id);
          if (target) setOpenArticle(target);
          return !!target;
        }}
      />
    );
  }

  // Categoría y todas las que cuelgan de ella (un artículo de "Software › SAGA" cuenta en "Software")
  const descendantsOf = (id: number): number[] => {
    const result = [id];
    categories.filter(c => c.parentId === id).forEach(child => result.push(...descendantsOf(child.id)));
    return result;
  };
  const countIn = (id: number) => {
    const ids = new Set(descendantsOf(id));
    return (articles || []).filter(a => a.categoryIds.some(c => ids.has(c))).length;
  };

  const current = path[path.length - 1];
  const childrenOf = (parentId: number) => categories.filter(c => c.parentId === parentId);
  // Nivel del menú que se muestra: raíz o las subcategorías de la elegida
  const level = childrenOf(current ?? 0);
  const uncategorized = (articles || []).filter(a => a.categoryIds.length === 0).length;

  const words = normalize(search.trim()).split(/\s+/).filter(Boolean);
  const scope = current !== undefined && current !== -1 ? new Set(descendantsOf(current)) : null;
  const filtered = (articles || [])
    .filter(a => (current === -1 ? a.categoryIds.length === 0 : !scope || a.categoryIds.some(c => scope.has(c))))
    .filter(a => !words.length || words.every(w => normalize(`${a.title} ${a.snippet}`).includes(w)));

  const categoryLabel = (a: KbArticle) => a.categoryIds
    .map(id => categories.find(c => c.id === id)?.completename)
    .filter(Boolean)
    .join(' · ')
    .replace(/ > /g, ' › ');

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '14px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen color="var(--primary)" size={22} /> Conocimiento
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          Artículos publicados de la base de conocimiento de GLPI
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div className="input-wrapper" style={{ flex: 1 }}>
          <Search className="input-icon" size={18} />
          <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar en títulos y contenido..." />
        </div>
        <button
          type="button"
          onClick={() => { setArticles(null); setReloadKey(k => k + 1); }}
          aria-label="Actualizar"
          style={{ padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)', cursor: 'pointer' }}
        >
          <RefreshCw size={16} className={articles === null ? 'spin' : ''} />
        </button>
      </div>

      {/* Menú de categorías: ruta elegida + subcategorías del nivel actual */}
      {categories.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          {path.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px', marginBottom: '8px', fontSize: '0.78rem', fontWeight: 700 }}>
              <button type="button" onClick={() => setPath([])} style={{ border: 'none', background: 'none', padding: 0, color: 'var(--primary)', cursor: 'pointer', fontWeight: 700 }}>
                Todas
              </button>
              {path.map((id, i) => (
                <React.Fragment key={id}>
                  <ChevronRight size={14} color="var(--text-muted)" />
                  <button
                    type="button"
                    onClick={() => setPath(path.slice(0, i + 1))}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: i === path.length - 1 ? 'var(--text-main)' : 'var(--primary)' }}
                  >
                    {id === -1 ? 'Sin categoría' : categories.find(c => c.id === id)?.name}
                  </button>
                </React.Fragment>
              ))}
              <button type="button" onClick={() => setPath([])} aria-label="Quitar categoría"
                style={{ display: 'flex', marginLeft: '4px', padding: '3px', border: 'none', borderRadius: '50%', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={12} />
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
            {path.length === 0 && (
              <button type="button" style={chipStyle(true)} onClick={() => setPath([])}>
                Todas <span style={{ opacity: 0.7 }}>{articles?.length ?? ''}</span>
              </button>
            )}
            {level.map(cat => (
              <button key={cat.id} type="button" style={chipStyle(false)} onClick={() => setPath([...path, cat.id])}>
                <FolderOpen size={14} /> {cat.name} <span style={{ opacity: 0.6 }}>{countIn(cat.id)}</span>
              </button>
            ))}
            {path.length === 0 && uncategorized > 0 && (
              <button type="button" style={chipStyle(false)} onClick={() => setPath([-1])}>
                Sin categoría <span style={{ opacity: 0.6 }}>{uncategorized}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {articles === null ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
          <RefreshCw className="spin" size={24} style={{ marginBottom: '8px' }} />
          <div style={{ fontSize: '0.85rem' }}>Cargando base de conocimiento...</div>
        </div>
      ) : error ? (
        <div className="card" style={{ color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {words.length ? 'Ningún artículo coincide con la búsqueda.' : 'No hay artículos en esta categoría.'}
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', padding: '0 4px' }}>
            {filtered.length} artículo{filtered.length === 1 ? '' : 's'}
          </div>
          {filtered.map(article => (
            <div
              key={article.id}
              className="card card-interactive"
              onClick={() => setOpenArticle(article)}
              style={{ padding: '14px', marginBottom: '8px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.3 }}>{article.title}</div>
                <ChevronRight size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </div>
              {categoryLabel(article) && (
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', marginTop: '4px' }}>{categoryLabel(article)}</div>
              )}
              {article.snippet && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {article.snippet}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: '8px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Eye size={12} /> {article.views} vistas</span>
                <span>Actualizado {formatDate(article.dateMod)}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

// ── Lectura de un artículo
const ArticleView: React.FC<{
  session: GLPISession; article: KbArticle; categories: KbCategory[]; onBack: () => void;
  // Abre otro artículo (enlace interno); false si el usuario no puede verlo
  onOpenArticle: (id: number) => boolean;
}> = ({ session, article, categories, onBack, onOpenArticle }) => {
  const [content, setContent] = useState<KbArticleContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Adjunto abierto en el visor de documentos
  const [viewingAttachment, setViewingAttachment] = useState<KbAttachment | null>(null);
  // Imágenes del artículo abiertas en el visor (galería) y la que se tocó
  const [zoomImages, setZoomImages] = useState<{ images: ViewerImage[]; index: number } | null>(null);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    KnowledgeService.getArticleContent(session, article.id)
      .then(c => {
        urlsRef.current.push(...c.objectUrls);
        if (!cancelled) setContent(c);
      })
      .catch(err => { if (!cancelled) setError(err.message || 'No se pudo abrir el artículo.'); });
    return () => { cancelled = true; };
  }, [session, article.id]);

  // Liberar imágenes y adjuntos descargados al cerrar el artículo
  useEffect(() => () => { urlsRef.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const categoryText = article.categoryIds
    .map(id => categories.find(c => c.id === id)?.completename)
    .filter(Boolean)
    .join(' · ')
    .replace(/ > /g, ' › ');

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
      <button
        type="button"
        onClick={onBack}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
      >
        <ArrowLeft size={18} /> Conocimiento
      </button>

      <div className="card">
        {categoryText && <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>{categoryText}</div>}
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.3 }}>{article.title}</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: '8px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Eye size={12} /> {article.views} vistas</span>
          <span>Actualizado {formatDate(article.dateMod)}</span>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '14px', paddingTop: '14px' }}>
          {error ? (
            <div style={{ color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>{error}</div>
          ) : !content ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <RefreshCw size={16} className="spin" /> Cargando artículo...
            </div>
          ) : (
            // HTML sanitizado con DOMPurify en KnowledgeService (sin scripts ni eventos)
            <div
              className="kb-content"
              dangerouslySetInnerHTML={{ __html: content.html }}
              onClick={e => {
                // Imagen: se abre en el visor con zoom
                const img = (e.target as HTMLElement).closest('img') as HTMLImageElement | null;
                if (img?.src) {
                  e.preventDefault();
                  // Todas las imágenes del artículo, para pasar de una a otra deslizando
                  const all = [...(e.currentTarget as HTMLElement).querySelectorAll('img')].filter(i => i.src);
                  setZoomImages({ images: all.map(i => ({ src: i.src, alt: i.alt })), index: Math.max(0, all.indexOf(img)) });
                  return;
                }
                // Enlace a otro artículo de la base de conocimiento: se abre aquí mismo
                const link = (e.target as HTMLElement).closest('a[data-kb-id]') as HTMLAnchorElement | null;
                if (link && onOpenArticle(Number(link.dataset.kbId))) {
                  e.preventDefault();
                  window.scrollTo({ top: 0 });
                }
              }}
            />
          )}
        </div>
      </div>

      {zoomImages && <ImageViewer images={zoomImages.images} initialIndex={zoomImages.index} onClose={() => setZoomImages(null)} />}
      {viewingAttachment && (
        <DocumentViewer
          session={session}
          doc={{ id: viewingAttachment.id, name: viewingAttachment.name, filename: viewingAttachment.filename, mime: viewingAttachment.mime }}
          onClose={() => setViewingAttachment(null)}
        />
      )}

      {content && content.attachments.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
            <Paperclip size={14} /> Documentos adjuntos ({content.attachments.length})
          </div>
          {content.attachments.map(att => (
            <button
              key={att.id}
              type="button"
              onClick={() => setViewingAttachment(att)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', border: 'none', borderTop: '1px solid var(--border-color)', background: 'none', textAlign: 'left', cursor: 'pointer' }}
            >
              <Paperclip size={16} color="var(--primary)" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)', wordBreak: 'break-word' }}>{att.name}</span>
                {att.mime && <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{att.mime}</span>}
              </span>
              <ChevronRight size={16} color="var(--text-muted)" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
