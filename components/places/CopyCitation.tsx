"use client";

import { useState } from "react";

/**
 * Copies the citation printed beside it. It reads the text from the page
 * rather than taking it as a prop, so the citation is not sent twice. Without
 * script the button does nothing and the citation stays selectable.
 */
export function CopyCitation({ targetId, label, copied, failed }: Readonly<{ targetId: string; label: string; copied: string; failed: string }>) {
  const [status, setStatus] = useState("");
  const copy = () => {
    const text = document.getElementById(targetId)?.textContent ?? "";
    // The Clipboard API is missing outside secure contexts; say so rather than throw.
    if (!navigator.clipboard) return setStatus(failed);
    navigator.clipboard.writeText(text).then(() => setStatus(copied), () => setStatus(failed));
  };
  return (
    <>
      <button type="button" className="btn btn--outline" onClick={copy}>{label}</button>
      <span role="status" className="place-share-status">{status}</span>
    </>
  );
}
