export interface VersionInfo {
  commit: string;
  buildTime: string;
}

// Set by the pipeline right after deploying (az functionapp config appsettings set) —
// see azure-pipelines.yml. Absent in local dev, where there's no real deploy to identify.
export function getVersionInfo(): VersionInfo {
  return {
    commit: process.env.BUILD_COMMIT ?? "dev",
    buildTime: process.env.BUILD_TIME ?? "",
  };
}
