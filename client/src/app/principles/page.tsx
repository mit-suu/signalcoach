"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Principle } from "@/types/api";
import { QUESTION_TEXT } from "@/lib/labels";

/** S12 — interviewing principles library (grounds every feedback comment, FR-7). */
export default function PrinciplesPage() {
  const [items, setItems] = useState<Principle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.principles().then(setItems).catch((e: Error) => setError(e.message));
  }, []);

  // Links from the scorecard land on #P03 etc. — scroll + highlight once loaded.
  useEffect(() => {
    if (!items || !window.location.hash) return;
    const el = document.querySelector(window.location.hash);
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.classList.add("hl");
    }
  }, [items]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!items) return <div className="state-msg muted">Đang tải…</div>;

  return (
    <>
      <div className="section">
        <h1 style={{ margin: 0 }}>Nguyên tắc phỏng vấn</h1>
        <p className="muted" style={{ margin: "8px 0 0", maxWidth: 640 }}>
          Mọi góp ý trên bảng đánh giá đều dẫn về một trong {items.length} nguyên tắc này — agent tra cứu thư viện thay vì tự nghĩ ra lời khuyên.
        </p>
      </div>
      {items.map((p) => (
        <div key={p.id} id={p.id} className="section grid-12 principle">
          <div style={{ gridColumn: "1 / span 5" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="tag tag-outline">{p.id}</span>
              {p.appliesTo.map((t) => (
                <span key={t} className="tag tag-neutral">{QUESTION_TEXT[t]}</span>
              ))}
            </div>
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
