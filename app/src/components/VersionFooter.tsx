import { useVersion } from "../hooks/useVersion";

// Embedded into the bundle at build time by the pipeline (see azure-pipelines.yml) —
// undefined in local dev, where there's no real deploy to identify.
const FRONTEND_COMMIT = (import.meta.env.VITE_BUILD_COMMIT as string | undefined) || "dev";
const FRONTEND_BUILD_TIME = (import.meta.env.VITE_BUILD_TIME as string | undefined) || "";

function shortSha(commit: string): string {
  return commit === "dev" ? commit : commit.slice(0, 7);
}

function formatBuildTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function VersionFooter() {
  const { data: backendVersion } = useVersion();
  const backendCommit = backendVersion?.commit ?? "";

  // Both sides are built from the same commit in the same pipeline run — a mismatch
  // means one half's deploy step failed or hasn't run yet, not that they're expected to
  // ever legitimately differ.
  const mismatch = backendCommit !== "" && backendCommit !== "dev" && backendCommit !== FRONTEND_COMMIT;

  return (
    <div
      className="sidebar-version"
      style={{ fontSize: 10.5, color: mismatch ? "var(--status-warning)" : "var(--text-muted)", lineHeight: 1.5 }}
      title={
        mismatch
          ? `Frontend: ${FRONTEND_COMMIT} · Backend: ${shortSha(backendCommit)} — versões diferentes, um dos dois pode não ter atualizado`
          : `Build em ${formatBuildTime(FRONTEND_BUILD_TIME)}`
      }
    >
      v{shortSha(FRONTEND_COMMIT)}
      {mismatch ? ` (API v${shortSha(backendCommit)} ⚠)` : ""}
    </div>
  );
}
