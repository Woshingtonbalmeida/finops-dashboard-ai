import { useOrphanedResources } from "../hooks/useOrphanedResources";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { formatCurrency } from "../lib/format";

const TYPE_LABELS: Record<string, string> = {
  "microsoft.compute/disks": "Disco gerenciado",
  "microsoft.network/publicipaddresses": "IP público",
  "microsoft.network/networkinterfaces": "Interface de rede",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type.toLowerCase()] ?? type;
}

export function OrphanedResources() {
  const { data, isLoading, error } = useOrphanedResources();
  const resources = data?.resources ?? [];

  return (
    <>
      <h1 className="page-title">Recursos órfãos</h1>
      <p className="page-subtitle">
        Discos, IPs públicos e interfaces de rede que não estão conectados a nenhum recurso, mas continuam gerando
        custo
      </p>

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        <div className="kpi-grid">
          <StatTile label="Recursos órfãos encontrados" value={String(resources.length)} />
          <StatTile
            label="Custo no mês (desperdício)"
            value={formatCurrency(data?.totalMtdCost ?? 0, data?.currency ?? "BRL")}
          />
        </div>

        <div className="card">
          <p className="card-title">Recursos</p>
          {resources.length === 0 ? (
            <p className="state-message">Nenhum recurso órfão encontrado — tudo conectado.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Resource group</th>
                  <th>Região</th>
                  <th>SKU</th>
                  <th>Custo no mês</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <tr key={r.resourceId}>
                    <td>{r.name}</td>
                    <td>{typeLabel(r.type)}</td>
                    <td>{r.resourceGroup}</td>
                    <td>{r.location}</td>
                    <td>{r.sku || "—"}</td>
                    <td>{formatCurrency(r.mtdCost, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            Detectados via Azure Resource Graph: discos sem VM associada, IPs públicos sem configuração e NICs sem VM
            ou private endpoint. Custo real do mês, cruzado com o export FOCUS por ResourceId.
          </p>
        </div>
      </QueryState>
    </>
  );
}
