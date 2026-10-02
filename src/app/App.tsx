import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { getConfigurator, findLayer, useConfigurator, type ToolId } from '../core/state/store';
import { clamp } from '../core/geometry';
import { Editor2D } from './editor/Editor2D';
import { QuoteContext, useQuote } from './hooks/usePricing';
import { useServices } from './services';
import { AtlasThumbnail } from './ui/AtlasThumbnail';
import { BottomBar } from './ui/BottomBar';
import { CheckoutDialog } from './ui/CheckoutDialog';
import { Icon, type IconName } from './ui/Icon';
import { BackgroundPanel } from './ui/panels/BackgroundPanel';
import { LayersPanel } from './ui/panels/LayersPanel';
import { ProductPanel } from './ui/panels/ProductPanel';
import { TextPanel } from './ui/panels/TextPanel';
import { UploadsPanel } from './ui/panels/UploadsPanel';
import { TopBar } from './ui/TopBar';
import { ViewButtons } from './ui/ViewButtons';

// Three.js, R3F and drei live in their own chunk: the editor is usable while the 3D view loads.
const Viewer3D = lazy(() => import('./viewer/Viewer3D').then((m) => ({ default: m.Viewer3D })));

const TOOLS: { id: ToolId; label: string; icon: IconName }[] = [
  { id: 'product', label: 'Product', icon: 'product' },
  { id: 'uploads', label: 'Uploads', icon: 'upload' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'background', label: 'Colour', icon: 'palette' },
  { id: 'layers', label: 'Layers', icon: 'layers' },
];

export function App() {
  const quote = useQuote();
  const { bridge, embed } = useServices();
  const mode = useConfigurator((s) => s.mode);
  const tool = useConfigurator((s) => s.tool);
  const product = useConfigurator((s) => s.product);
  const selectedLayerId = useConfigurator((s) => s.selectedLayerId);
  const design = useConfigurator((s) => s.design);
  const { setTool, setMode } = getConfigurator();
  const [toast, setToast] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState<false | 'cart' | 'pdf'>(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  // Selecting a layer on the canvas opens the matching tool panel.
  const selectedType = findLayer(design, selectedLayerId)?.layer.type;
  useEffect(() => {
    if (selectedType === 'text') setTool('text');
    if (selectedType === 'image') setTool('uploads');
  }, [selectedType, setTool]);

  useKeyboardShortcuts();

  // Embedded: announce readiness and keep the host informed of our height (inline embeds).
  useEffect(() => {
    if (!bridge) return;
    bridge.send({ type: 'ready', productId: product.id });
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => bridge.send({ type: 'resize', height: el.scrollHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [bridge, product.id]);

  return (
    <QuoteContext.Provider value={quote}>
      <div ref={rootRef} className="cfg" data-mode={mode} data-panel={tool ? 'open' : 'closed'}>
        <TopBar onAddToCart={() => setCheckoutOpen('cart')} onDownloadPdf={() => setCheckoutOpen('pdf')} onClose={embed.embedded ? () => bridge?.send({ type: 'close' }) : undefined} />
        <div className="cfg-body">
          <nav className="rail" aria-label="Tools">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" className={`rail-button${tool === t.id ? ' is-on' : ''}`} aria-pressed={tool === t.id} onClick={() => setTool(tool === t.id ? null : t.id)}>
                <Icon name={t.icon} size={20} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
          {tool && (
            <aside className="panel" aria-label={`${TOOLS.find((t) => t.id === tool)?.label} options`}>
              <header className="panel-header">
                <h2>{TOOLS.find((t) => t.id === tool)?.label}</h2>
                <button type="button" className="icon-button" aria-label="Close panel" onClick={() => setTool(null)}>
                  <Icon name="close" />
                </button>
              </header>
              {tool === 'product' && <ProductPanel />}
              {tool === 'uploads' && <UploadsPanel onError={notify} />}
              {tool === 'text' && <TextPanel />}
              {tool === 'background' && <BackgroundPanel />}
              {tool === 'layers' && <LayersPanel />}
            </aside>
          )}
          <main className="stage">
            <div className="stage-2d" hidden={mode !== '2d'}>
              <Editor2D onUploadError={notify} />
            </div>
            <div className={mode === '3d' ? 'viewer viewer-full' : 'viewer viewer-thumb'}>
              <Suspense fallback={<div className="viewer-fallback">Loading 3D preview…</div>}>
                <Viewer3D compact={mode !== '3d'} />
              </Suspense>
              {mode === '2d' && (
                <button type="button" className="viewer-thumb-hit" aria-label="Open 3D preview" onClick={() => setMode('3d')}>
                  <span className="badge">
                    <Icon name="cube" size={14} /> 3D
                  </span>
                </button>
              )}
            </div>
            {mode === '3d' && (
              <>
                <ViewButtons />
                <AtlasThumbnail onOpen={() => setMode('2d')} />
                <p className="stage-hint">Drag to orbit · scroll to zoom · drag artwork to move it on the tent</p>
              </>
            )}
            <BottomBar />
          </main>
        </div>
        {checkoutOpen && <CheckoutDialog intent={checkoutOpen} onClose={() => setCheckoutOpen(false)} />}
        <div className="toast-region" role="status" aria-live="polite">
          {toast && (
            <div className="toast">
              <Icon name="alert" /> {toast}
            </div>
          )}
        </div>
      </div>
    </QuoteContext.Provider>
  );
}

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      const s = getConfigurator();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      const found = findLayer(s.design, s.selectedLayerId);
      if (!found) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.removeLayer(found.layer.id);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        s.duplicateLayer(found.layer.id);
      } else if (e.key === 'Escape') {
        s.selectLayer(null);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.004;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        if (!e.repeat) s.checkpoint();
        s.updateLayer(found.layer.id, { x: clamp(found.layer.x + dx, -0.5, 0.5), y: clamp(found.layer.y + dy, -0.5, 0.5) }, { history: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
