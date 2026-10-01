/**
 * Configurator state. The design is immutable: every edit produces a new object, which makes
 * undo/redo a stack of references and lets React, Konva and the 3D texture subscribe cheaply.
 *
 * History: discrete edits commit immediately. Continuous gestures (dragging, slider scrubbing)
 * call `checkpoint()` once at the start and then `updateLayer(..., { history: false })`, so one
 * drag is one undo step.
 */
import { create } from 'zustand';
import { createDesign, geometryFor, newId, normalizeDesign, surfacesFor } from '../design/factory';
import type { Asset, Design, ImageLayer, Layer, TextLayer } from '../design/schema';
import { clamp } from '../geometry';
import type { ProductDefinition } from '../product/types';
import { frameOf } from '../render/composeAtlas';

export type Mode = '2d' | '3d';
export type ToolId = 'product' | 'uploads' | 'text' | 'background' | 'layers';

const HISTORY_LIMIT = 100;

export interface ConfiguratorState {
  product: ProductDefinition;
  design: Design;
  selectedSurfaceId: string;
  selectedLayerId: string | null;
  mode: Mode;
  tool: ToolId | null;
  past: Design[];
  future: Design[];

  init(product: ProductDefinition, options?: Record<string, string>): void;
  loadDesign(design: Design): void;
  setMode(mode: Mode): void;
  setTool(tool: ToolId | null): void;
  selectSurface(surfaceId: string): void;
  selectLayer(layerId: string | null): void;

  setOption(optionId: string, value: string): void;
  setQuantity(quantity: number): void;
  setNotes(notes: string): void;
  setFill(surfaceIds: string[], hex: string): void;

  addImage(asset: Asset, surfaceId?: string): void;
  addText(surfaceId?: string): void;
  updateLayer(layerId: string, patch: Partial<ImageLayer> | Partial<TextLayer>, opts?: { history?: boolean }): void;
  removeLayer(layerId: string): void;
  duplicateLayer(layerId: string): void;
  arrangeLayer(layerId: string, to: 'forward' | 'backward' | 'front' | 'back'): void;
  copyLayerToGroup(layerId: string): void;

  checkpoint(): void;
  undo(): void;
  redo(): void;
}

export function findLayer(design: Design, layerId: string | null): { surfaceId: string; layer: Layer; index: number } | null {
  if (!layerId) return null;
  for (const [surfaceId, surface] of Object.entries(design.surfaces)) {
    const index = surface.layers.findIndex((l) => l.id === layerId);
    if (index >= 0) return { surfaceId, layer: surface.layers[index], index };
  }
  return null;
}

function withLayers(design: Design, surfaceId: string, update: (layers: Layer[]) => Layer[]): Design {
  const surface = design.surfaces[surfaceId];
  return { ...design, surfaces: { ...design.surfaces, [surfaceId]: { ...surface, layers: update(surface.layers) } } };
}

