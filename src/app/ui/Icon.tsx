const PATHS = {
  product: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9',
  upload: 'M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  text: 'M5 6V4.5h14V6M12 4.5v15M9 19.5h6',
  palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.7-1.3-.7-2.2 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.9 17 3 12 3zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  cube: 'M12 2.8 20.5 7.5v9L12 21.2 3.5 16.5v-9zM3.5 7.5 12 12l8.5-4.5M12 12v9.2',
  square: 'M4 4h16v16H4zM4 12h16M12 4v16',
  cart: 'M3 4h2.2l2.2 10.6a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6.1M9.5 20h.01M17.5 20h.01',
  download: 'M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M4 19.5h16',
  trash: 'M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  up: 'M12 19V5m0 0-6 6m6-6 6 6',
  down: 'M12 5v14m0 0-6-6m6 6 6-6',
  flip: 'M12 3v18M8 7 3 12l5 5zM16 7l5 5-5 5z',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  center: 'M12 3v4M12 17v4M3 12h4M17 12h4M9 9h6v6H9z',
  spread: 'M4 6h6v5H4zM14 6h6v5h-6zM4 15h6v4H4zM14 15h6v4h-6z',
  alert: 'M12 9v4.5M12 17h.01M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
