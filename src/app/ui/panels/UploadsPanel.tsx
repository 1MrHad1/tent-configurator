import { useRef, useState } from 'react';
import { createAsset } from '../../../core/assets/upload';
import type { ImageLayer } from '../../../core/design/schema';
import { getConfigurator, findLayer, useConfigurator } from '../../../core/state/store';
import { Slider } from '../controls';
import { Icon } from '../Icon';
import { LayerControls } from './LayerControls';
import { SurfaceTarget } from './SurfaceTarget';

export function UploadsPanel({ onError }: { onError: (message: string) => void }) {
  const product = useConfigurator((s) => s.product);
  const design = useConfigurator((s) => s.design);
  const selectedLayerId = useConfigurator((s) => s.selectedLayerId);
  const { addImage, updateLayer, removeAsset } = getConfigurator();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const found = findLayer(design, selectedLayerId);
  const layer = found?.layer.type === 'image' ? (found.layer as ImageLayer) : null;

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      try {
        addImage(await createAsset(file, product));
      } catch (error) {
        onError((error as Error).message);
      }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  };

  return (
    <div className="panel-body">
      <SurfaceTarget />
      <button type="button" className="button button-primary button-block" onClick={() => input.current?.click()} disabled={busy}>
        <Icon name="upload" /> {busy ? 'Processing…' : 'Add images'}
      </button>
      <input ref={input} type="file" hidden multiple accept={product.limits.acceptedTypes.join(',')} onChange={(e) => upload(e.target.files)} />
      <p className="panel-note">JPG, PNG, WebP or SVG, up to {Math.round(product.limits.maxUploadBytes / 1048576)} MB. You can also drop files onto a panel.</p>

      {Object.values(design.assets).length > 0 && (
        <div className="asset-grid" role="group" aria-label="Your uploads">
          {Object.values(design.assets).map((asset) => (
            <div key={asset.id} className="asset-tile">
              <button type="button" className="asset" title={`Add ${asset.name} to the selected panel`} onClick={() => addImage(asset)}>
                <img src={asset.src} alt={asset.name} />
              </button>
              <button
                type="button"
                className="asset-remove"
                aria-label={`Delete upload ${asset.name}`}
                title="Delete this upload (also removes it from the tent)"
                onClick={() => removeAsset(asset.id)}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {layer && found ? (
        <div className="layer-editor">
          <h3 className="panel-subtitle">Selected image</h3>
          <Slider label="Size" value={layer.width} min={0.03} max={1.2} step={0.005} format={(v) => `${Math.round(v * 100)}% of width`} onChange={(width) => updateLayer(layer.id, { width }, { history: false })} />
          <button type="button" className="button button-ghost button-block" onClick={() => updateLayer(layer.id, { flipX: !layer.flipX })}>
            <Icon name="flip" /> {layer.flipX ? 'Unmirror' : 'Mirror'}
          </button>
          <LayerControls layer={layer} surfaceId={found.surfaceId} />
        </div>
      ) : (
        <p className="panel-note">Select an image on the canvas to resize, rotate, arrange or delete it.</p>
      )}
    </div>
  );
}
