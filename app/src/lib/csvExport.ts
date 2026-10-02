// Plain CSV, no library — the "xlsx" npm package has two high-severity CVEs with no fix
// available (prototype pollution, ReDoS), and the actively-maintained alternative
// (exceljs) drags in ~100 packages built for Node, not the browser. Excel opens CSV
// natively, so this covers the need without either tradeoff.

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(","));
  // BOM so Excel (Windows) detects UTF-8 and renders accented characters correctly
  // instead of mangling them.
  return `﻿${lines.join("\r\n")}`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
