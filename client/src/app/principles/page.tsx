"use client";

import { LoadingState } from "@/components/LoadingState";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Principle } from "@/types/api";
import { CheckIcon, CrossIcon } from "@/components/BrandMark";
import { QUESTION_TEXT, plain } from "@/lib/labels";

/** Interviewing principles — every scorecard comment points to one of these. */
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

  if (error) return <div className="wrap"><div className="error-banner">{error}</div></div>;
  if (!items) return <LoadingState label="Đang tải nguyên tắc hỏi…" />;

  return (
    <div className="wrap page principles">
      <p className="eyebrow">Nguyên tắc hỏi</p>
      <h1>{items.length} nguyên tắc của một buổi phỏng vấn tốt</h1>
      <p className="lead">Mỗi góp ý trong bảng đánh giá đều dựa trên một trong các nguyên tắc dưới đây, kèm một câu nên tránh và một câu nên hỏi.</p>
      <ol className="principle-list">
        {items.map((p, i) => (
          <li key={p.id} id={p.id} className="card principle">
            <div className="principle-head">
              <span className="num">{i + 1}</span>
              <div>
                <h2>{plain(p.name)}</h2>
                <p className="muted">{plain(p.summary)}</p>
                {p.appliesTo.length > 0 && (
                  <div className="row">
                    {p.appliesTo.map((t) => (
                      <span key={t} className="tag tag-neutral">{QUESTION_TEXT[t]}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="principle-examples">
              <div className="ans bad">
                <span className="ans-label"><CrossIcon /> Thay vì</span>
                <p>{p.badExample}</p>
              </div>
              <div className="ans good">
                <span className="ans-label"><CheckIcon /> Thử hỏi</span>
                <p>{p.goodExample}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
