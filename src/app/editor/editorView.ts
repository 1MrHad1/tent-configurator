import { create } from 'zustand';

/** 2D view state (zoom relative to "fit", pan in screen pixels). Not part of the design. */
interface EditorView {
  zoom: number;
  pan: [number, number];
  setPan(pan: [number, number]): void;
  /** Zooms by `factor` keeping `anchor` (screen offset from the stage centre) fixed. */
  zoomAt(factor: number, anchor?: [number, number]): void;
  fit(): void;
}

const MIN = 0.5;
const MAX = 8;

export const useEditorView = create<EditorView>()((set, get) => ({
  zoom: 1,
  pan: [0, 0],
  setPan: (pan) => set({ pan }),
  zoomAt(factor, anchor = [0, 0]) {
    const { zoom, pan } = get();
    const next = Math.min(MAX, Math.max(MIN, zoom * factor));
    const k = next / zoom;
    set({ zoom: next, pan: [anchor[0] - (anchor[0] - pan[0]) * k, anchor[1] - (anchor[1] - pan[1]) * k] });
  },
  fit: () => set({ zoom: 1, pan: [0, 0] }),
}));
