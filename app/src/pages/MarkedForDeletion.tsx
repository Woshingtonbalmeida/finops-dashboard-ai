import { Fragment, useMemo, useState } from "react";
import { useDeletionCandidates, useSetDeletionStatus, useSetDeletionStatusBulk } from "../hooks/useDeletionCandidates";
import { useSummary } from "../hooks/useSummary";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { RankedBarChart } from "../components/RankedBarChart";
import { ChevronRightIcon } from "../components/Icons";
import { formatCurrency } from "../lib/format";
import { DELETION_STATUS_VALUES } from "../types";
import type { DeletionCandidate, DeletionStatusValue } from "../types";

interface ResourceGroupBucket {
  key: string;
  subscriptionId: string;
  subscriptionName: string;
  resourceGroup: string;
  cost: number;
  resources: DeletionCandidate[];
}

const STATUS_COLORS: Record<DeletionStatusValue, string> = {
  Identificado: "var(--text-muted)",
  "Em análise": "var(--series-1)",
  Aprovado: "var(--status-warning)",
  Agendado: "var(--series-2)",
  Parado: "var(--series-7)",
  Excluído: "var(--status-good)",
};

// Exibido em toda a página — o valor salvo continua "Excluído" (histórico e cálculo de
// economia do Relatório semanal dependem desse texto exato), mas como rótulo "Excluir"
// lê melhor, tanto pra escolher a ação quanto pra ver o resumo depois.
const STATUS_LABELS: Record<DeletionStatusValue, string> = {
  Identificado: "Identificado",
  "Em análise": "Em análise",
  Aprovado: "Aprovado",
  Agendado: "Agendado",
  Parado: "Parado",
  Excluído: "Excluir",
};

const selectStyle: React.CSSProperties = {
  background: "var(--surface-1)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "3px 6px",
  fontSize: 12,
};

