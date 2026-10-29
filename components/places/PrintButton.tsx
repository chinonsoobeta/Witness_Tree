"use client";

/**
 * Opens the browser's print dialog, whose "Save as PDF" destination makes the
 * riding sheet's PDF. The whole island is this one handler. Without script the
 * button does nothing, and the browser's own Print command prints the same
 * sheet.
 */
export function PrintButton({ label }: Readonly<{ label: string }>) {
  return <button type="button" className="btn btn--primary" onClick={() => window.print()}>{label}</button>;
}
