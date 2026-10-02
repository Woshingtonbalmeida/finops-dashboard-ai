import { readJsonBlob, writeJsonBlob } from "./storage";
import { MonthlyHistoryReport } from "./monthlyHistory";

export const VARIANCE_DIMENSIONS = ["service", "resourceGroup"] as const;
export type VarianceDimension = (typeof VARIANCE_DIMENSIONS)[number];

// "Sumiu"/"Surgiu" instead of a plain increase/decrease when one side is effectively zero:
// a resource group that went from R$ 4.000 to R$ 12 was almost certainly emptied, not
// optimized, and the two cases call for different follow-up. The 2% threshold (rather than
// exactly zero) is what makes it survive the residual cost a deleted workload leaves behind
// — orphaned disks, public IPs, a few days of logs billed after the fact.
const NEAR_ZERO_RATIO = 0.02;

// Rows below this are rounding noise; showing them buries the handful of lines that
// actually explain the month's variance.
const MIN_ABSOLUTE_DELTA = 1;

export type VarianceChangeType = "Surgiu" | "Sumiu" | "Aumentou" | "Reduziu" | "Estável";

export interface VarianceNote {
  dimension: VarianceDimension;
  key: string;
  subscriptionId: string;
  fromMonth: string;
  toMonth: string;
  note: string;
  updatedAt: string;
  updatedBy: string;
}

export interface VarianceNotesReport {
  updatedAt: string;
  notes: VarianceNote[];
}

export interface VarianceRow {
  key: string;
  subscriptionId: string;
  subscriptionName: string;
  fromCost: number;
  toCost: number;
  delta: number;
  // null when fromCost is 0 — a percentage against a zero baseline is meaningless, and
  // rendering it as Infinity or 100% would both be wrong.
  deltaPercent: number | null;
  changeType: VarianceChangeType;
  note?: VarianceNote;
}

export interface MonthVarianceReport {
  generatedAt: string;
  fromMonth: string;
  toMonth: string;
  dimension: VarianceDimension;
  currency: string;
  fromTotal: number;
  toTotal: number;
  delta: number;
  deltaPercent: number | null;
  rows: VarianceRow[];
  availableMonths: string[];
}

export interface SetVarianceNoteInput {
  dimension: VarianceDimension;
  key: string;
  subscriptionId: string;
  fromMonth: string;
  toMonth: string;
  note: string;
}

