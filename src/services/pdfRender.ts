// Conversión de un PDF (p. ej. el plano exportado de AutoCAD) a imagen PNG de alta resolución.
// pdf.js y su worker se cargan solo al elegir un PDF y se sirven desde la propia app (Vite los
// empaqueta), sin CDN. El croquis se guarda como imagen: quien lo consulta no necesita pdf.js.

type PdfDocument = {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(params: { scale: number }): { width: number; height: number };
    render(params: { canvas: HTMLCanvasElement; viewport: { width: number; height: number } }): { promise: Promise<void> };
  }>;
};

// La tarea de carga es la que libera el documento y su worker (PDFDocumentLoadingTask.destroy)
type LoadedPdf = { pdf: PdfDocument; release: () => Promise<void> };

// Límites para que el render funcione también en teléfonos (iOS no permite canvas de más de
// ~16 megapíxeles): ancho máximo 4000 px y hasta 12 megapíxeles
const MAX_WIDTH = 4000;
const MAX_PIXELS = 12_000_000;

const loadPdf = async (file: Blob): Promise<LoadedPdf> => {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const pdf = (await task.promise) as unknown as PdfDocument;
  return { pdf, release: () => task.destroy() };
};

export const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** Número de páginas del PDF (para elegir cuál es el croquis). */
export const getPdfPageCount = async (file: Blob): Promise<number> => {
  const { pdf, release } = await loadPdf(file);
  const count = pdf.numPages;
  await release();
  return count;
};

/** Renderiza una página del PDF como PNG de alta resolución. */
export const renderPdfPage = async (file: Blob, pageNumber = 1): Promise<{ blob: Blob; width: number; height: number }> => {
  const { pdf, release } = await loadPdf(file);
  try {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_WIDTH / base.width, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    // Fondo blanco: los PDF de planos suelen tener fondo transparente
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen del PDF'))), 'image/png')
    );
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    await release();
  }
};

/**
 * Renderiza las páginas de un PDF para verlo dentro de la app (resolución de pantalla, no de
 * impresión). Cada página se entrega al terminar con onPage, así se van mostrando conforme
 * llegan. Devuelve el total de páginas del documento.
 */
export const renderPdfPagesForViewing = async (
  file: Blob,
  onPage: (index: number, image: { url: string; width: number; height: number }) => void,
  options: { maxPages?: number; width?: number; isCancelled?: () => boolean } = {}
): Promise<number> => {
  const { maxPages = 60, width = 1400, isCancelled } = options;
  const { pdf, release } = await loadPdf(file);
  try {
    const total = pdf.numPages;
    for (let n = 1; n <= Math.min(total, maxPages); n++) {
      if (isCancelled?.()) break;
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(width / base.width, Math.sqrt(MAX_PIXELS / 2 / (base.width * base.height)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      await page.render({ canvas, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo mostrar la página del PDF'))), 'image/jpeg', 0.88)
      );
      onPage(n - 1, { url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height });
    }
    return total;
  } finally {
    await release();
  }
};
