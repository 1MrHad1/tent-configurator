import { beforeEach, describe, expect, it } from 'vitest';
import { canopyTent } from '../../products/canopy-tent/definition';
import { pruneUnusedAssets } from '../design/factory';
import type { Asset } from '../design/schema';
import { useConfigurator } from './store';

const asset = (id: string): Asset => ({ id, name: `${id}.png`, mime: 'image/png', width: 400, height: 200, bytes: 1000, src: 'data:image/png;base64,AA' });
const s = () => useConfigurator.getState();
const imageCount = () => Object.values(s().design.surfaces).flatMap((x) => x.layers).length;

describe('deleting uploads', () => {
  beforeEach(() => s().init(canopyTent));

  it('removeLayer deletes the placement but keeps the upload for reuse', () => {
    s().addImage(asset('a'), 'valance-front');
    s().removeLayer(s().design.surfaces['valance-front'].layers[0].id);
    expect(imageCount()).toBe(0);
    expect(Object.keys(s().design.assets)).toEqual(['a']);
  });

  it('removeAsset deletes the upload and every layer using it, as one undo step', () => {
    s().addImage(asset('a'), 'valance-front');
    s().copyLayerToGroup(s().design.surfaces['valance-front'].layers[0].id);
    s().addImage(asset('b'), 'roof-front');
    expect(imageCount()).toBe(5);

    s().removeAsset('a');
    expect(Object.keys(s().design.assets)).toEqual(['b']);
    expect(imageCount()).toBe(1);
    expect(s().selectedLayerId).toBe(s().design.surfaces['roof-front'].layers[0].id);

    s().undo();
    expect(imageCount()).toBe(5);
    expect(Object.keys(s().design.assets).sort()).toEqual(['a', 'b']);
  });

  it('pruneUnusedAssets drops uploads with no layers before saving', () => {
    s().addImage(asset('a'), 'valance-front');
    s().addImage(asset('b'), 'roof-front');
    s().removeLayer(s().design.surfaces['roof-front'].layers[0].id);
    expect(Object.keys(pruneUnusedAssets(s().design).assets)).toEqual(['a']);
  });
});
