import { create } from 'zustand';

/** Camera requests from the UI (view buttons) to the viewer, which lives inside the canvas. */
export const useViewerControls = create<{ request: { viewId: string; nonce: number }; goTo(viewId: string): void }>()((set) => ({
  request: { viewId: 'orbit', nonce: 0 },
  goTo: (viewId) => set((s) => ({ request: { viewId, nonce: s.request.nonce + 1 } })),
}));
