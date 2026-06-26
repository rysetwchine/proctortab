import { useEffect, useMemo, useRef, useState } from 'react';

// We intentionally use pdfjs-dist directly for page rendering (canvas),
// and we do NOT extract/convert PDF text.
let pdfjsLib: any = null;
let cachedWorkerUrl: string | null = null;

async function initializePdfJs() {
  if (pdfjsLib) return pdfjsLib;

  // IMPORTANT:
  // Use a literal specifier so Vite can bundle the dependency.
  // The string-concatenation trick can leave a runtime bare-specifier import in the browser
  // ("Failed to resolve module specifier 'pdfjs-dist'").
  const pdfjsModule: any = await import('pdfjs-dist');

  // Normalize module shape across versions/bundlers.
  const normalized =
    pdfjsModule?.getDocument
      ? pdfjsModule
      : pdfjsModule?.default?.getDocument
        ? pdfjsModule.default
        : pdfjsModule?.pdfjsLib?.getDocument
          ? pdfjsModule.pdfjsLib
          : pdfjsModule;

  pdfjsLib = normalized;

  // Worker setup: use CDN worker (keeps behavior consistent with current project).
  if (!cachedWorkerUrl) {
    cachedWorkerUrl = 'https://unpkg.com/pdfjs-dist@5.7.284/build/pdf.worker.min.mjs';
  }
  if (pdfjsLib?.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = cachedWorkerUrl;
  }

  return pdfjsLib;
}

type Props = {
  fileUrl: string;
  className?: string;
};

function PdfPageCanvas({
  pdf,
  pageNumber,
  scale,
}: {
  pdf: any;
  pageNumber: number;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        // Render page into canvas (no text layer, no extraction).
        const renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to render page');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale]);

  if (error) {
    return <div className="text-sm text-destructive">Failed to render page {pageNumber}: {error}</div>;
  }

  return <canvas ref={canvasRef} className="block max-w-full h-auto bg-white shadow-sm rounded" />;
}

/**
 * In-app PDF viewer:
 * - Shows original PDF visually (canvas render per page)
 * - Scroll container
 * - Incremental rendering (loads more pages as user scrolls)
 */
export function PdfViewer({ fileUrl, className }: Props) {
  const [pdf, setPdf] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [pagesToRender, setPagesToRender] = useState<number>(3);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Rough scale that fits inside the dialog nicely.
  const scale = 1.5;

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setNumPages(0);
    setError(null);
    setPagesToRender(3);

    (async () => {
      try {
        const lib = await initializePdfJs();
        const loadingTask = lib.getDocument({
          url: fileUrl,
          withCredentials: false,
        });
        const loaded = await loadingTask.promise;
        if (cancelled) return;
        setPdf(loaded);
        setNumPages(loaded.numPages || 0);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load PDF');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  const targetPages = useMemo(() => {
    if (!numPages) return 0;
    return Math.min(numPages, pagesToRender);
  }, [numPages, pagesToRender]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      if (!numPages) return;
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 800;
      if (nearBottom) {
        setPagesToRender((p) => Math.min(numPages, p + 3));
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [numPages]);

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Failed to load PDF: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className ?? 'h-[70vh] w-full overflow-auto rounded border bg-muted/30'}
    >
      <div className="p-3 flex flex-col items-center gap-4">
        {!pdf && <div className="text-sm text-muted-foreground">Loading PDF…</div>}

        {pdf &&
          Array.from({ length: targetPages }, (_, idx) => (
            <PdfPageCanvas
              key={`pdf-page-${idx + 1}`}
              pdf={pdf}
              pageNumber={idx + 1}
              scale={scale}
            />
          ))}

        {pdf && numPages > targetPages && (
          <div className="py-3 text-xs text-muted-foreground">
            Scroll to load more pages… ({targetPages}/{numPages})
          </div>
        )}
      </div>
    </div>
  );
}
