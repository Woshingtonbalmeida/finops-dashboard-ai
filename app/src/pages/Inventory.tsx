import { useMemo, useState } from "react";
import { useInventory, useRefreshInventory } from "../hooks/useInventory";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { formatCurrency } from "../lib/format";
import type { InventoryBreakdown, InventoryReport, InventoryResource } from "../types";

type GroupBy = "byType" | "byProvider" | "byResourceGroup" | "byLocation" | "bySubscription";

const GROUP_LABEL: Record<GroupBy, string> = {
  byType: "Tipo de recurso",
  byProvider: "Provider",
  byResourceGroup: "Grupo de recursos",
  byLocation: "Região",
  bySubscription: "Assinatura",
};

// The full table is 1600+ rows; rendering all of them makes the page janky to scroll and
// nobody reads past the first screen anyway. Search narrows before this limit applies, so a
// specific resource is always reachable.
const TABLE_LIMIT = 100;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  // Separator is ";", so a decimal comma needs no quoting — only the separator itself, a
  // quote, or a line break would break the row.
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ARI's whole output is a spreadsheet, and that's genuinely the right shape for an
// inventory someone wants to pivot, share or diff — so the page keeps its own filters but
// hands the raw rows over on demand.
function downloadCsv(resources: InventoryResource[]): void {
  const header = [
    "Nome",
    "Tipo",
    "Tipo (ARM)",
    "SKU",
    "Kind",
    "Grupo de recursos",
    "Região",
    "Assinatura",
    "Gerenciado pelo Azure",
    "Tem tag",
    "Custo MTD",
    "Resource ID",
  ];
  const lines = [
    header.join(";"),
    ...resources.map((r) =>
      [
        r.name,
        r.friendlyType,
        r.type,
        r.sku,
        r.kind,
        r.resourceGroup,
        r.location,
        r.subscriptionName,
        r.managed ? "Sim" : "Não",
        r.tagged ? "Sim" : "Não",
        r.mtdCost === null ? "" : String(r.mtdCost).replace(".", ","),
        r.resourceId,
      ]
        .map(csvCell)
        .join(";")
    ),
  ];
  // BOM so Excel opens the accented headers correctly instead of showing mojibake.
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `inventario-azure_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function BreakdownTable({
  rows,
  label,
  currency,
  activeKey,
  onSelect,
}: {
  rows: InventoryBreakdown[];
  label: string;
  currency: string;
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, 15);
  const maxCount = rows[0]?.count ?? 1;

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th>{label}</th>
            <th style={{ textAlign: "right" }}>Recursos</th>
            <th style={{ width: "30%" }}>Distribuição</th>
            <th style={{ textAlign: "right" }}>Custo no mês</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr
              key={row.key}
              onClick={() => onSelect(row.key)}
              style={{
                cursor: "pointer",
                background: row.key === activeKey ? "var(--surface-raised, rgba(255,255,255,0.06))" : undefined,
              }}
            >
              <td style={{ fontWeight: row.key === activeKey ? 600 : undefined }}>{row.key}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{row.count}</td>
              <td>
                <div style={{ background: "var(--border-subtle, #333)", borderRadius: 3, height: 8, width: "100%" }}>
                  <div
                    style={{
                      background: "var(--brand-accent)",
                      borderRadius: 3,
                      height: 8,
                      width: `${Math.max(2, (row.count / maxCount) * 100)}%`,
                    }}
                  />
                </div>
              </td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatCurrency(row.cost, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 15 && (
        <button
          onClick={() => setShowAll(!showAll)}
          style={{
            marginTop: 12,
            background: "transparent",
            border: "none",
            padding: 0,
            color: "var(--brand-accent)",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showAll ? "Mostrar menos" : `Ver todos (${rows.length})`}
        </button>
      )}
    </>
  );
}

// Which field of a resource a given breakdown row was counted under — so picking a row in
// the Distribuição table narrows the resource list by that same value, whatever dimension
// is being grouped on.
const DIMENSION_VALUE: Record<GroupBy, (r: InventoryResource) => string> = {
  byType: (r) => r.friendlyType,
  byProvider: (r) => r.provider,
  byResourceGroup: (r) => r.resourceGroup,
  byLocation: (r) => r.location,
  bySubscription: (r) => r.subscriptionName,
};

function filterResources(
  data: InventoryReport,
  search: string,
  includeManaged: boolean,
  groupBy: GroupBy,
  selectedKey: string | null
): InventoryResource[] {
  const term = search.trim().toLowerCase();
  return data.resources.filter((r) => {
    if (!includeManaged && r.managed) return false;
    if (selectedKey !== null && DIMENSION_VALUE[groupBy](r) !== selectedKey) return false;
    if (!term) return true;
    return (
      r.name.toLowerCase().includes(term) ||
      r.friendlyType.toLowerCase().includes(term) ||
      r.type.toLowerCase().includes(term) ||
      r.resourceGroup.toLowerCase().includes(term) ||
      r.location.toLowerCase().includes(term) ||
      (r.sku ?? "").toLowerCase().includes(term)
    );
  });
}

export function Inventory() {
  const { data, isLoading, error } = useInventory();
  const refresh = useRefreshInventory();
  const [groupBy, setGroupBy] = useState<GroupBy>("byType");
  const [search, setSearch] = useState("");
  const [includeManaged, setIncludeManaged] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const filtered = useMemo(
    () => (data ? filterResources(data, search, includeManaged, groupBy, selectedKey) : []),
    [data, search, includeManaged, groupBy, selectedKey]
  );
  const filteredCost = useMemo(() => filtered.reduce((total, r) => total + (r.mtdCost ?? 0), 0), [filtered]);

  const controlStyle: React.CSSProperties = {
    background: "transparent",
    color: "inherit",
    border: "1px solid var(--border-subtle, #555)",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 12.5,
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">Inventário de recursos</h1>
          <p className="page-subtitle">
            Tudo que existe nas assinaturas monitoradas, com o custo do mês de cada item — para responder "o que
            eu tenho" sem abrir o portal assinatura por assinatura.
          </p>
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          style={{
            background: "transparent",
            color: "var(--brand-accent)",
            border: "1px solid var(--brand-accent)",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: refresh.isPending ? "default" : "pointer",
            opacity: refresh.isPending ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {refresh.isPending ? "Atualizando…" : "Atualizar agora"}
        </button>
      </div>

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        {data && (
          <>
            <div className="kpi-grid">
              <StatTile
                label="Recursos"
                value={String(data.totalResources)}
                subLabel={`em ${data.bySubscription.length} assinatura(s) · coletado em ${formatDateTime(data.generatedAt)}`}
              />
              <StatTile label="Tipos distintos" value={String(data.distinctTypes)} />
              <StatTile label="Grupos de recursos" value={String(data.distinctResourceGroups)} />
              <StatTile label="Regiões" value={String(data.distinctLocations)} />
            </div>

            <div className="kpi-grid">
              <StatTile
                label="Gerenciados pelo Azure"
                value={String(data.totalManaged)}
                subLabel="nós de AKS e Databricks, criados automaticamente"
              />
              <StatTile label="Sem nenhuma tag" value={String(data.totalUntagged)} subLabel="sem rastreio de dono ou projeto" />
              <StatTile
                label="Sem custo no mês"
                value={String(data.totalWithoutCost)}
                subLabel="gratuitos, ou ainda sem consumo faturado"
              />
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <p className="card-title" style={{ margin: 0 }}>
                  Distribuição
                </p>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                  Agrupar por
                <select
                  value={groupBy}
                  onChange={(e) => {
                    setGroupBy(e.target.value as GroupBy);
                    // The selection belongs to the old dimension — "App Service Plan" means
                    // nothing once the table is grouped by region.
                    setSelectedKey(null);
                  }}
                  style={controlStyle}
                >
                  {(Object.keys(GROUP_LABEL) as GroupBy[]).map((key) => (
                    <option key={key} value={key}>
                      {GROUP_LABEL[key]}
                    </option>
                  ))}
                </select>
                </label>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "8px 0 12px" }}>
                Contagem e custo do mês agrupados por {GROUP_LABEL[groupBy].toLowerCase()}. Clique numa linha para
                filtrar a lista de recursos abaixo.
              </p>
              <BreakdownTable
                rows={data[groupBy]}
                label={GROUP_LABEL[groupBy]}
                currency={data.currency}
                activeKey={selectedKey}
                onSelect={(key) => setSelectedKey(key === selectedKey ? null : key)}
              />
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <p className="card-title" style={{ margin: 0 }}>
                  Todos os recursos
                </p>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar nome, tipo, grupo, região, SKU…"
                    style={{ ...controlStyle, minWidth: 240 }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)" }}>
                    <input type="checkbox" checked={includeManaged} onChange={(e) => setIncludeManaged(e.target.checked)} />
                    Incluir gerenciados
                  </label>
                  <button
                    onClick={() => downloadCsv(filtered)}
                    style={{
                      background: "transparent",
                      color: "var(--brand-accent)",
                      border: "1px solid var(--brand-accent)",
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Exportar CSV
                  </button>
                </div>
              </div>

              {selectedKey !== null && (
                <p style={{ fontSize: 12.5, margin: "10px 0 0" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      border: "1px solid var(--brand-accent)",
                      borderRadius: 999,
                      padding: "3px 10px",
                      color: "var(--brand-accent)",
                    }}
                  >
                    {GROUP_LABEL[groupBy]}: {selectedKey}
                    <button
                      onClick={() => setSelectedKey(null)}
                      aria-label="Remover filtro"
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        color: "inherit",
                        fontSize: 14,
                        lineHeight: 1,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  </span>
                </p>
              )}

              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "8px 0 12px" }}>
                {filtered.length} recurso(s) · {formatCurrency(filteredCost, data.currency)} no mês
                {filtered.length > TABLE_LIMIT && ` · mostrando os ${TABLE_LIMIT} de maior custo`}
              </p>

              <table className="table table-spacious">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Grupo de recursos</th>
                    <th>Região</th>
                    <th>SKU</th>
                    <th style={{ textAlign: "right" }}>Custo no mês</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, TABLE_LIMIT).map((r) => (
                    <tr key={r.resourceId}>
                      <td>
                        {r.name}
                        {r.managed && (
                          <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>gerenciado pelo Azure</span>
                        )}
                      </td>
                      <td>{r.friendlyType}</td>
                      <td style={{ fontSize: 12 }}>{r.resourceGroup}</td>
                      <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{r.location}</td>
                      <td style={{ fontSize: 12 }}>{r.sku ?? "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {r.mtdCost === null ? <span style={{ color: "var(--text-muted)" }}>—</span> : formatCurrency(r.mtdCost, data.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Nenhum recurso corresponde ao filtro.</p>
              )}
            </div>

            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Inventário vindo do Azure Resource Graph, cruzado com o custo do mês corrente por recurso. "Custo no
              mês" em branco significa que o recurso não tem linha de custo no período — recurso gratuito, ou ainda
              sem consumo faturado. Recursos gerenciados pelo Azure (grupos <code>MC_*</code> de AKS e{" "}
              <code>databricks-rg-*</code>) são contados, porque custam, mas ficam marcados por não terem sido
              criados por ninguém do time.
            </p>
          </>
        )}
      </QueryState>
    </>
  );
}
