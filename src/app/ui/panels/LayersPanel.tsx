import { geometryFor, isSurfaceAvailable } from '../../../core/design/factory';
import { getConfigurator, useConfigurator } from '../../../core/state/store';
import { IconButton } from '../controls';

/** Every panel and its layers at a glance; the fastest way to find and select artwork. */
export function LayersPanel() {
  const product = useConfigurator((s) => s.product);
  const design = useConfigurator((s) => s.design);
  const selectedSurfaceId = useConfigurator((s) => s.selectedSurfaceId);
  const selectedLayerId = useConfigurator((s) => s.selectedLayerId);
  const { selectSurface, selectLayer, removeLayer, setTool } = getConfigurator();

  return (
    <div className="panel-body">
      <ul className="layer-tree">
        {geometryFor(product, design).surfaces.map((surface) => {
          const available = isSurfaceAvailable(product, surface.id, design.options);
          const layers = design.surfaces[surface.id]?.layers ?? [];
          return (
            <li key={surface.id} className={!available ? 'is-disabled' : ''}>
              <button type="button" className={`tree-surface${surface.id === selectedSurfaceId && !selectedLayerId ? ' is-on' : ''}`} onClick={() => available && selectSurface(surface.id)} disabled={!available}>
                <span className="dot" style={{ background: design.surfaces[surface.id]?.fill }} />
                <span>{product.surfaceLabels[surface.id] ?? surface.id}</span>
                <span className="tree-meta">{available ? `${surface.physical.widthIn.toFixed(0)}″ × ${surface.physical.heightIn.toFixed(0)}″` : 'not printed'}</span>
              </button>
              {available && layers.length > 0 && (
                <ul>
                  {[...layers].reverse().map((layer) => (
                    <li key={layer.id} className="tree-layer-row">
                      <button
                        type="button"
                        className={`tree-layer${layer.id === selectedLayerId ? ' is-on' : ''}`}
                        onClick={() => {
                          selectLayer(layer.id);
                          setTool(layer.type === 'text' ? 'text' : 'uploads');
                        }}
                      >
                        {layer.type === 'text' ? `“${layer.text.split('\n')[0] || ' '}”` : (design.assets[layer.assetId]?.name ?? 'Image')}
                      </button>
                      <IconButton icon="trash" label="Delete layer" onClick={() => removeLayer(layer.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
