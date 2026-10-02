import { useOptimization } from "../hooks/useOptimization";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { formatCurrency } from "../lib/format";

export function SavingsPlans() {
  const { data, isLoading, error } = useOptimization();
  const savingsPlans = data?.savingsPlans ?? [];

  return (
    <>
      <h1 className="page-title">Planos de economia</h1>
      <p className="page-subtitle">Savings plans contratados na billing account</p>

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        <div className="kpi-grid">
          <StatTile label="Savings Plans ativos" value={String(savingsPlans.length)} />
        </div>

        <div className="card">
          <p className="card-title">Savings Plans</p>
          {savingsPlans.length === 0 ? (
            <p className="state-message">Nenhum savings plan contratado.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Termo</th>
                  <th>Compromisso/hora</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {savingsPlans.map((s) => (
                  <tr key={s.orderId}>
                    <td>{s.displayName}</td>
                    <td>{s.term}</td>
                    <td>{formatCurrency(s.commitmentAmount, s.commitmentCurrency)}</td>
                    <td>{s.provisioningState}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </QueryState>
    </>
  );
}
