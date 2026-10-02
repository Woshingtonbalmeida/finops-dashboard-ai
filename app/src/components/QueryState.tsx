import type { ReactNode } from "react";
import { ApiError } from "../api/client";

interface QueryStateProps {
  isLoading: boolean;
  error: unknown;
  hasData: boolean;
  children: ReactNode;
}

// A route with nothing collected yet answers 503 with its own explanation. That is not a
// failure, and showing it as one made a brand-new deployment look broken — every page read
// "Erro ao carregar dados" while it was simply waiting for the first daily run.
function notReadyMessage(error: unknown): string | null {
  return error instanceof ApiError && error.status === 503
    ? error.message || "Ainda não há dados coletados. A primeira execução diária ainda não rodou."
    : null;
}

export function QueryState({ isLoading, error, hasData, children }: QueryStateProps) {
  if (isLoading) return <p className="state-message">Carregando…</p>;

  const waiting = notReadyMessage(error);
  if (waiting) return <p className="state-message">{waiting}</p>;

  if (error) return <p className="state-message">Erro ao carregar dados. Tente novamente em instantes.</p>;
  if (!hasData) {
    return (
      <p className="state-message">
        Ainda não há dados agregados. O primeiro export diário pode levar algumas horas para ser processado.
      </p>
    );
  }
  return <>{children}</>;
}
