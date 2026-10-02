interface IconProps {
  size?: number;
}

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function MenuIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M3 6h14" />
      <path d="M3 10h14" />
      <path d="M3 14h14" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M5 5l10 10" />
      <path d="M15 5L5 15" />
    </svg>
  );
}

export function GiftIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <rect x="3" y="8" width="14" height="9" rx="1" />
      <path d="M3 8h14v3H3z" />
      <path d="M10 8v9" />
      <path d="M10 8c-1.2-3.2-3-4-4-3-1.4 1.1.2 3 4 3Z" />
      <path d="M10 8c1.2-3.2 3-4 4-3 1.4 1.1-.2 3-4 3Z" />
    </svg>
  );
}

export function CheckShieldIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M10 2.3 16.5 4.7v4.8c0 4-2.8 6.9-6.5 8.2-3.7-1.3-6.5-4.2-6.5-8.2V4.7Z" />
      <path d="M7.2 10.1l2 2 3.6-4" />
    </svg>
  );
}

export function LockShieldIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M10 2.3 16.5 4.7v4.8c0 4-2.8 6.9-6.5 8.2-3.7-1.3-6.5-4.2-6.5-8.2V4.7Z" />
      <rect x="7.7" y="9.6" width="4.6" height="3.8" rx="0.8" />
      <path d="M8.6 9.6V8.3a1.4 1.4 0 0 1 2.8 0v1.3" />
    </svg>
  );
}

export function SpikeIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M2.5 14 6 14l2-8 2.5 9 1.7-6.5L14 14h3.5" />
    </svg>
  );
}

export function TargetIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3.8" />
      <circle cx="10" cy="10" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function DocumentIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M6 2.5h6l3 3v11.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" />
      <path d="M12 2.5V6h3.5" />
      <path d="M7.3 10h5.4" />
      <path d="M7.3 12.6h5.4" />
      <path d="M7.3 15.2h3.4" />
    </svg>
  );
}

export function ResizeIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M12.5 2.5h5v5" />
      <path d="M17.5 2.5 11 9" />
      <path d="M7.5 17.5h-5v-5" />
      <path d="M2.5 17.5 9 11" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </svg>
  );
}

export function TrashIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M4 6h12" />
      <path d="M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6" />
      <path d="M5.5 6l.6 9.2a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4l.6-9.2" />
      <path d="M8.3 9v5" />
      <path d="M11.7 9v5" />
    </svg>
  );
}

export function PowerOffIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M10 2.5v6" />
      <path d="M5.8 5.2a6.3 6.3 0 1 0 8.4 0" />
    </svg>
  );
}

export function ClusterIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <circle cx="5.5" cy="5.5" r="2.3" />
      <circle cx="14.5" cy="5.5" r="2.3" />
      <circle cx="10" cy="14.5" r="2.3" />
      <path d="M7.4 6.8 8.7 12.6" />
      <path d="M12.6 6.8 11.3 12.6" />
      <path d="M7.8 5.5h4.4" />
    </svg>
  );
}

export function TagIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M10.5 2.5h5a2 2 0 0 1 2 2v5a2 2 0 0 1-.6 1.4l-6.9 6.9a2 2 0 0 1-2.8 0l-5-5a2 2 0 0 1 0-2.8l6.9-6.9a2 2 0 0 1 1.4-.6Z" />
      <circle cx="14.5" cy="5.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function OverviewIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="11" y="2.5" width="6.5" height="4" rx="1.5" />
      <rect x="11" y="8.5" width="6.5" height="9" rx="1.5" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}

export function LayersIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M10 2.5 17.5 7 10 11.5 2.5 7Z" />
      <path d="M2.5 10.5 10 15l7.5-4.5" />
      <path d="M2.5 14 10 18.5 17.5 14" />
    </svg>
  );
}

export function ServiceIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 5.5v4.5l3 2" />
    </svg>
  );
}

export function FolderIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M2.5 5.5c0-1 .8-1.8 1.8-1.8h3.4l1.6 1.8h6.4c1 0 1.8.8 1.8 1.8v7.2c0 1-.8 1.8-1.8 1.8H4.3c-1 0-1.8-.8-1.8-1.8Z" />
    </svg>
  );
}

export function WalletIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <rect x="2.5" y="5" width="15" height="11" rx="2" />
      <path d="M2.5 8.5h15" />
      <circle cx="13.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BulbIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M10 2.5a5.5 5.5 0 0 0-3 10.1c.6.4 1 1.1 1 1.9v.5h4v-.5c0-.8.4-1.5 1-1.9A5.5 5.5 0 0 0 10 2.5Z" />
      <path d="M8 17.5h4" />
      <path d="M8.5 15h3" />
    </svg>
  );
}

export function ClockIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <circle cx="10" cy="10.5" r="7.2" />
      <path d="M10 6.5v4l3 1.8" />
      <path d="M7.5 2.2h5" />
    </svg>
  );
}

