// Deterministic resize suggestions — no LLM involved. Every size in these tables was
// confirmed against Azure's own specs before being added (AKS sizes via a live
// Microsoft.Compute/skus query for eastus/eastus2; App Service sizes from Microsoft's
// published Standard/PremiumV3 plan specs, which have been stable for years). A current
// size that isn't in its table simply gets no suggestion — never a guessed one.

export interface SizeSpec {
  vCpus: number;
  memoryGB: number;
}

export interface ResizeSuggestion {
  currentSize: string;
  recommendedSize: string;
  current: SizeSpec;
  recommended: SizeSpec;
}

const AKS_VM_SIZES: Record<string, SizeSpec> = {
  Standard_DS2_v2: { vCpus: 2, memoryGB: 7 },
  Standard_D2s_v2: { vCpus: 2, memoryGB: 8 },
  Standard_D2s_v3: { vCpus: 2, memoryGB: 8 },
  Standard_D2s_v4: { vCpus: 2, memoryGB: 8 },
  Standard_D2s_v5: { vCpus: 2, memoryGB: 8 },
  Standard_D2s_v7: { vCpus: 2, memoryGB: 8 },
  Standard_D4s_v3: { vCpus: 4, memoryGB: 16 },
  Standard_D4s_v4: { vCpus: 4, memoryGB: 16 },
  Standard_D4s_v5: { vCpus: 4, memoryGB: 16 },
  Standard_D4ds_v5: { vCpus: 4, memoryGB: 16 },
  Standard_D8s_v3: { vCpus: 8, memoryGB: 32 },
  Standard_D8s_v4: { vCpus: 8, memoryGB: 32 },
  Standard_D8s_v5: { vCpus: 8, memoryGB: 32 },
  Standard_D8ds_v5: { vCpus: 8, memoryGB: 32 },
  Standard_D16s_v3: { vCpus: 16, memoryGB: 64 },
  Standard_D16s_v4: { vCpus: 16, memoryGB: 64 },
  Standard_D16s_v5: { vCpus: 16, memoryGB: 64 },
};

// One step down within the same VM family/version (e.g. Standard_D8s_v5 -> Standard_D4s_v5).
// Only returns a suggestion when BOTH the current and the halved size are in the verified
// table above.
export function recommendAksVmSize(currentSize: string): ResizeSuggestion | null {
  const match = currentSize.match(/^Standard_D(\d+)(d?)s_v(\d+)$/);
  if (!match) return null;
  const [, vcpuStr, dFlag, version] = match;
  const vcpu = Number(vcpuStr);
  if (vcpu < 4 || vcpu % 2 !== 0) return null; // nothing smaller than D2 exists in this family
  const candidateSize = `Standard_D${vcpu / 2}${dFlag}s_v${version}`;
  const current = AKS_VM_SIZES[currentSize];
  const recommended = AKS_VM_SIZES[candidateSize];
  if (!current || !recommended) return null;
  return { currentSize, recommendedSize: candidateSize, current, recommended };
}

interface AppServiceSkuSpec extends SizeSpec {
  stepDown: string | null;
}

// Sourced from Microsoft's published App Service plan specs (Standard and Premium v3
// tiers) — there's no ARM "list SKUs with specs" API for App Service, unlike Compute.
const APP_SERVICE_SKUS: Record<string, AppServiceSkuSpec> = {
  S1: { vCpus: 1, memoryGB: 1.75, stepDown: null },
  S2: { vCpus: 2, memoryGB: 3.5, stepDown: "S1" },
  S3: { vCpus: 4, memoryGB: 7, stepDown: "S2" },
  P0v3: { vCpus: 1, memoryGB: 4, stepDown: null },
  P1v3: { vCpus: 2, memoryGB: 8, stepDown: "P0v3" },
  P2v3: { vCpus: 4, memoryGB: 16, stepDown: "P1v3" },
  P3v3: { vCpus: 8, memoryGB: 32, stepDown: "P2v3" },
};

export function recommendAppServiceSku(currentSize: string): ResizeSuggestion | null {
  const current = APP_SERVICE_SKUS[currentSize];
  if (!current || !current.stepDown) return null;
  const recommended = APP_SERVICE_SKUS[current.stepDown];
  if (!recommended) return null;
  return { currentSize, recommendedSize: current.stepDown, current, recommended };
}
