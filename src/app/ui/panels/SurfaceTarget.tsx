import { surfacesFor } from '../../../core/design/factory';
import { useConfigurator } from '../../../core/state/store';

/** Which panel new artwork goes onto. Mirrors the selection in the 2D and 3D views. */
export function SurfaceTarget() {
  const product = useConfigurator((s) => s.product);
  const design = useConfigurator((s) => s.design);
  const selectedSurfaceId = useConfigurator((s) => s.selectedSurfaceId);
  const selectSurface = useConfigurator((s) => s.selectSurface);
  const surfaces = surfacesFor(product, design);
  return (
    <label className="field">
      <span className="field-label">
        <span>Panel</span>
      </span>
      <select value={selectedSurfaceId} onChange={(e) => selectSurface(e.target.value)}>
        {product.surfaceGroups.map((group) => (
          <optgroup key={group.id} label={group.label}>
            {surfaces
              .filter((s) => s.group === group.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {product.surfaceLabels[s.id] ?? s.id}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