export function PiggyIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M3 10.5c0-3.3 3.1-6 7-6s7 2.7 7 6-3.1 6-7 6c-1 0-2-.2-2.8-.5L5 17.5l.3-2.6A6 6 0 0 1 3 10.5Z" />
      <path d="M13 8.5h.01" strokeWidth="2.2" />
      <path d="M8.5 4.7 8 2.5l2.3.7" />
    </svg>
  );
}

export function UnlinkIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M8.2 11.8 4.6 15.4a2.6 2.6 0 0 1-3.7-3.7l3.6-3.6" />
      <path d="M11.8 8.2l3.6-3.6a2.6 2.6 0 0 1 3.7 3.7l-3.6 3.6" />
      <path d="M3 3l14 14" />
    </svg>
  );
}

export function PresentationIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <rect x="2" y="3" width="16" height="10" rx="1.5" />
      <path d="M10 13v4" />
      <path d="M7 17.5h6" />
      <path d="M5.5 9.5 8.5 7l2 2 3-3" />
    </svg>
  );
}

export function TrendUpIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M3 14.5 8 9l3.5 3.5L17 6" />
      <path d="M12.5 6h4.5v4.5" />
    </svg>
  );
}

export function SunIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <circle cx="10" cy="10" r="3.6" />
      <path d="M10 2.5v2M10 15.5v2M4.4 4.4l1.4 1.4M14.2 14.2l1.4 1.4M2.5 10h2M15.5 10h2M4.4 15.6l1.4-1.4M14.2 5.8l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M16.5 12.3A6.8 6.8 0 0 1 7.7 3.5a6.8 6.8 0 1 0 8.8 8.8Z" />
    </svg>
  );
}

export function PrinterIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M5.5 7.5V3h9v4.5" />
      <rect x="2.5" y="7.5" width="15" height="7" rx="1.2" />
      <path d="M5.5 12.5h9V17h-9Z" />
    </svg>
  );
}

export function SparkIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M10 2.5c.6 2.8 1.7 3.9 4.5 4.5-2.8.6-3.9 1.7-4.5 4.5-.6-2.8-1.7-3.9-4.5-4.5 2.8-.6 3.9-1.7 4.5-4.5Z" />
      <path d="M15.5 12.5c.35 1.5.9 2.05 2.4 2.4-1.5.35-2.05.9-2.4 2.4-.35-1.5-.9-2.05-2.4-2.4 1.5-.35 2.05-.9 2.4-2.4Z" />
    </svg>
  );
}

export function BrainIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M8.3 3.3a2.3 2.3 0 0 0-2.3 2.3v.3A2.4 2.4 0 0 0 4.3 8v.5a2.3 2.3 0 0 0 .6 4.4 2.4 2.4 0 0 0 2.4 2.5c.4 0 .8-.1 1.1-.3v-9a2.3 2.3 0 0 0-.1-2.8Z" />
      <path d="M11.7 3.3a2.3 2.3 0 0 1 2.3 2.3v.3A2.4 2.4 0 0 1 15.7 8v.5a2.3 2.3 0 0 1-.6 4.4 2.4 2.4 0 0 1-2.4 2.5c-.4 0-.8-.1-1.1-.3v-9a2.3 2.3 0 0 1 .1-2.8Z" />
    </svg>
  );
}

export function DatabaseIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <ellipse cx="10" cy="4.8" rx="6" ry="2.3" />
      <path d="M4 4.8v10.4c0 1.27 2.69 2.3 6 2.3s6-1.03 6-2.3V4.8" />
      <path d="M4 10c0 1.27 2.69 2.3 6 2.3s6-1.03 6-2.3" />
    </svg>
  );
}

export function PlusCircleIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 6.5v7" />
      <path d="M6.5 10h7" />
    </svg>
  );
}

export function PulseIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M2 10.5h3.2l1.6-4.2 2.6 8.4 2-6.6 1.4 2.4H18" />
    </svg>
  );
}

export function CompareIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M4 15V8.5M8 15V4.5M12 15v-4M16 15V6.5" />
      <path d="M2.5 17.5h15" />
    </svg>
  );
}

export function BoxesIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M2.5 6.2 7 4l4.5 2.2L7 8.4z" />
      <path d="M2.5 6.2v5L7 13.4v-5" />
      <path d="M11.5 6.2v5L7 13.4" />
      <path d="M12 12.5 15 11l2.5 1.3L15 13.9z" />
      <path d="M12 12.5v3l3 1.4v-3" />
      <path d="M17.5 12.5v3L15 16.9" />
    </svg>
  );
}

// The mark beside the product name in the sidebar. It stands for the product, not the
// client — whose own logo already sits directly above it — so it is drawn rather than
// loaded from a client asset, and takes the configured brand colour through currentColor.
// A client favicon shrunk to 24px here read as an orange smudge and repeated branding
// that was already on screen.
export function ProductMarkIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="6" y="13" width="2.8" height="5" rx="1.4" fill="currentColor" />
      <rect x="10.6" y="9.5" width="2.8" height="8.5" rx="1.4" fill="currentColor" />
      <rect x="15.2" y="6" width="2.8" height="12" rx="1.4" fill="currentColor" />
    </svg>
  );
}
