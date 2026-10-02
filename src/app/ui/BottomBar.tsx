import { getConfigurator, findLayer, useConfigurator } from '../../core/state/store';
import { geometryFor } from '../../core/design/factory';
import { useEditorView } from '../editor/editorView';
import { useViewerControls } from '../viewer/viewerControls';
import { IconButton } from './controls';

export function BottomBar() {
  const past = useConfigurator((s) => s.past.length);
  const future = useConfigurator((s) => s.future.length);
  const mode = useConfigurator((s) => s.mode);
  const product = useConfigurator((s) => s.product);
  const design = useConfigurator((s) => s.design);
  const selectedSurfaceId = useConfigurator((s) => s.selectedSurfaceId);
  const selectedLayerId = useConfigurator((s) => s.selectedLayerId);
  const { undo, redo } = getConfigurator();
  const { zoom, zoomAt, fit } = useEditorView();
  const { uvGrid, toggleUvGrid } = useViewerControls();
  const surface = geometryFor(product, design).surfaces.find((s) => s.id === selectedSurfaceId);
  const layer = findLayer(design, selectedLayerId)?.layer;

  return (
    <div className="bottombar" role="toolbar" aria-label="Editor">
      <IconButton icon="undo" label="Undo (Ctrl+Z)" onClick={undo} disabled={past === 0} />
      <IconButton icon="redo" label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={future === 0} />
      {mode === '2d' && (
        <>
          <span className="divider" />
          <IconButton icon="minus" label="Zoom out" onClick={() => zoomAt(1 / 1.25)} />
          <button type="button" className="zoom-label" onClick={fit} title="Fit to screen">
            {zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}
          </button>
          <IconButton icon="plus" label="Zoom in" onClick={() => zoomAt(1.25)} />
        </>
      )}
      <span className="divider" />
      <IconButton icon="grid" label={uvGrid ? 'Hide UV grid on the 3D model' : 'Show UV grid on the 3D model'} onClick={toggleUvGrid} active={uvGrid} />
      {surface && (
        <>
          <span className="divider hide-xs" />
          <span className="selection-label hide-xs">
            {product.surfaceLabels[surface.id]} · {surface.physical.widthIn.toFixed(0)}″ × {surface.physical.heightIn.toFixed(0)}″
            {layer ? ` · ${layer.type === 'text' ? 'text' : 'image'} selected` : ''}
          </span>
        </>
      )}
    </div>
  );
}
