"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PublicGuide } from "@/types/api";
import { ArrowRight, Avatar } from "@/components/BrandMark";

export function GuideBrief({ params }: { params: Promise<{ guideId: string }> }) {
  const { guideId } = use(params);
  const router = useRouter();
  const [guide, setGuide] = useState<PublicGuide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api.guide(guideId).then(setGuide).catch((e: Error) => setError(e.message));
  }, [guideId]);

  async function start() {
    setStarting(true);
    try {
      const session = await api.createSession(guideId);
      router.push(`/session/${session.id}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!guide) return <div className="state-msg muted">Đang tải…</div>;
  const p = guide.persona;

  return (
    <>
      <div className="section grid-12">
        <Link href="/" className="muted" style={{ gridColumn: "1 / -1", fontSize: 13, textDecoration: "none", marginBottom: 16 }}>
          ← Tất cả kịch bản
        </Link>
        <div style={{ gridColumn: "1 / span 7" }}>
          <div className="card-kicker">{guide.context}</div>
          <h1 style={{ margin: "6px 0 16px" }}>{guide.title}</h1>
          <h6 className="muted">Mục tiêu</h6>
          <p style={{ fontSize: 16 }}>{guide.goal}</p>
          <p className="muted" style={{ fontSize: 13 }}>
            Ẩn trong cuộc trò chuyện · {guide.signalCount} tín hiệu
          </p>
        </div>
        <div style={{ gridColumn: "9 / span 4", alignSelf: "end" }}>
          <button className="btn btn-primary btn-wide" style={{ width: "100%" }} onClick={start} disabled={starting}>
            {starting ? "Đang chuẩn bị…" : "Bắt đầu phỏng vấn"}
            <ArrowRight />
          </button>
        </div>
      </div>
      <div className="section grid-12">
        <div className="persona-line" style={{ gridColumn: "1 / span 5", alignItems: "flex-start" }}>
          <Avatar initial={p.initial} size={64} />
          <div>
            <h4 style={{ margin: 0 }}>
              {p.name}, {p.age}
            </h4>
            <p className="muted">{p.background}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {p.traits.map((t) => (
                <span key={t} className="tag tag-neutral">{t}</span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ gridColumn: "7 / span 6" }}>
          <h6 className="muted">Câu hỏi gợi ý</h6>
          {guide.suggestedQuestions.map((q, i) => (
            <div key={q} style={{ display: "flex", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--color-divider)" }}>
              <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</span>
              {q}
            </div>
          ))}
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            Chỉ là điểm khởi đầu — hãy đi theo cuộc trò chuyện, không phải danh sách.
          </p>
        </div>
      </div>
    </>
  );
}