export const useConfigurator = create<ConfiguratorState>()((set, get) => {
  /** Replace the design and record the previous one for undo. */
  const commit = (next: Design, extra: Partial<ConfiguratorState> = {}) => {
    const { design, past } = get();
    if (next === design) return;
    set({ design: next, past: [...past, design].slice(-HISTORY_LIMIT), future: [], ...extra });
  };

  /** Where new artwork goes: the selected surface if it is printable, else the first one. */
  const targetSurface = (surfaceId?: string) => {
    const { product, design, selectedSurfaceId } = get();
    const surfaces = surfacesFor(product, design);
    return surfaces.find((s) => s.id === (surfaceId ?? selectedSurfaceId)) ?? surfaces[0];
  };

  const insertLayer = (surfaceId: string, layer: Layer) => {
    const { design, product } = get();
    if (design.surfaces[surfaceId].layers.length >= product.limits.maxLayersPerSurface) return;
    commit(withLayers(design, surfaceId, (layers) => [...layers, layer]), {
      selectedSurfaceId: surfaceId,
      selectedLayerId: layer.id,
    });
  };

  return {
    product: null as unknown as ProductDefinition,
    design: null as unknown as Design,
    selectedSurfaceId: '',
    selectedLayerId: null,
    mode: '2d',
    // Phones start with the tool sheet closed so the whole design is visible first.
    tool: typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches ? null : 'uploads',
    past: [],
    future: [],

    init(product, options) {
      const design = createDesign(product, options);
      set({ product, design, selectedSurfaceId: surfacesFor(product, design)[0].id, selectedLayerId: null, past: [], future: [] });
    },
    loadDesign(input) {
      const { product } = get();
      const design = normalizeDesign(product, input);
      set({ design, selectedSurfaceId: surfacesFor(product, design)[0].id, selectedLayerId: null, past: [], future: [] });
    },
    setMode: (mode) => set({ mode }),
    setTool: (tool) => set({ tool }),
    selectSurface: (surfaceId) => set({ selectedSurfaceId: surfaceId, selectedLayerId: null }),
    selectLayer(layerId) {
      const found = findLayer(get().design, layerId);
      set(found ? { selectedLayerId: layerId, selectedSurfaceId: found.surfaceId } : { selectedLayerId: null });
    },

    setOption(optionId, value) {
      const { design, product, selectedSurfaceId } = get();
      const next = { ...design, options: { ...design.options, [optionId]: value } };
      const available = surfacesFor(product, next);
      commit(next, available.some((s) => s.id === selectedSurfaceId) ? {} : { selectedSurfaceId: available[0].id, selectedLayerId: null });
    },
    setQuantity(quantity) {
      commit({ ...get().design, quantity: clamp(Math.round(quantity) || 1, 1, 500) });
    },
    setNotes(notes) {
      set({ design: { ...get().design, notes } });
    },
    setFill(surfaceIds, hex) {
      const { design } = get();
      const surfaces = { ...design.surfaces };
      for (const id of surfaceIds) surfaces[id] = { ...surfaces[id], fill: hex.toLowerCase() };
      commit({ ...design, surfaces });
    },

    addImage(asset, surfaceId) {
      const surface = targetSurface(surfaceId);
      const frame = frameOf(surface);
      // Fit inside the panel: at most half its width and 70% of its height.
      const aspect = asset.height / asset.width;
      const width = Math.min(0.5, (0.7 * frame.height) / (frame.width * aspect));
      const design = get().design;
      const layer: ImageLayer = { id: newId('img'), type: 'image', assetId: asset.id, x: 0, y: 0, rotation: 0, opacity: 1, width, flipX: false };
      set({ design: { ...design, assets: { ...design.assets, [asset.id]: asset } } });
      insertLayer(surface.id, layer);
    },
    addText(surfaceId) {
      const surface = targetSurface(surfaceId);
      const frame = frameOf(surface);
      const layer: TextLayer = {
        id: newId('txt'),
        type: 'text',
        text: 'Your text',
        fontFamily: get().product.fonts[0].family,
        fontWeight: 700,
        italic: false,
        fontSize: Math.min(0.1, (0.45 * frame.height) / frame.width),
        fill: '#161616',
        align: 'center',
        stroke: null,
        strokeWidth: 0,
        letterSpacing: 0,
        x: 0,
        y: 0,
        rotation: 0,
        opacity: 1,
      };
      insertLayer(surface.id, layer);
    },
    updateLayer(layerId, patch, opts) {
      const { design } = get();
      const found = findLayer(design, layerId);
      if (!found) return;
      const next = withLayers(design, found.surfaceId, (layers) =>
        layers.map((l) => (l.id === layerId ? ({ ...l, ...patch } as Layer) : l)),
      );
      if (opts?.history === false) set({ design: next });
      else commit(next);
    },
    removeLayer(layerId) {
      const found = findLayer(get().design, layerId);
      if (!found) return;
      commit(withLayers(get().design, found.surfaceId, (layers) => layers.filter((l) => l.id !== layerId)), { selectedLayerId: null });
    },
    duplicateLayer(layerId) {
      const found = findLayer(get().design, layerId);
      if (!found) return;
      const copy = { ...found.layer, id: newId(found.layer.type === 'text' ? 'txt' : 'img'), x: clamp(found.layer.x + 0.04, -0.5, 0.5), y: clamp(found.layer.y + 0.04, -0.5, 0.5) };
      insertLayer(found.surfaceId, copy);
    },
    arrangeLayer(layerId, to) {
      const found = findLayer(get().design, layerId);
      if (!found) return;
      commit(
        withLayers(get().design, found.surfaceId, (layers) => {
          const rest = layers.filter((l) => l.id !== layerId);
          const target = { forward: found.index + 1, backward: found.index - 1, front: rest.length, back: 0 }[to];
          rest.splice(clamp(target, 0, rest.length), 0, found.layer);
          return rest;
        }),
      );
    },
    copyLayerToGroup(layerId) {
      const { design, product } = get();
      const found = findLayer(design, layerId);
      if (!found) return;
      const group = geometryFor(product, design).surfaces.find((s) => s.id === found.surfaceId)?.group;
      let next = design;
      for (const surface of surfacesFor(product, design)) {
        if (surface.group !== group || surface.id === found.surfaceId) continue;
        if (next.surfaces[surface.id].layers.length >= product.limits.maxLayersPerSurface) continue;
        next = withLayers(next, surface.id, (layers) => [...layers, { ...found.layer, id: newId(found.layer.type === 'text' ? 'txt' : 'img') }]);
      }
      commit(next);
    },

    checkpoint() {
      const { design, past } = get();
      set({ past: [...past, design].slice(-HISTORY_LIMIT), future: [] });
    },
    undo() {
      const { past, design, future } = get();
      const previous = past.at(-1);
      if (!previous) return;
      set({ design: previous, past: past.slice(0, -1), future: [design, ...future] });
      const { selectedLayerId } = get();
      if (selectedLayerId && !findLayer(previous, selectedLayerId)) set({ selectedLayerId: null });
    },
    redo() {
      const { past, design, future } = get();
      const next = future[0];
      if (!next) return;
      set({ design: next, past: [...past, design], future: future.slice(1) });
      const { selectedLayerId } = get();
      if (selectedLayerId && !findLayer(next, selectedLayerId)) set({ selectedLayerId: null });
    },
  };
});
