import { Fragment, useState } from "react";
import { useOptimization, useRefreshOptimization } from "../hooks/useOptimization";
import { useSummary } from "../hooks/useSummary";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { formatCurrency } from "../lib/format";
import type { ReservationSummary } from "../types";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
    >
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppliedResourcesRow({ r, subscriptionName }: { r: ReservationSummary; subscriptionName: (id: string) => string }) {
  const appliedResources = r.appliedResources ?? [];
  if (appliedResources.length === 0) {
    return (
      <tr>
        <td colSpan={8} style={{ background: "var(--surface-2)" }}>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "10px 8px" }}>
            Nenhum recurso consumiu essa reserva nos últimos 30 dias.
          </p>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td colSpan={8} style={{ background: "var(--surface-2)", padding: 0 }}>
        <table className="table" style={{ margin: "6px 8px 12px", width: "calc(100% - 16px)" }}>
          <thead>
            <tr>
              <th>Recurso</th>
              <th>Subscription</th>
              <th>Resource group</th>
              <th>Dias ativos (30d)</th>
              <th>Horas usadas (30d)</th>
            </tr>
          </thead>
          <tbody>
            {appliedResources.map((res) => (
              <tr key={res.resourceId}>
                <td>{res.resourceName}</td>
                <td>{subscriptionName(res.subscriptionId)}</td>
                <td>{res.resourceGroup}</td>
                <td>{res.daysActive}</td>
                <td>{res.usedHours.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export function Reservations() {
  const { data, isLoading, error } = useOptimization();
  const { data: summary } = useSummary();
  const refreshOptimization = useRefreshOptimization();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const reservations = data?.reservations ?? [];
  const billingCurrency = reservations[0]?.billingCurrency ?? "BRL";
  const totalCommitted = reservations.reduce((sum, r) => sum + r.termTotalAmountBilling, 0);
  const totalMonthly = reservations.reduce((sum, r) => sum + (r.monthlyAmountBilling ?? 0), 0);

  const subscriptionName = (id: string) => summary?.bySubscription.find((s) => s.subscriptionId === id)?.subscriptionName ?? id;

  const toggle = (orderId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">Instâncias reservadas</h1>
          <p className="page-subtitle">Reservas de capacidade ativas na billing account (todas as subscriptions)</p>
        </div>
        {data && (
          <button
            onClick={() => refreshOptimization.mutate()}
            disabled={refreshOptimization.isPending}
            style={{
              background: "transparent",
              color: "var(--brand-accent)",
              border: "1px solid var(--brand-accent)",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: refreshOptimization.isPending ? "default" : "pointer",
              opacity: refreshOptimization.isPending ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {refreshOptimization.isPending ? "Atualizando…" : "Atualizar agora"}
          </button>
        )}
      </div>
      {refreshOptimization.isError && (
        <p style={{ fontSize: 11.5, color: "var(--status-critical)", marginTop: -18, marginBottom: 18 }}>
          Não foi possível atualizar agora. Tente novamente em instantes.
        </p>
      )}

      <QueryState isLoading={isLoading} error={error} hasData={reservations.length > 0}>
        <div className="kpi-grid">
          <StatTile label="Reserved Instances ativas" value={String(reservations.length)} />
          <StatTile
            label="Compromisso mensal recorrente"
            value={formatCurrency(totalMonthly, billingCurrency)}
          />
          <StatTile
            label="Valor total dos contratos (termo completo)"
            value={formatCurrency(totalCommitted, billingCurrency)}
          />
        </div>

        <div className="card">
          <p className="card-title">Reservas</p>
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Nome</th>
                <th>Termo</th>
                <th>Qtd.</th>
                <th>Pagamento mensal</th>
                <th>Valor total do termo</th>
                <th>Plano de cobrança</th>
                <th>Expira em</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <Fragment key={r.orderId}>
                  <tr
                    onClick={() => toggle(r.orderId)}
                    style={{ cursor: "pointer" }}
                    title="Clique para ver os recursos que usaram essa reserva nos últimos 30 dias"
                  >
                    <td style={{ color: "var(--text-muted)" }}>
                      <ChevronIcon open={expanded.has(r.orderId)} />
                    </td>
                    <td>
                      {r.displayName}{" "}
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>({(r.appliedResources ?? []).length} recurso(s))</span>
                    </td>
                    <td>{r.term}</td>
                    <td>{r.quantity}</td>
                    <td>
                      {r.monthlyAmountBilling !== undefined
                        ? formatCurrency(r.monthlyAmountBilling, r.billingCurrency)
                        : "—"}
                    </td>
                    <td>{formatCurrency(r.termTotalAmountBilling, r.billingCurrency)}</td>
                    <td>{r.billingPlan}</td>
                    <td>{r.expiryDate ? new Date(r.expiryDate).toLocaleDateString("pt-BR") : "—"}</td>
                    <td>{r.provisioningState}</td>
                  </tr>
                  {expanded.has(r.orderId) && <AppliedResourcesRow r={r} subscriptionName={subscriptionName} />}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            "Valor total do termo" é o valor total do contrato (ex.: os 3 anos inteiros da reserva), não um valor
            mensal. Convertido para {billingCurrency} usando a cotação da última parcela paga na fatura. Clique numa
            reserva para ver quais recursos consumiram sua capacidade nos últimos 30 dias — a reserva não é fixa a um
            recurso, o Azure aplica o benefício a quem precisar naquele dia.
          </p>
        </div>
      </QueryState>
    </>
  );
}
