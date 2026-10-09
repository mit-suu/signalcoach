"use client";

import { useEffect } from "react";

interface DialogProps {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
}

/** Modernist confirm dialog (design S05 / S11 / S11b). Escape cancels. */
export function Dialog({ title, children, confirmLabel, cancelLabel = "Huỷ", onConfirm, onCancel, busy, danger }: DialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  return (
    <div className="dialog-backdrop" onClick={() => !busy && onCancel()} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title" id="dlg-title">{title}</div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className={`btn ${danger ? "btn-primary" : "btn-primary"}`} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? "Đang xử lý…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
