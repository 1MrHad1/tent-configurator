import { geometryFor } from '../../../core/design/factory';
import type { Layer } from '../../../core/design/schema';
import { useConfigurator } from '../../../core/state/store';
import { IconButton, Slider } from '../controls';
import { Icon } from '../Icon';

/** Position, rotation, opacity, stacking and actions shared by text and image layers. */
export function LayerControls({ layer, surfaceId }: { layer: Layer; surfaceId: string }) {
  const product = useConfigurator((s) => s.product);
  const design = useConfigurator((s) => s.design);
  const { updateLayer, arrangeLayer, duplicateLayer, removeLayer, copyLayerToGroup } = useConfigurator.getState();
  const surface = geometryFor(product, design).surfaces.find((s) => s.id === surfaceId);
  const group = product.surfaceGroups.find((g) => g.id === surface?.group);
  const groupSize = geometryFor(product, design).surfaces.filter((s) => s.group === surface?.group).length;
  const live = (patch: Partial<Layer>) => updateLayer(layer.id, patch, { history: false });

  return (
    <>
      <Slider label="Horizontal" value={layer.x} min={-0.5} max={0.5} step={0.005} format={(v) => `${Math.round((v + 0.5) * 100)}%`} onChange={(x) => live({ x })} />
      <Slider label="Vertical" value={layer.y} min={-0.5} max={0.5} step={0.005} format={(v) => `${Math.round((v + 0.5) * 100)}%`} onChange={(y) => live({ y })} />
      <Slider label="Rotation" value={layer.rotation} min={-180} max={180} step={1} format={(v) => `${Math.round(v)}°`} onChange={(rotation) => live({ rotation })} />
      <Slider label="Opacity" value={layer.opacity} min={0.1} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => live({ opacity })} />

      <div className="toolbar-row" role="group" aria-label="Arrange">
        <IconButton icon="center" label="Centre on panel" onClick={() => updateLayer(layer.id, { x: 0, y: 0 })} />
        <IconButton icon="up" label="Bring forward" onClick={() => arrangeLayer(layer.id, 'forward')} />
        <IconButton icon="down" label="Send backward" onClick={() => arrangeLayer(layer.id, 'backward')} />
        <IconButton icon="copy" label="Duplicate" onClick={() => duplicateLayer(layer.id)} />
        <IconButton icon="trash" label="Delete" onClick={() => removeLayer(layer.id)} />
      </div>
      {group && groupSize > 1 && (
        <button type="button" className="button button-ghost button-block" onClick={() => copyLayerToGroup(layer.id)}>
          <Icon name="spread" /> Copy to all {group.label.toLowerCase()}
        </button>
      )}
    </>
  );
}
