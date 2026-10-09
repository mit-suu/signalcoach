"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Principle } from "@/types/api";

/** S12 — interviewing principles library (grounds every feedback comment, FR-7). */
export default function PrinciplesPage() {
  const [items, setItems] = useState<Principle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.principles().then(setItems).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!items) return <div className="state-msg muted">Đang tải…</div>;

  return (
    <>
      <div className="section">
        <h1 style={{ margin: 0 }}>Nguyên tắc phỏng vấn</h1>
      </div>
      {items.map((p) => (
        <div key={p.id} id={p.id} className="section grid-12">
          <div style={{ gridColumn: "1 / span 5" }}>
            <span className="tag tag-outline">{p.id}</span>
            <h3 style={{ margin: "10px 0" }}>{p.name}</h3>
            <p className="muted">{p.summary}</p>
          </div>
          <div style={{ gridColumn: "7 / span 6", display: "grid", gap: 12 }}>
            <div>
              <h6 className="muted">Thay vì</h6>
              <p style={{ textDecoration: "line-through", margin: 0 }}>{p.badExample}</p>
            </div>
            <div>
              <h6 style={{ color: "var(--color-accent-700)" }}>Thử hỏi</h6>
              <p style={{ margin: 0 }}>{p.goodExample}</p>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
