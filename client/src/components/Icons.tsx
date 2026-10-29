import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function Svg(props: P) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const IconOpen = (p: P) => (
  <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>
);
export const IconCamera = (p: P) => (
  <Svg {...p}><path d="M15 10l5-3v10l-5-3" /><rect x="3" y="6" width="12" height="12" rx="2" /></Svg>
);
export const IconSparkle = (p: P) => (
  <Svg {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 17l.7 2 .3.3 2 .7-2 .7-.3.3-.7 2-.7-2-.3-.3-2-.7 2-.7.3-.3z" /></Svg>
);
export const IconRotate = (p: P) => (
  <Svg {...p}><path d="M20 12a8 8 0 1 1-3-6.2" /><path d="M20 4v5h-5" /></Svg>
);
export const IconFlip = (p: P) => (
  <Svg {...p}><path d="M12 3v18" /><path d="M8 7l-5 5 5 5z" /><path d="M16 7l5 5-5 5z" /></Svg>
);
export const IconDownload = (p: P) => (
  <Svg {...p}><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></Svg>
);
export const IconCopy = (p: P) => (
  <Svg {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Svg>
);
export const IconRecord = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" /></Svg>
);
export const IconStop = (p: P) => (
  <Svg {...p}><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" /></Svg>
);
export const IconCompare = (p: P) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 2v20" /></Svg>
);
export const IconGrid = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconMinus = (p: P) => (
  <Svg {...p}><path d="M5 12h14" /></Svg>
);
export const IconFit = (p: P) => (
  <Svg {...p}><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></Svg>
);
export const IconReset = (p: P) => (
  <Svg {...p}><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v5h5" /></Svg>
);
export const IconKeyboard = (p: P) => (
  <Svg {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></Svg>
);
export const IconServer = (p: P) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></Svg>
);
export const IconGithub = (p: P) => (
  <Svg {...p}><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" /></Svg>
);
export const IconUpload = (p: P) => (
  <Svg {...p}><path d="M12 20V9" /><path d="M7 14l5-5 5 5" /><path d="M5 4h14" /></Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
);

export function Logo({ size = 22 }: { size?: number }) {
  // A 3×3 mosaic tile in the Sweetie-16 sunset colours.
  const c = ['#1a1c2c', '#b13e53', '#ef7d57', '#5d275d', '#ffcd75', '#ef7d57', '#29366f', '#5d275d', '#b13e53'];
  return (
    <svg width={size} height={size} viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
      {c.map((fill, i) => (
        <rect key={i} x={(i % 3) * 3} y={Math.floor(i / 3) * 3} width="3" height="3" fill={fill} />
      ))}
    </svg>
  );
}
