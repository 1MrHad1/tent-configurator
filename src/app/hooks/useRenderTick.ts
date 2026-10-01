import { useEffect, useState } from 'react';
import { loadFonts } from '../../core/assets/fonts';
import { onImageLoaded } from '../../core/assets/images';
import { useConfigurator } from '../../core/state/store';

/** Changes whenever a web font or an uploaded image finishes loading, so canvases redraw. */
export function useRenderTick() {
  const fonts = useConfigurator((s) => s.product.fonts);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void loadFonts(fonts).then(() => alive && setTick((t) => t + 1));
    const off = onImageLoaded(() => setTick((t) => t + 1));
    return () => {
      alive = false;
      off();
    };
  }, [fonts]);
  return tick;
}
