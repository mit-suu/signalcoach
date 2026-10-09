"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PublicGuide } from "@/types/api";
import { ArrowRight, Avatar } from "@/components/BrandMark";

/** S01 — Home: pick a guide, no sign-up (FR-8, FR-12). */
export default function HomePage() {
  const [guides, setGuides] = useState<PublicGuide[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.guides().then(setGuides).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <div className="hero grid-12">
        <h1>Luyện nghe những điều người dùng suýt nói ra.</h1>
        <p>Phỏng vấn một người dùng AI. Bắt những khoảnh khắc đáng đào sâu. Xem mình đã bỏ lỡ gì.</p>
      </div>
      <div className="kicker-row">
        <h6 style={{ margin: 0 }}>Chọn kịch bản</h6>
        <span className="muted" style={{ fontSize: 12 }}>~15 phút · chat văn bản</span>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="guide-grid">
        {(guides ?? []).map((g, i) => (
          <div key={g.id} className="guide-cell">
            <div>
              <div className="card-kicker">{g.context}</div>
              <h3 style={{ margin: "6px 0 0" }}>{g.title}</h3>
            </div>
            <div className="persona-line">
              <Avatar initial={g.persona.initial} />
              <div>
                <strong>
                  {g.persona.name.split(" ").at(-1)}, {g.persona.age}
                </strong>
                <br />
                <span className="muted">{g.persona.tagline}</span>
              </div>
            </div>
            <Link href={`/guides/${g.id}`} className={`btn btn-wide ${i === 0 ? "btn-primary" : "btn-secondary"}`}>
              Bắt đầu luyện
              <ArrowRight />
            </Link>
          </div>
        ))}
        {!guides && !error && <div className="guide-cell muted">Đang tải kịch bản…</div>}
      </div>
    </>
  );
}
