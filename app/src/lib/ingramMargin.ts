// Margem cobrada pela Ingram (parceiro Microsoft) sobre o custo Azure na fatura repassada ao
// cliente — consumo geral e Reserved Instances têm percentuais diferentes. Aplicado só como
// referência visual (fatura estimada), nunca sobre os valores que alimentam orçamentos,
// forecast, anomalias ou os Insights de IA — esses continuam em custo Azure puro, senão os
// números do dashboard param de bater entre si.
export const INGRAM_CONSUMPTION_MARGIN = 0.07;
export const INGRAM_RI_MARGIN = 0.18;

export function withIngramMargin(azureCost: number, margin: number): number {
  return azureCost * (1 + margin);
}

// Math.round instead of margin * 100 directly — floating point makes 0.07 * 100 print as
// "7.000000000000001" otherwise.
export function marginPercentLabel(margin: number): string {
  return `${Math.round(margin * 100)}%`;
}
