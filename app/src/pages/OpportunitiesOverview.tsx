import { useMemo, useState } from "react";
import { useUnifiedOpportunities, OPPORTUNITY_SOURCE_ORDER, type OpportunitySource } from "../hooks/useUnifiedOpportunities";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { RankedBarChart } from "../components/RankedBarChart";
import { formatCurrency } from "../lib/format";

export function OpportunitiesOverview() {
  const { opportunities, isLoading, error } = useUnifiedOpportunities();
  const [sourceFilter, setSourceFilter] = useState<"all" | OpportunitySource>("all");

  const filtered = sourceFilter === "all" ? opportunities : opportunities.filter((o) => o.source === sourceFilter);
  const currency = opportunities[0]?.currency ?? "BRL";
  const totalMonthlySavings = filtered.reduce((sum, o) => sum + o.monthlySavings, 0);
  const totalResources = filtered.reduce((sum, o) => sum + o.resourceCount, 0);

  const bySource = useMemo(() => {
    const map = new Map<OpportunitySource, number>();
    for (const s of OPPORTUNITY_SOURCE_ORDER) map.set(s, 0);
    for (const o of opportunities) map.set(o.source, (map.get(o.source) ?? 0) + o.monthlySavings);
    return OPPORTUNITY_SOURCE_ORDER.map((source) => ({ name: source, cost: map.get(source) ?? 0 }));
  }, [opportunities]);

  return (
    <>
      <h1 className="page-title">Visão geral de oportunidades</h1>
      <p className="page-subtitle">
        Todas as oportunidades de economia num lugar só — Advisor, recursos órfãos, VMs paradas e candidatos à
        exclusão. O Resumo executivo mostra só o top 3; aqui dá pra ver, filtrar e ordenar a lista inteira.
      </p>

      <QueryState isLoading={isLoading} error={error} hasData={opportunities.length >= 0}>
        <div className="kpi-grid">
          <StatTile
            label="Economia potencial por mês"
            value={formatCurrency(totalMonthlySavings, currency)}
            deltaLabel={sourceFilter === "all" ? "todas as fontes" : sourceFilter}
          />
          <StatTile label="Oportunidades" value={String(filtered.length)} />
          <StatTile label="Recursos afetados" value={String(totalResources)} />
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <p className="card-title">Economia potencial por fonte</p>
          <RankedBarChart data={bySource} currency={currency} />
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p className="card-title" style={{ marginBottom: 0 }}>
              Lista completa
            </p>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as "all" | OpportunitySource)}
              style={{
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 13,
              }}
            >
              <option value="all">Todas as fontes</option>
              {OPPORTUNITY_SOURCE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {filtered.length === 0 ? (
            <p className="state-message">Nenhuma oportunidade encontrada.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Fonte</th>
                  <th>Descrição</th>
                  <th>Subscription</th>
                  <th>Recursos</th>
                  <th>Economia/mês</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.key}>
                    <td>{o.source}</td>
                    <td>{o.description}</td>
                    <td>{o.subscriptionName}</td>
                    <td>{o.resourceCount}</td>
                    <td>{formatCurrency(o.monthlySavings, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            Economia do Advisor é anualizada dividida por 12 pra comparar com o custo mensal real dos recursos
            órfãos/parados/candidatos à exclusão. Reserved Instances e Savings Plans não entram aqui — são
            compromissos já contratados, não oportunidades de economia.
          </p>
        </div>
      </QueryState>
    </>
  );
}
