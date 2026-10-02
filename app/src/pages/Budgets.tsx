import { useBudgets, useRefreshBudgets } from "../hooks/useBudgets";
import { useSummary } from "../hooks/useSummary";
import { BudgetMeter } from "../components/BudgetMeter";
import { QueryState } from "../components/QueryState";
import { formatCurrency } from "../lib/format";

export function Budgets() {
  const { data, isLoading, error } = useBudgets();
  const { data: summary } = useSummary();
  const refresh = useRefreshBudgets();

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">Orçamentos & alertas</h1>
          <p className="page-subtitle">Consumido vs. orçamento configurado no Azure Budgets, por subscription</p>
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          style={{
            background: "transparent",
            color: "var(--brand-accent)",
            border: "1px solid var(--brand-accent)",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            cursor: refresh.isPending ? "default" : "pointer",
            opacity: refresh.isPending ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {refresh.isPending ? "Atualizando…" : "Atualizar agora"}
        </button>
      </div>
      {refresh.isSuccess && (
        <p style={{ fontSize: 12, color: "var(--status-good)", margin: "8px 0 0" }}>
          Budgets atualizados a partir do Azure — {refresh.data.budgets.length} budget(s) encontrado(s).
        </p>
      )}
      {refresh.isError && (
        <p style={{ fontSize: 12, color: "var(--status-critical)", margin: "8px 0 0" }}>
          Não foi possível atualizar os budgets agora. Tente novamente em instantes.
        </p>
      )}

      <QueryState isLoading={isLoading} error={error} hasData={!!data && data.budgets.length > 0}>
        {data && (
          <div className="card">
            {data.budgets.map((budget) => {
              const sub = summary?.bySubscription.find((s) => s.subscriptionId === budget.subscriptionId);
              // O currentSpend que o Azure devolve na API de Budgets tem defasagem própria (às vezes
              // fica em zero por dias após a criação do budget). Preferimos o MTD que já calculamos
              // a partir do FOCUS export, que é o mesmo número usado no resto do dashboard.
              const effectiveSpend = sub?.cost ?? budget.currentSpend;
              const isStale = sub !== undefined && Math.abs(sub.cost - budget.currentSpend) > 0.01;
              return (
                <div key={`${budget.subscriptionId}-${budget.budgetName}`}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px" }}>
                    {sub?.subscriptionName ?? budget.subscriptionId}
                  </p>
                  <BudgetMeter budget={{ ...budget, currentSpend: effectiveSpend }} />
                  {isStale && (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "-10px 0 18px" }}>
                      Gasto calculado a partir do FOCUS export (o valor do próprio Azure Budgets ainda mostra{" "}
                      {formatCurrency(budget.currentSpend, budget.currency)} — pode levar alguns dias para o Azure
                      atualizar após a criação do budget).
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </QueryState>

      {data && data.budgets.length === 0 && (
        <p className="state-message">
          Nenhum budget configurado ainda. Crie um em Cost Management + Billing → Budgets para cada subscription.
        </p>
      )}
    </>
  );
}
