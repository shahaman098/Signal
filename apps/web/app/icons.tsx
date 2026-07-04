/**
 * Inline SVG icon set — stroke-based, inherits `currentColor`, no dependencies.
 * Works in both server and client components.
 */
import type { CSSProperties } from "react";

interface IconProps {
  size?: number;
  style?: CSSProperties;
}

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export const Banknote = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

export const CircleCheck = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </svg>
);

export const Radar = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 12l6-6" />
    <circle cx="12" cy="12" r="0.5" fill="currentColor" />
  </svg>
);

export const AlertTriangle = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 16.5h.01" />
  </svg>
);

export const AlertOctagon = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M7.9 2.5h8.2l5.4 5.4v8.2l-5.4 5.4H7.9l-5.4-5.4V7.9L7.9 2.5Z" />
    <path d="M12 8v4M12 15.5h.01" />
  </svg>
);

export const InfoCircle = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const TrendUp = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </svg>
);

export const Clock = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);

export const Compass = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </svg>
);

export const Zap = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
  </svg>
);

export const Calendar = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </svg>
);

export const Eye = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const Mail = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
);

export const FileText = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8L14 2.5Z" />
    <path d="M14 2.5V8h5.5M9 13h6M9 17h6" />
  </svg>
);

export const ExternalLink = ({ size = 14, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M9 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    <path d="M13 4h7v7M20 4l-9 9" />
  </svg>
);

export const Sparkles = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <path d="M12 4.5 13.8 10 19.5 12l-5.7 2-1.8 5.5L10.2 14 4.5 12l5.7-2L12 4.5Z" />
    <path d="M19 3v3M20.5 4.5h-3" />
  </svg>
);

export const Building = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
    <path d="M9 7.5h.01M15 7.5h.01M9 11.5h.01M15 11.5h.01M9 15.5h.01M15 15.5h.01M12 20.5v-3" />
  </svg>
);

export const XCircle = ({ size = 18, style }: IconProps) => (
  <svg {...base(size)} style={style}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </svg>
);
