import type { ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: string;
  deltaLabel?: string;
  deltaDirection?: "up-bad" | "down-good" | "neutral";
  hero?: boolean;
  accent?: boolean;
  icon?: ReactNode;
  subLabel?: string;
}

export function StatTile({ label, value, deltaLabel, deltaDirection = "neutral", hero, accent, icon, subLabel }: StatTileProps) {
  return (
    <div className={`card${hero ? " hero-tile" : ""}${accent ? " hero-tile-accent" : ""}`}>
      <p className="stat-tile-label">
        {icon}
        {label}
      </p>
      <p className="stat-tile-value">{value}</p>
      {deltaLabel && (
        <p className={`stat-tile-delta ${deltaDirection === "up-bad" ? "delta-up-bad" : deltaDirection === "down-good" ? "delta-down-good" : ""}`}>
          {deltaLabel}
        </p>
      )}
      {subLabel && (
        <p className="stat-tile-delta" style={{ color: "var(--text-muted)" }}>
          {subLabel}
        </p>
      )}
    </div>
  );
}
