"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PublicGuide } from "@/types/api";
import { ArrowRight, Avatar } from "@/components/BrandMark";
import { shortName } from "@/lib/labels";

/** S01 — Home: pick a guide, no sign-up (FR-8, FR-12); plus the visitor's own generated guides (FR-13). */
export default function HomePage() {
  const [guides, setGuides] = useState<PublicGuide[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.guides().then(setGuides).catch((e: Error) => setError(e.message));
  }, []);

  const builtIn = (guides ?? []).filter((g) => !g.custom);
  const mine = (guides ?? []).filter((g) => g.custom);

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
        {builtIn.map((g, i) => (
          <GuideCell key={g.id} guide={g} primary={i === 0} />
        ))}
        {!guides && !error && <div className="guide-cell muted">Đang tải kịch bản…</div>}
      </div>

      <div className="kicker-row" style={{ borderTop: "2px solid var(--color-divider)" }}>
        <h6 style={{ margin: 0 }}>Kịch bản của bạn</h6>
        <span className="muted" style={{ fontSize: 12 }}>agent dựng persona + tín hiệu từ sản phẩm của bạn</span>
      </div>
      <div className="guide-grid guide-grid-custom">
        {mine.map((g) => (
          <GuideCell key={g.id} guide={g} />
        ))}
        <div className="guide-cell guide-cell-new">
          <div>
            <div className="card-kicker">Tuỳ chỉnh</div>
            <h3 style={{ margin: "6px 0 0" }}>{mine.length ? "Thêm kịch bản mới" : "Luyện trên chính sản phẩm của bạn"}</h3>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Mô tả sản phẩm và người bạn sắp phỏng vấn. Agent sẽ dựng một persona có tính cách, bối cảnh và sáu tín hiệu cần bắt.
          </p>
          <Link href="/guides/new" className="btn btn-wide btn-secondary">
            Tạo kịch bản
            <ArrowRight />
          </Link>
        </div>
      </div>
    </>
  );
}

function GuideCell({ guide: g, primary }: { guide: PublicGuide; primary?: boolean }) {
  return (
    <div className="guide-cell">
      <div>
        <div className="card-kicker">{g.context}</div>
        <h3 style={{ margin: "6px 0 0" }}>{g.title}</h3>
      </div>
      <div className="persona-line">
        <Avatar initial={g.persona.initial} />
        <div>
          <strong>
            {shortName(g.persona.name)}, {g.persona.age}
          </strong>
          <br />
          <span className="muted">{g.persona.tagline}</span>
        </div>
      </div>
      <Link href={`/guides/${g.id}`} className={`btn btn-wide ${primary ? "btn-primary" : "btn-secondary"}`}>
        Bắt đầu luyện
        <ArrowRight />
      </Link>
    </div>
  );
}
