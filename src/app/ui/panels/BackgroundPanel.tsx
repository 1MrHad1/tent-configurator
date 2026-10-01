import { useState } from 'react';
import { surfacesFor } from '../../../core/design/factory';
import { useConfigurator } from '../../../core/state/store';
import { ColorField, Field } from '../controls';

/** Background colour per panel, per group, or for the whole product. Colour is never charged. */
export function BackgroundPanel() {
  const product = useConfigurator((s) => s.product);
  const design = useConfigurator((s) => s.design);
  const selectedSurfaceId = useConfigurator((s) => s.selectedSurfaceId);
  const setFill = useConfigurator((s) => s.setFill);
  const surfaces = surfacesFor(product, design);
  const [target, setTarget] = useState('all');

  const targetIds =
    target === 'all'
      ? surfaces.map((s) => s.id)
      : target === 'selected'
        ? [selectedSurfaceId]
        : target.startsWith('group:')
          ? surfaces.filter((s) => s.group === target.slice(6)).map((s) => s.id)
          : [target];
  const current = design.surfaces[targetIds[0]]?.fill ?? product.defaultFill;
  const mixed = targetIds.some((id) => design.surfaces[id]?.fill !== current);

  return (
    <div className="panel-body">
      <Field label="Apply to">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="all">All panels (entire product)</option>
          <option value="selected">Selected panel ({product.surfaceLabels[selectedSurfaceId] ?? selectedSurfaceId})</option>
          {product.surfaceGroups.length > 1 &&
            product.surfaceGroups.map((g) => (
              <option key={g.id} value={`group:${g.id}`}>
                All {g.label.toLowerCase()}
              </option>
            ))}
          <optgroup label="Individual panels">
            {surfaces.map((s) => (
              <option key={s.id} value={s.id}>
                {product.surfaceLabels[s.id] ?? s.id}
              </option>
            ))}
          </optgroup>
        </select>
      </Field>
      <ColorField label={mixed ? 'Colour (mixed)' : 'Colour'} value={current} swatches={product.palette} onChange={(hex) => setFill(targetIds, hex)} />
      <p className="panel-note">Background colours are included in the price. Pantone codes are matched to the nearest sRGB value for preview.</p>
    </div>
  );
}
