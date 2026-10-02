import { useEffect, useRef } from 'react';
import { imageLookup } from '../../core/assets/images';
import { composeAtlas } from '../../core/render/composeAtlas';
import { useConfigurator } from '../../core/state/store';
import { useRenderTick } from '../hooks/useRenderTick';
import { Icon } from './Icon';

/** In 3D mode, a live flat view of the print layout (same compositor as the 3D texture). */
export function AtlasThumbnail({ onOpen }: { onOpen: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const product = useConfigurator((s) => s.product);
  const design = useConfigurator((s) => s.design);
  const tick = useRenderTick();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = canvas.current;
      if (!el) return;
      composeAtlas(el.getContext('2d')!, product, design, imageLookup(design.assets), { size: el.width, background: '#ececef', layout: 'editor' });
    });
    return () => cancelAnimationFrame(frame);
    // `tick` is a trigger: redraw once fonts or images finish loading.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [product, design, tick]);

  return (
    <button type="button" className="atlas-thumb" onClick={onOpen} aria-label="Back to the 2D editor">
      <canvas ref={canvas} width={320} height={320} />
      <span className="badge">
        <Icon name="square" size={14} /> 2D
      </span>
    </button>
  );
}
