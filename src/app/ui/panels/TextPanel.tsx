import type { TextLayer } from '../../../core/design/schema';
import { findLayer, useConfigurator } from '../../../core/state/store';
import { ColorField, Field, Segmented, Slider } from '../controls';
import { Icon } from '../Icon';
import { LayerControls } from './LayerControls';
import { SurfaceTarget } from './SurfaceTarget';

export function TextPanel() {
  const product = useConfigurator((s) => s.product);
  const design = useConfigurator((s) => s.design);
  const selectedLayerId = useConfigurator((s) => s.selectedLayerId);
  const { addText, updateLayer, checkpoint } = useConfigurator.getState();
  const found = findLayer(design, selectedLayerId);
  const layer = found?.layer.type === 'text' ? (found.layer as TextLayer) : null;
  const set = (patch: Partial<TextLayer>) => layer && updateLayer(layer.id, patch);
  const font = product.fonts.find((f) => f.family === layer?.fontFamily);

  return (
    <div className="panel-body">
      <SurfaceTarget />
      <button type="button" className="button button-primary button-block" onClick={() => addText()}>
        <Icon name="text" /> Add text
      </button>

      {layer && found ? (
        <div className="layer-editor">
          <h3 className="panel-subtitle">Selected text</h3>
          <Field label="Text">
            <textarea
              rows={2}
              maxLength={200}
              value={layer.text}
              onFocus={checkpoint}
              onChange={(e) => updateLayer(layer.id, { text: e.target.value }, { history: false })}
            />
          </Field>
          <Field label="Font">
            <select
              value={layer.fontFamily}
              style={{ fontFamily: `"${layer.fontFamily}"` }}
              onChange={(e) => {
                const next = product.fonts.find((f) => f.family === e.target.value)!;
                set({ fontFamily: next.family, fontWeight: next.weights.includes(layer.fontWeight) ? layer.fontWeight : (next.weights[0] as 400 | 700) });
              }}
            >
              {product.fonts.map((f) => (
                <option key={f.family} value={f.family} style={{ fontFamily: `"${f.family}"` }}>
                  {f.family}
                </option>
              ))}
            </select>
          </Field>
          <div className="toolbar-row">
            <Segmented
              label="Weight"
              value={String(layer.fontWeight)}
              options={[{ value: '400', label: 'Regular' }, ...(font?.weights.includes(700) ? [{ value: '700', label: <strong>Bold</strong> }] : [])]}
              onChange={(v) => set({ fontWeight: Number(v) as 400 | 700 })}
            />
            <button type="button" className={`icon-button${layer.italic ? ' is-on' : ''}`} aria-pressed={layer.italic} title="Italic" onClick={() => set({ italic: !layer.italic })}>
              <em style={{ fontFamily: 'Georgia, serif', fontSize: 16 }}>I</em>
            </button>
            <Segmented
              label="Alignment"
              value={layer.align}
              options={[
                { value: 'left', label: 'L', title: 'Align left' },
                { value: 'center', label: 'C', title: 'Centre' },
                { value: 'right', label: 'R', title: 'Align right' },
              ]}
              onChange={(align) => set({ align })}
            />
          </div>
          <Slider label="Size" value={layer.fontSize} min={0.01} max={0.6} step={0.002} format={(v) => `${Math.round(v * 100)}% of width`} onChange={(fontSize) => updateLayer(layer.id, { fontSize }, { history: false })} />
          <Slider label="Letter spacing" value={layer.letterSpacing} min={-0.1} max={0.6} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(letterSpacing) => updateLayer(layer.id, { letterSpacing }, { history: false })} />
          <ColorField label="Text colour" value={layer.fill} swatches={product.palette} onChange={(fill) => set({ fill })} />
          <Field label="Outline">
            <div className="toolbar-row">
              <Segmented
                label="Outline"
                value={layer.stroke && layer.strokeWidth > 0 ? 'on' : 'off'}
                options={[
                  { value: 'off', label: 'None' },
                  { value: 'on', label: 'Outline' },
                ]}
                onChange={(v) => set(v === 'on' ? { stroke: layer.stroke ?? '#ffffff', strokeWidth: layer.strokeWidth || 0.05 } : { stroke: null, strokeWidth: 0 })}
              />
              {layer.stroke && layer.strokeWidth > 0 && (
                <input type="color" aria-label="Outline colour" value={layer.stroke} onChange={(e) => set({ stroke: e.target.value })} />
              )}
            </div>
          </Field>
          {layer.stroke && layer.strokeWidth > 0 && (
            <Slider label="Outline width" value={layer.strokeWidth} min={0.01} max={0.2} step={0.005} format={(v) => `${Math.round(v * 100)}%`} onChange={(strokeWidth) => updateLayer(layer.id, { strokeWidth }, { history: false })} />
          )}
          <LayerControls layer={layer} surfaceId={found.surfaceId} />
        </div>
      ) : (
        <p className="panel-note">Select a text layer on the canvas to edit its content, font, colour and placement.</p>
      )}
    </div>
  );
}
