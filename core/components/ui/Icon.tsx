import { ReactNode } from "react";

export function Icon({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<string, ReactNode> = {
    play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
    pause: (
      <>
        <path d="M9 5v14" />
        <path d="M15 5v14" />
      </>
    ),
    step: (
      <>
        <path d="m6 5 9 7-9 7Z" />
        <path d="M18 5v14" />
      </>
    ),
    reset: (
      <>
        <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" />
        <path d="M4 4v4.68h4.68" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </>
    ),
    cube: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
        <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      </>
    ),
    volume: (
      <>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </>
    ),
    "volume-x": (
      <>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </>
    ),
    crosshair: (
      <>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      </>
    ),
    fit: (
      <>
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      </>
    ),
    zoomIn: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5M10.5 7.5v6M7.5 10.5h6" />
      </>
    ),
    zoomOut: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5M7.5 10.5h6" />
      </>
    ),
    hand: (
      <>
        <path d="M7 11V7a2 2 0 0 1 4 0v3-5a2 2 0 0 1 4 0v5-3a2 2 0 0 1 4 0v7c0 4-3 7-7 7h-1c-2.5 0-4-1-5.5-3L3 14.5a2 2 0 0 1 3-2.5Z" />
      </>
    ),
    ruler: (
      <>
        <path d="m4 17 13-13 3 3L7 20H4Z" />
        <path d="m14 7 3 3M11 10l2 2M8 13l3 3" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.38.36.72.65 1 .3.26.68.4 1.07.4H21v4h-.1A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
    sheet: (
      <>
        <path d="m3 9 9-5 9 5-9 5Z" />
        <path d="m3 13 9 5 9-5M3 17l9 5 9-5" />
      </>
    ),
    tool: (
      <>
        <path d="M9 3h6l-1 6h-4Z" />
        <path d="M10.5 9v10l1.5 2 1.5-2V9" />
        <path d="M10.5 12h3M10.5 16h3" />
      </>
    ),
    route: (
      <>
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="6" r="2" />
        <path d="M7 18c5 0 2-8 7-8h3" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </>
    ),
    warning: (
      <>
        <path d="M12 3 2.5 20h19Z" />
        <path d="M12 9v5M12 17.5h.01" />
      </>
    ),
    edit: (
      <>
        <path d="m4 16-.8 4.8L8 20l11-11-4-4Z" />
        <path d="m13 7 4 4" />
      </>
    ),
    copy: (
      <>
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    panel: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16M5.5 8h1M5.5 12h1M5.5 16h1" />
      </>
    ),
    fullscreen: (
      <>
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      </>
    ),
    collapse: (
      <>
        <path d="M8 8H3V3M16 8h5V3M8 16H3v5M16 16h5v5" />
        <path d="m3 3 6 6m12-6-6 6M3 21l6-6m12 6-6-6" />
      </>
    ),
  };

  return <svg {...common}>{paths[name] ?? paths.info}</svg>;
}
