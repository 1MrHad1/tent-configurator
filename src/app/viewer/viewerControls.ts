import { create } from 'zustand';

/** Viewer state the UI controls but the design does not contain. */
interface ViewerControls {
  /** Camera requests from the UI (view buttons) to the viewer, which lives inside the canvas. */
  request: { viewId: string; nonce: number };
  goTo(viewId: string): void;
  /** Draw the UV debug grid into the 3D texture. */
  uvGrid: boolean;
  toggleUvGrid(): void;
}

export const useViewerControls = create<ViewerControls>()((set) => ({
  request: { viewId: 'orbit', nonce: 0 },
  goTo: (viewId) => set((s) => ({ request: { viewId, nonce: s.request.nonce + 1 } })),
  uvGrid: false,
  toggleUvGrid: () => set((s) => ({ uvGrid: !s.uvGrid })),
}));