const CURATED_CONTAINER = "curated";
const NOTES_BLOB = "month-variance-notes.json";
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function isValidDimension(value: unknown): value is VarianceDimension {
  return typeof value === "string" && (VARIANCE_DIMENSIONS as readonly string[]).includes(value);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function classify(fromCost: number, toCost: number): VarianceChangeType {
  if (fromCost <= 0 && toCost <= 0) return "Estável";
  if (fromCost > 0 && toCost < fromCost * NEAR_ZERO_RATIO) return "Sumiu";
  if (toCost > 0 && fromCost < toCost * NEAR_ZERO_RATIO) return "Surgiu";
  if (toCost > fromCost) return "Aumentou";
  if (toCost < fromCost) return "Reduziu";
  return "Estável";
}

export async function readVarianceNotes(): Promise<VarianceNotesReport> {
  const existing = await readJsonBlob<VarianceNotesReport>(CURATED_CONTAINER, NOTES_BLOB);
  if (!existing) return { updatedAt: new Date().toISOString(), notes: [] };
  return { ...existing, notes: existing.notes ?? [] };
}

// A note belongs to one cell of the comparison: this dimension, this key, this subscription,
// this exact month pair. "Desligamos o SQL X" is true for Jul→Ago and says nothing about
// Ago→Set, so the month pair is part of the identity rather than a filter over it.
function noteKey(dimension: string, key: string, subscriptionId: string, fromMonth: string, toMonth: string): string {
  return [dimension, key.toLowerCase(), subscriptionId.toLowerCase(), fromMonth, toMonth].join("|");
}

export async function setVarianceNote(input: unknown, updatedBy: string): Promise<VarianceNotesReport> {
  const current = await readVarianceNotes();
  const report = applyVarianceNote(current, input, updatedBy);
  await writeJsonBlob(CURATED_CONTAINER, NOTES_BLOB, report);
  return report;
}

// Split out from setVarianceNote so the validation and merge rules can run without a
// storage account behind them — the local dev server reuses this exact function against a
// file-backed notes report instead of reimplementing the rules.
export function applyVarianceNote(current: VarianceNotesReport, input: unknown, updatedBy: string): VarianceNotesReport {
  if (typeof input !== "object" || input === null) throw new Error("Payload inválido");
  const v = input as Record<string, unknown>;
  if (!isValidDimension(v.dimension)) throw new Error("dimension inválido: esperado 'service' ou 'resourceGroup'");
  if (typeof v.key !== "string" || v.key.length === 0) throw new Error("key inválido");
  if (typeof v.subscriptionId !== "string") throw new Error("subscriptionId inválido");
  if (typeof v.fromMonth !== "string" || !MONTH_PATTERN.test(v.fromMonth)) throw new Error("fromMonth inválido: esperado YYYY-MM");
  if (typeof v.toMonth !== "string" || !MONTH_PATTERN.test(v.toMonth)) throw new Error("toMonth inválido: esperado YYYY-MM");
  if (typeof v.note !== "string") throw new Error("note inválido");

  const valid = input as SetVarianceNoteInput;
  const now = new Date().toISOString();
  const id = noteKey(valid.dimension, valid.key, valid.subscriptionId, valid.fromMonth, valid.toMonth);

  const notes = current.notes.filter(
    (n) => noteKey(n.dimension, n.key, n.subscriptionId, n.fromMonth, n.toMonth) !== id
  );
  // An empty note is a delete: the row keeps its numbers and loses the annotation, which is
  // how the UI clears a note it no longer wants without a separate endpoint.
  const trimmed = valid.note.trim();
  if (trimmed.length > 0) {
    notes.push({ ...valid, note: trimmed, updatedAt: now, updatedBy });
  }

  return { updatedAt: now, notes };
}

interface GroupedRow {
  yearMonth: string;
  subscriptionId: string;
  subscriptionName: string;
  key: string;
  cost: number;
  currency: string;
}

function flatten(history: MonthlyHistoryReport, dimension: VarianceDimension): GroupedRow[] {
  if (dimension === "service") {
    return history.byService.map((r) => ({ ...r, key: r.service }));
  }
  return (history.byResourceGroup ?? []).map((r) => ({ ...r, key: r.resourceGroup }));
}

export function buildMonthVariance(
  history: MonthlyHistoryReport,
  notes: VarianceNote[],
  dimension: VarianceDimension,
  fromMonth: string,
  toMonth: string
): MonthVarianceReport {
  const rows = flatten(history, dimension);
  const availableMonths = [...new Set(rows.map((r) => r.yearMonth))].sort();
  const currency = rows[0]?.currency ?? "BRL";

  // Same (key, subscription) can appear once per row; sum rather than overwrite so a
  // dimension the API splits across several rows in a month still totals correctly.
  const costs = new Map<string, { from: number; to: number; row: GroupedRow }>();
  for (const row of rows) {
    if (row.yearMonth !== fromMonth && row.yearMonth !== toMonth) continue;
    const id = `${row.key.toLowerCase()}|${row.subscriptionId.toLowerCase()}`;
    const entry = costs.get(id) ?? { from: 0, to: 0, row };
    if (row.yearMonth === fromMonth) entry.from += row.cost;
    else entry.to += row.cost;
    costs.set(id, entry);
  }

  const noteFor = (key: string, subscriptionId: string) =>
    notes.find(
      (n) =>
        noteKey(n.dimension, n.key, n.subscriptionId, n.fromMonth, n.toMonth) ===
        noteKey(dimension, key, subscriptionId, fromMonth, toMonth)
    );

  const varianceRows: VarianceRow[] = [];
  for (const { from, to, row } of costs.values()) {
    const delta = to - from;
    if (Math.abs(delta) < MIN_ABSOLUTE_DELTA) continue;
    varianceRows.push({
      key: row.key,
      subscriptionId: row.subscriptionId,
      subscriptionName: row.subscriptionName,
      fromCost: round(from),
      toCost: round(to),
      delta: round(delta),
      deltaPercent: from > 0 ? round((delta / from) * 100) : null,
      changeType: classify(from, to),
      note: noteFor(row.key, row.subscriptionId),
    });
  }

  // Ascending: biggest drops first, biggest increases last, so the page can slice both ends
  // without re-sorting.
  varianceRows.sort((a, b) => a.delta - b.delta);

  const sumMonth = (month: string) => rows.filter((r) => r.yearMonth === month).reduce((total, r) => total + r.cost, 0);
  const fromTotal = sumMonth(fromMonth);
  const toTotal = sumMonth(toMonth);

  return {
    generatedAt: new Date().toISOString(),
    fromMonth,
    toMonth,
    dimension,
    currency,
    fromTotal: round(fromTotal),
    toTotal: round(toTotal),
    delta: round(toTotal - fromTotal),
    deltaPercent: fromTotal > 0 ? round(((toTotal - fromTotal) / fromTotal) * 100) : null,
    rows: varianceRows,
    availableMonths,
  };
}

// Defaults to the two most recent complete months in the data when the caller doesn't pick
// a pair, so the page opens on a useful comparison instead of an empty selector.
export function defaultMonthPair(availableMonths: string[], now: Date): { fromMonth: string; toMonth: string } {
  const currentMonth = now.toISOString().slice(0, 7);
  const complete = availableMonths.filter((m) => m < currentMonth);
  if (complete.length >= 2) {
    return { fromMonth: complete[complete.length - 2], toMonth: complete[complete.length - 1] };
  }
  if (availableMonths.length >= 2) {
    return { fromMonth: availableMonths[availableMonths.length - 2], toMonth: availableMonths[availableMonths.length - 1] };
  }
  const only = availableMonths[0] ?? currentMonth;
  return { fromMonth: only, toMonth: only };
}

export async function getMonthVariance(
  dimension: VarianceDimension,
  fromMonth?: string,
  toMonth?: string
): Promise<MonthVarianceReport | undefined> {
  const history = await readJsonBlob<MonthlyHistoryReport>(CURATED_CONTAINER, "monthly-history.json");
  if (!history) return undefined;
  const { notes } = await readVarianceNotes();

  const available = [...new Set(flatten(history, dimension).map((r) => r.yearMonth))].sort();
  const fallback = defaultMonthPair(available, new Date());
  const from = fromMonth && MONTH_PATTERN.test(fromMonth) ? fromMonth : fallback.fromMonth;
  const to = toMonth && MONTH_PATTERN.test(toMonth) ? toMonth : fallback.toMonth;

  return buildMonthVariance(history, notes, dimension, from, to);
}
