import { useEffect, useState } from "react";
import { useIncentiveSubscriptions, useSaveIncentiveSubscriptions } from "../hooks/useIncentiveSubscriptions";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { BudgetMeter } from "../components/BudgetMeter";
import { formatCurrency } from "../lib/format";
import type { IncentiveSubscription } from "../types";

const inputStyle: React.CSSProperties = {
  background: "var(--surface-1)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 13,
  width: "100%",
};

const labelStyle: React.CSSProperties = { fontSize: 11.5, color: "var(--text-muted)", display: "block", marginBottom: 4 };

function daysUntil(dateIso: string): number | null {
  const target = new Date(`${dateIso}T00:00:00Z`);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const BLANK: IncentiveSubscription = {
  subscriptionId: "",
  subscriptionName: "",
  offerName: "Azure Sponsorship",
  totalCredit: 0,
  usedCost: 0,
  currency: "USD",
  startDate: "",
  expiresOn: "",
};

function SubscriptionCard({
  entry,
  onSave,
  onRemove,
  saving,
}: {
  entry: IncentiveSubscription;
  onSave: (updated: IncentiveSubscription) => void;
  onRemove: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(entry);
  useEffect(() => setDraft(entry), [entry]);

  const remaining = draft.totalCredit - draft.usedCost;
  const percentUsed = draft.totalCredit > 0 ? (draft.usedCost / draft.totalCredit) * 100 : 0;
  const expiry = draft.expiresOn ? daysUntil(draft.expiresOn) : null;
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(entry);

  const field = (key: keyof IncentiveSubscription, label: string, type = "text") => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={draft[key] as string | number}
        onChange={(e) =>
          setDraft((d) => ({
            ...d,
            [key]: type === "number" ? Number(e.target.value) : e.target.value,
          }))
        }
        style={inputStyle}
      />
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
        <div>
          <p className="card-title" style={{ margin: 0 }}>
            {draft.subscriptionName || "(nome não definido)"}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
            {draft.offerName} {draft.subscriptionId && `· ${draft.subscriptionId}`}
          </p>
        </div>
        <button
          onClick={onRemove}
          style={{
            background: "transparent",
            color: "var(--status-critical)",
            border: "1px solid var(--status-critical)",
            borderRadius: 6,
            padding: "5px 10px",
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Remover
        </button>
      </div>

      {draft.totalCredit > 0 && (
        <BudgetMeter
          budget={{
            subscriptionId: draft.subscriptionId,
            budgetName: "Crédito do incentivo",
            amount: draft.totalCredit,
            currentSpend: draft.usedCost,
            timeGrain: "Custom",
            currency: draft.currency,
          }}
        />
      )}

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <StatTile label="Crédito total" value={formatCurrency(draft.totalCredit, draft.currency)} />
        <StatTile label="Usado" value={formatCurrency(draft.usedCost, draft.currency)} />
        <StatTile
          label="Restante"
          value={formatCurrency(remaining, draft.currency)}
          deltaLabel={`${percentUsed.toFixed(1)}% usado`}
          deltaDirection={percentUsed >= 90 ? "up-bad" : percentUsed >= 70 ? "neutral" : "down-good"}
        />
        <StatTile
          label="Expira em"
          value={expiry !== null ? `${expiry} dia${expiry === 1 ? "" : "s"}` : "—"}
          deltaLabel={draft.expiresOn || undefined}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
        {field("subscriptionName", "Nome")}
        {field("subscriptionId", "Subscription ID")}
        {field("offerName", "Oferta")}
        {field("currency", "Moeda")}
        {field("totalCredit", "Crédito total", "number")}
        {field("usedCost", "Usado", "number")}
        {field("startDate", "Início", "date")}
        {field("expiresOn", "Expira em", "date")}
      </div>

      <button
        onClick={() => onSave(draft)}
        disabled={!hasChanges || saving}
        style={{
          background: "transparent",
          color: "var(--brand-accent)",
          border: "1px solid var(--brand-accent)",
          borderRadius: 6,
          padding: "6px 14px",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: !hasChanges || saving ? "default" : "pointer",
          opacity: !hasChanges || saving ? 0.5 : 1,
        }}
      >
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}

export function IncentiveSubscriptions() {
  const { data, isLoading, error } = useIncentiveSubscriptions();
  const save = useSaveIncentiveSubscriptions();
  const [draftNewEntries, setDraftNewEntries] = useState<IncentiveSubscription[]>([]);

  const subscriptions = data?.subscriptions ?? [];

  const saveEntry = (index: number, updated: IncentiveSubscription) => {
    const next = [...subscriptions];
    next[index] = updated;
    save.mutate(next);
  };

  const removeEntry = (index: number) => {
    const next = subscriptions.filter((_, i) => i !== index);
    save.mutate(next);
  };

  const addNewEntry = () => {
    setDraftNewEntries((prev) => [...prev, { ...BLANK }]);
  };

  const saveNewEntry = (draftIndex: number, entry: IncentiveSubscription) => {
    save.mutate([...subscriptions, entry]);
    setDraftNewEntries((prev) => prev.filter((_, i) => i !== draftIndex));
  };

  return (
    <>
      <h1 className="page-title">Subscriptions Incentivo</h1>
      <p className="page-subtitle">
        Subscriptions de patrocínio/incentivo (ex.: Azure Sponsorship) — separadas do resumo principal por serem
        crédito pré-pago, não gasto normal. Azure não expõe o saldo desse tipo de oferta por nenhuma API pública
        (testado via Cost Management, Consumption e Billing Account), então os valores abaixo são inseridos
        manualmente — atualize conforme conferir no portal da Microsoft.
      </p>

      <QueryState isLoading={isLoading} error={error} hasData={true}>
        {subscriptions.length === 0 && draftNewEntries.length === 0 && (
          <p className="state-message">Nenhuma subscription de incentivo cadastrada ainda.</p>
        )}

        {subscriptions.map((entry, i) => (
          <SubscriptionCard
            key={`${entry.subscriptionId}-${i}`}
            entry={entry}
            saving={save.isPending}
            onSave={(updated) => saveEntry(i, updated)}
            onRemove={() => removeEntry(i)}
          />
        ))}

        {draftNewEntries.map((entry, i) => (
          <SubscriptionCard
            key={`new-${i}`}
            entry={entry}
            saving={save.isPending}
            onSave={(updated) => saveNewEntry(i, updated)}
            onRemove={() => setDraftNewEntries((prev) => prev.filter((_, idx) => idx !== i))}
          />
        ))}

        {save.isError && (
          <p style={{ fontSize: 12, color: "var(--status-critical)", marginBottom: 12 }}>
            Não foi possível salvar. Tente novamente em instantes.
          </p>
        )}

        <button
          onClick={addNewEntry}
          style={{
            background: "transparent",
            color: "var(--brand-accent)",
            border: "1px solid var(--brand-accent)",
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Adicionar subscription de incentivo
        </button>
      </QueryState>
    </>
  );
}
