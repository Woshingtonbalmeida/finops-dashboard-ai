import { PrinterIcon } from "./Icons";

// Just window.print() behind the app's print stylesheet (index.css @media print) — no
// server-side PDF generation, "salvar como PDF" is the browser's own print-dialog option.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "transparent",
        color: "var(--brand-accent)",
        border: "1px solid var(--brand-accent)",
        borderRadius: 6,
        padding: "6px 12px",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <PrinterIcon size={14} />
      Imprimir / PDF
    </button>
  );
}
