"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { ScorecardFeedback, ScorecardSignal, SessionView } from "@/types/api";
import { ArrowRight } from "@/components/BrandMark";
import { DotLegend, SignalDots } from "@/components/SignalDots";
import { QUESTION_TEXT, SIGNAL_TEXT, fmtDate, fmtTime, pct, shortName } from "@/lib/labels";

const HIGHLIGHT = 3; // FR-10: at most 3 mistakes highlighted, the rest on demand

export function Scorecard({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api
      .session(sessionId)
      .then((s) => {
        if (s.status === "active") router.replace(`/session/${sessionId}`);
        else setSession(s);
      })
      .catch((e: ApiError) => setError(e));
  }, [sessionId, router]);

  async function retry() {
    setRetrying(true);
    try {
      setSession(await api.buildScorecard(sessionId));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setRetrying(false);
    }
  }

  async function again() {
    const s = await api.createSession(session!.guideId);
    router.push(`/session/${s.id}`);
  }

  if (error) {
    return (
      <div className="state-msg">
        <h2>Không mở được bảng đánh giá</h2>
        <p className="muted">{error.message}</p>
        <Link href="/history" className="btn btn-secondary">Về lịch sử</Link>
      </div>
    );
  }
  if (!session) return <div className="state-msg muted">Đang tải bảng đánh giá…</div>;

  const personaShort = shortName(session.persona.name);
  const when = `${fmtDate(session.startedAt)} · ${fmtTime(session.startedAt)} · ${session.questionCount} câu hỏi`;

  // S09 — too short
  if (session.status === "insufficient") {
    return (
      <div className="section scorecard">
        <div className="card-kicker">{session.guideTitle} · với {personaShort}</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 24 }}>{when}</div>
        <SignalDots statuses={Array.from({ length: session.signalCount }, () => "not_surfaced")} />
        <h2 style={{ marginTop: 24 }}>Chưa đủ để chấm điểm</h2>
        <p className="muted">Hỏi ít nhất {session.minQuestionsToScore} câu để có đủ dữ liệu góp ý. Buổi này đã hỏi {session.questionCount} câu.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={again}>Thử lại với {personaShort}</button>
          <Link href="/" className="btn btn-secondary">Chọn kịch bản khác</Link>
        </div>
      </div>
    );
  }

  // S06b — review failed; the conversation is safe
  if (!session.scorecard) {
    return (
      <div className="section scorecard">
        <div className="card-kicker">{session.guideTitle} · với {personaShort}</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 24 }}>{when}</div>
        <div className="turn-ticks">
          {session.turns.map((t) => (
            <span key={t.index} className={t.role === "user" ? "tick user" : "tick"} />
          ))}
        </div>
        <h3 style={{ marginTop: 24 }}>Chưa tạo được bảng đánh giá</h3>
        <p className="muted">{session.scorecardError ?? "Hội thoại của bạn vẫn được lưu."}</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={retry} disabled={retrying}>{retrying ? "Đang đọc lại…" : "Thử lại"}</button>
          <Link href={`/session/${sessionId}/review`} className="btn btn-secondary">Xem hội thoại</Link>
        </div>
      </div>
    );
  }

  const sc = session.scorecard;
  const complete = session.status === "complete";
  const score = pct(sc.score);
  const toRewrite = sc.feedback.length;
  const shown = showAll ? sc.feedback : sc.feedback.slice(0, HIGHLIGHT);
  const notSurfaced = sc.signals.filter((s) => s.status === "not_surfaced");

  return (
    <div className="scorecard">
      {/* header: score + dots */}
      <div className="section grid-12 sc-head">
        <div style={{ gridColumn: "1 / span 6" }}>
          <div className="card-kicker">{session.guideTitle} · với {personaShort}</div>
          <div className="muted" style={{ fontSize: 13 }}>{when}</div>
          {complete ? (
            <>
              <div className="score-big">
                <span>{score}</span>
                <span className="score-unit">%</span>
              </div>
              <div className="muted">Khả năng bắt tín hiệu</div>
            </>
          ) : (
            <>
              <div className="score-big score-incomplete">Chưa hoàn thành</div>
              <div className="muted">Kết thúc sớm — không chấm điểm. {personaShort} còn {notSurfaced.length} điều chưa kể.</div>
            </>
          )}
        </div>
        <div style={{ gridColumn: "8 / span 5", alignSelf: "end" }}>
          <SignalDots statuses={sc.signals.map((s) => s.status)} labels={sc.signals.map((s) => s.label)} size={22} />
          <div className="sc-dot-labels">
            {sc.signals.map((s) => (
              <span key={s.signalId} className="muted">{s.label}</span>
            ))}
          </div>
          <DotLegend counts={sc.counts} />
        </div>
      </div>

      {sc.summary && (
        <div className="section">
          <p style={{ margin: 0, fontSize: 16, maxWidth: 720 }}>{sc.summary}</p>
        </div>
      )}

      {/* signals (FR-9) */}
      <div className="section">
        <div className="sc-row-head">
          <h3 style={{ margin: 0 }}>Tín hiệu</h3>
          <Link href={`/session/${sessionId}/review`}>Toàn bộ hội thoại</Link>
        </div>
        <div className="sig-table">
          <div className="sig-head muted">
            <span />
            <span>{personaShort} nói</span>
            <span>Bạn hỏi</span>
            <span>Có thể hỏi</span>
          </div>
          {sc.signals.map((s) => (
            <SignalRow key={s.signalId} s={s} sessionId={sessionId} personaShort={personaShort} />
          ))}
        </div>
      </div>

      {/* question quality (FR-10) */}
      <div className="section">
        <div className="sc-row-head">
          <h3 style={{ margin: 0 }}>Câu hỏi của bạn</h3>
          <span className="muted" style={{ fontSize: 13 }}>
            {toRewrite === 0 ? "Không có câu nào cần viết lại — tốt lắm" : `${toRewrite} câu nên viết lại · sắp theo mức ảnh hưởng tới tín hiệu`}
          </span>
        </div>
        {shown.map((f) => (
          <FeedbackRow key={f.turnIndex} f={f} sessionId={sessionId} />
        ))}
        {toRewrite > HIGHLIGHT && (
          <button className="btn btn-ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Thu gọn" : `Xem thêm ${toRewrite - HIGHLIGHT}`}
          </button>
        )}
      </div>

      {/* focus for next time */}
      <div className="section grid-12">
        <h6 style={{ gridColumn: "1 / -1", marginBottom: 20 }}>Tập trung lần sau</h6>
        {sc.focus.map((f, i) => (
          <div key={f.skill} className="focus-item" style={{ gridColumn: "span 4" }}>
            <span className="focus-n">{i + 1}</span>
            <div>
              <div style={{ fontWeight: 800 }}>{f.skill}</div>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>{f.why}</p>
              {f.principleId && (
                <Link href={`/principles#${f.principleId}`} className="principle-link">
                  <span className="tag tag-outline">{f.principleId}</span>
                </Link>
              )}
            </div>
          </div>
        ))}
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <Link href="/" className="btn btn-primary">Thử kịch bản mới <ArrowRight size={16} /></Link>
          <button className="btn btn-secondary" onClick={again}>Luyện lại kịch bản này</button>
          <Link href="/history" className="btn btn-ghost">Lịch sử</Link>
        </div>
      </div>
    </div>
  );
}

