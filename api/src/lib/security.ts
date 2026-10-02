import { DefaultAzureCredential } from "@azure/identity";

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

async function callSecurityApi<T>(subscriptionId: string, path: string, apiVersion: string): Promise<T> {
  const token = await getManagementToken();
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Security/${path}?api-version=${apiVersion}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Defender for Cloud (${path}) -> ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export type Severity = "High" | "Medium" | "Low";

export interface SecurityFinding {
  name: string;
  severity: Severity;
}

export interface SecurityAlert {
  name: string;
  severity: string;
  count: number;
}

export interface RegulatoryCompliance {
  standard: string;
  percent: number;
  passed: number;
  total: number;
}

export interface SubscriptionSecurity {
  subscriptionId: string;
  secureScorePercent: number;
  secureScoreCurrent: number;
  secureScoreMax: number;
  totalAssessments: number;
  unhealthyCount: number;
  bySeverity: Record<Severity, number>;
  topFindings: SecurityFinding[];
  alerts: SecurityAlert[];
  regulatoryCompliance: RegulatoryCompliance | null;
}

interface SecureScoreResponse {
  properties: { score: { current: number; max: number; percentage: number } };
}

interface AssessmentsResponse {
  value: Array<{
    properties: {
      displayName: string;
      status: { code: string };
      metadata?: { severity?: Severity };
    };
  }>;
}

interface AlertsResponse {
  value: Array<{
    properties: {
      alertDisplayName: string;
      severity: string;
      status: string;
    };
  }>;
}

interface RegulatoryComplianceResponse {
  value: Array<{
    name: string;
    properties: {
      passedControls: number;
      failedControls: number;
      skippedControls: number;
      unsupportedControls: number;
    };
  }>;
}

async function fetchSecureScore(subscriptionId: string) {
  const data = await callSecurityApi<SecureScoreResponse>(subscriptionId, "secureScores/ascScore", "2020-01-01");
  return data.properties.score;
}

async function fetchAssessments(subscriptionId: string) {
  const data = await callSecurityApi<AssessmentsResponse>(subscriptionId, "assessments", "2021-06-01&$expand=metadata");
  const unhealthy = data.value.filter((a) => a.properties.status.code === "Unhealthy" && a.properties.metadata?.severity);

  const bySeverity: Record<Severity, number> = { High: 0, Medium: 0, Low: 0 };
  for (const a of unhealthy) {
    const severity = a.properties.metadata!.severity!;
    if (severity in bySeverity) bySeverity[severity] += 1;
  }

  const severityOrder: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 };
  const topFindings: SecurityFinding[] = unhealthy
    .map((a) => ({ name: a.properties.displayName, severity: a.properties.metadata!.severity! }))
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 5);

  return { totalAssessments: data.value.length, unhealthyCount: unhealthy.length, bySeverity, topFindings };
}

async function fetchAlerts(subscriptionId: string) {
  const data = await callSecurityApi<AlertsResponse>(subscriptionId, "alerts", "2022-01-01");
  const active = data.value.filter((a) => a.properties.status === "Active");

  const grouped = new Map<string, SecurityAlert>();
  for (const a of active) {
    const key = `${a.properties.alertDisplayName}|${a.properties.severity}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(key, { name: a.properties.alertDisplayName, severity: a.properties.severity, count: 1 });
    }
  }
  return Array.from(grouped.values());
}

async function fetchRegulatoryCompliance(subscriptionId: string): Promise<RegulatoryCompliance | null> {
  try {
    const data = await callSecurityApi<RegulatoryComplianceResponse>(
      subscriptionId,
      "regulatoryComplianceStandards",
      "2019-01-01-preview",
    );
    // Pick the standard with the most controls tracked — the benchmark Defender applies by default.
    const best = data.value
      .map((s) => {
        const p = s.properties;
        const total = p.passedControls + p.failedControls + p.skippedControls + p.unsupportedControls;
        return { name: s.name, passed: p.passedControls, total };
      })
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total)[0];
    if (!best) return null;
    return {
      standard: best.name === "Microsoft-cloud-security-benchmark" ? "Microsoft Cloud Security Benchmark" : best.name,
      percent: Math.round((best.passed / best.total) * 1000) / 10,
      passed: best.passed,
      total: best.total,
    };
  } catch {
    // Regulatory compliance requires the Defender standard paid plan — free tier subscriptions 400 here.
    return null;
  }
}

export async function fetchSecurity(subscriptionIds: string[]): Promise<SubscriptionSecurity[]> {
  return Promise.all(
    subscriptionIds.map(async (subscriptionId) => {
      const [score, assessments, alerts, regulatoryCompliance] = await Promise.all([
        fetchSecureScore(subscriptionId),
        fetchAssessments(subscriptionId),
        fetchAlerts(subscriptionId),
        fetchRegulatoryCompliance(subscriptionId),
      ]);
      return {
        subscriptionId,
        secureScorePercent: Math.round(score.percentage * 1000) / 10,
        secureScoreCurrent: score.current,
        secureScoreMax: score.max,
        totalAssessments: assessments.totalAssessments,
        unhealthyCount: assessments.unhealthyCount,
        bySeverity: assessments.bySeverity,
        topFindings: assessments.topFindings,
        alerts,
        regulatoryCompliance,
      };
    }),
  );
}