export function MarkedForDeletion() {
  const { data, isLoading, error } = useDeletionCandidates();
  const { data: summary } = useSummary();
  const setStatus = useSetDeletionStatus();
  const setStatusBulk = useSetDeletionStatusBulk();
  const resources = data?.resources ?? [];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const bySubscription = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of resources) map.set(r.subscriptionId, (map.get(r.subscriptionId) ?? 0) + r.mtdCost);
    return [...map.entries()].map(([subscriptionId, cost]) => {
      const sub = summary?.bySubscription.find((s) => s.subscriptionId === subscriptionId);
      return { name: sub?.subscriptionName ?? subscriptionId, cost };
    });
  }, [resources, summary]);

  const byStatus = useMemo(() => {
    const counts = new Map<DeletionStatusValue, number>();
    for (const status of DELETION_STATUS_VALUES) counts.set(status, 0);
    for (const r of resources) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return DELETION_STATUS_VALUES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
  }, [resources]);

  const groups = useMemo(() => {
    const map = new Map<string, ResourceGroupBucket>();
    for (const r of resources) {
      const key = `${r.subscriptionId}|${r.resourceGroup}`;
      const sub = summary?.bySubscription.find((s) => s.subscriptionId === r.subscriptionId);
      const bucket = map.get(key) ?? {
        key,
        subscriptionId: r.subscriptionId,
        subscriptionName: sub?.subscriptionName ?? r.subscriptionId,
        resourceGroup: r.resourceGroup,
        cost: 0,
        resources: [],
      };
      bucket.cost += r.mtdCost;
      bucket.resources.push(r);
      map.set(key, bucket);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }, [resources, summary]);

  const searchQuery = search.trim().toLowerCase();

  function matchesSearch(r: DeletionCandidate): boolean {
    if (!searchQuery) return true;
    return [r.name, r.resourceGroup, r.owner, r.produto, r.type].some((field) =>
      (field ?? "").toLowerCase().includes(searchQuery),
    );
  }

  // Só filtra a tabela — os KPIs/gráficos no topo continuam mostrando o total geral,
  // já que a busca serve pra localizar um recurso específico, não recortar a visão geral.
  const visibleGroups = useMemo(() => {
    if (!searchQuery) return groups;
    return groups
      .map((g) => ({ ...g, resources: g.resources.filter(matchesSearch) }))
      .filter((g) => g.resources.length > 0);
  }, [groups, searchQuery]);

  const matchCount = useMemo(() => visibleGroups.reduce((sum, g) => sum + g.resources.length, 0), [visibleGroups]);

  function statusSummary(groupResources: DeletionCandidate[]) {
    const counts = new Map<DeletionStatusValue, number>();
    for (const r of groupResources) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return DELETION_STATUS_VALUES.filter((s) => (counts.get(s) ?? 0) > 0).map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    }));
  }

  function applyStatusToGroup(groupResources: DeletionCandidate[], resourceGroup: string, status: DeletionStatusValue) {
    const confirmed = window.confirm(
      `Aplicar "${STATUS_LABELS[status]}" para os ${groupResources.length} recurso(s) de "${resourceGroup}"?`,
    );
    if (!confirmed) return;
    setStatusBulk.mutate({ resourceIds: groupResources.map((r) => r.resourceId), status });
  }

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <h1 className="page-title">Candidatos à exclusão</h1>
      <p className="page-subtitle">
        Recursos com a tag AÇÃO = DELETAR — quanto custam hoje e quanto seria economizado por mês se fossem
        realmente excluídos. Nenhuma ação de exclusão é feita por aqui, é só acompanhamento.
      </p>

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        <div className="kpi-grid">
          <StatTile label="Recursos marcados" value={String(resources.length)} />
          <StatTile
            label="Economia potencial por mês"
            value={formatCurrency(data?.totalMtdCost ?? 0, data?.currency ?? "BRL")}
            deltaLabel="se todos forem excluídos"
          />
          <StatTile label="Resource groups afetados" value={String(groups.length)} />
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <p className="card-title">Status do workflow</p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {byStatus.map(({ status, count }) => (
              <div key={status} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: STATUS_COLORS[status] }}
                />
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{STATUS_LABELS[status]}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <p className="card-title">Custo por subscription</p>
          <RankedBarChart data={bySubscription} currency={data?.currency ?? "BRL"} />
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 14 }}>
            <p className="card-title" style={{ margin: 0 }}>
              Recursos por resource group
            </p>
            <div style={{ position: "relative", width: 320, maxWidth: "50%" }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearch("");
                }}
                placeholder="Buscar por nome, resource group, dono ou produto…"
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: search ? "7px 28px 7px 12px" : "7px 12px",
                  fontSize: 13,
                  width: "100%",
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Limpar busca"
                  style={{
                    position: "absolute",
                    right: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: 16,
                    lineHeight: 1,
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
          {searchQuery && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "-6px 0 14px" }}>
              {matchCount} recurso(s) encontrado(s) em {visibleGroups.length} resource group(s).
            </p>
          )}
          {groups.length === 0 ? (
            <p className="state-message">Nenhum recurso marcado para exclusão no momento.</p>
          ) : visibleGroups.length === 0 ? (
            <p className="state-message">Nenhum recurso encontrado para "{search.trim()}".</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th>Resource group</th>
                  <th>Subscription</th>
                  <th>Recursos</th>
                  <th>Custo no mês</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((g) => {
                  const isOpen = expanded.has(g.key) || !!searchQuery;
                  return (
                    <Fragment key={g.key}>
                      <tr onClick={() => toggle(g.key)} style={{ cursor: "pointer" }}>
                        <td style={{ width: 20 }}>
                          <span
                            style={{
                              display: "inline-flex",
                              transform: isOpen ? "rotate(90deg)" : "none",
                              transition: "transform 0.15s ease",
                              color: "var(--text-muted)",
                            }}
                          >
                            <ChevronRightIcon size={14} />
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{g.resourceGroup}</td>
                        <td>{g.subscriptionName}</td>
                        <td>{g.resources.length}</td>
                        <td>{formatCurrency(g.cost, g.resources[0]?.currency ?? "BRL")}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <div
                              style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                              title={statusSummary(g.resources)
                                .map(({ status, count }) => `${STATUS_LABELS[status]}: ${count}`)
                                .join(", ")}
                            >
                              {statusSummary(g.resources).map(({ status, count }) => (
                                <span key={status} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      width: 7,
                                      height: 7,
                                      borderRadius: 999,
                                      background: STATUS_COLORS[status],
                                      flexShrink: 0,
                                    }}
                                  />
                                  <span style={{ color: "var(--text-secondary)" }}>{count}</span>
                                </span>
                              ))}
                            </div>
                            <select
                              value=""
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const status = e.target.value as DeletionStatusValue;
                                e.target.value = "";
                                if (status) applyStatusToGroup(g.resources, g.resourceGroup, status);
                              }}
                              style={selectStyle}
                            >
                              <option value="">Aplicar a todos…</option>
                              {DELETION_STATUS_VALUES.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                      {isOpen &&
                        g.resources.map((r) => (
                          <tr key={r.resourceId} style={{ background: "rgba(255,255,255,0.02)" }}>
                            <td></td>
                            <td colSpan={2} style={{ fontSize: 12.5, color: "var(--text-secondary)", paddingLeft: 24 }}>
                              {r.name}
                              <span style={{ color: "var(--text-muted)" }}> · {r.type}</span>
                            </td>
                            <td style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{r.owner || "—"}</td>
                            <td style={{ fontSize: 12.5 }}>{formatCurrency(r.mtdCost, r.currency)}</td>
                            <td style={{ fontSize: 12.5 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    width: 7,
                                    height: 7,
                                    borderRadius: 999,
                                    background: STATUS_COLORS[r.status],
                                    flexShrink: 0,
                                  }}
                                />
                                <select
                                  value={r.status}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setStatus.mutate({ resourceId: r.resourceId, status: e.target.value as DeletionStatusValue })
                                  }
                                  style={selectStyle}
                                >
                                  {DELETION_STATUS_VALUES.map((s) => (
                                    <option key={s} value={s}>
                                      {STATUS_LABELS[s]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            Detectados via Azure Resource Graph pela tag AÇÃO=DELETAR aplicada diretamente em cada recurso. Custo
            real do mês, cruzado com o export FOCUS por ResourceId. Clique num resource group para ver os recursos
            individuais e atualizar o status de cada um.
          </p>
        </div>
      </QueryState>
    </>
  );
}