function SignalRow({ s, sessionId, personaShort }: { s: ScorecardSignal; sessionId: string; personaShort: string }) {
  const notReached = s.status === "not_surfaced";
  return (
    <div className={`sig-row sig-${s.status}`}>
      <span className={`dot dot-${s.status}`} />
      <div>
        <div className="sig-label">
          {s.label} <span className={`tag ${s.status === "caught" ? "tag-accent-2" : "tag-neutral"}`}>{SIGNAL_TEXT[s.status]}</span>
        </div>
        {notReached ? (
          <div className="muted" style={{ fontSize: 13 }}>{personaShort} chưa kịp kể điều này.</div>
        ) : (
          <div className="sig-quote">“{s.personaQuote}”{s.surfacedTurn !== null && <Link href={`/session/${sessionId}/review#t${s.surfacedTurn}`} className="muted"> #{s.surfacedTurn}</Link>}</div>
        )}
        {s.status === "unsure" && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Hệ thống chưa chắc chắn — không tính vào điểm. {s.note}</div>}
      </div>
      <div className="sig-asked">
        {s.evidenceTurn !== null && s.evidenceQuote ? (
          <>
            <Link href={`/session/${sessionId}/review#t${s.evidenceTurn}`} className="muted">#{s.evidenceTurn}</Link> {s.evidenceQuote}
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </div>
      <div className="sig-suggest">{s.suggestedQuestion ?? <span className="muted">—</span>}</div>
    </div>
  );
}

function FeedbackRow({ f, sessionId }: { f: ScorecardFeedback; sessionId: string }) {
  return (
    <div className="fb-row">
      <span className="tag tag-neutral">{QUESTION_TEXT[f.type]}</span>
      <div>
        <div className="fb-original">
          <Link href={`/session/${sessionId}/review#t${f.turnIndex}`} className="muted">#{f.turnIndex}</Link> {f.original}
        </div>
        <div className="fb-rewrite">
          <ArrowRight size={14} /> {f.rewrite}
        </div>
      </div>
      <Link href={`/principles#${f.principleId}`} className="principle-link">
        <span className="tag tag-outline">{f.principleId}</span>
        <span>{f.principleName}</span>
      </Link>
    </div>
  );
}
