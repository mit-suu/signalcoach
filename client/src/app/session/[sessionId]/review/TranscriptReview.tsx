"use client";

import { LoadingState } from "@/components/LoadingState";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { SessionView, Turn } from "@/types/api";
import { QUESTION_TEXT, QUESTION_WHY, SIGNAL_TEXT, STATUS_TEXT, actionText, fmtDate, fmtTime, pct, plain, shortName, turnNo } from "@/lib/labels";

type Filter = "all" | "clues" | "fix";

type ScSignal = NonNullable<SessionView["scorecard"]>["signals"][number];
type ScFeedback = NonNullable<SessionView["scorecard"]>["feedback"][number];

/**
 * The whole conversation after a session: where each clue came up, which questions to ask
 * differently and (switch "Giải thích từng lượt") a plain line per turn plus the agent's reason
 * for each reply. The raw self-check log sits behind a "Chi tiết kỹ thuật" disclosure.
 */
export function TranscriptReview({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [explain, setExplain] = useState(false);

  useEffect(() => {
    api
      .session(sessionId)
      .then((s) => (s.status === "active" ? router.replace(`/session/${sessionId}`) : setSession(s)))
      .catch((e: ApiError) => setError(e));
  }, [sessionId, router]);

  // Scroll to #tNN once loaded (links from the scorecard)
  useEffect(() => {
    if (!session) return;
    const hash = window.location.hash;
    if (!hash) return;
    const el = document.querySelector(hash);
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.classList.add("hl");
    }
  }, [session]);

  const bySignal = useMemo(() => new Map(session?.scorecard?.signals.map((s) => [s.signalId, s]) ?? []), [session]);
  const byFeedback = useMemo(() => new Map(session?.scorecard?.feedback.map((f) => [f.turnIndex, f]) ?? []), [session]);

  if (error) return <div className="wrap"><div className="error-banner">{error.message}</div></div>;
  if (!session) return <LoadingState label="Đang mở lại cuộc trò chuyện…" />;

  const name = shortName(session.persona.name);
  const visible = session.turns.filter((t) => {
    if (filter === "clues") return Boolean(t.signalId) || (t.role === "user" && session.scorecard?.signals.some((s) => s.evidenceTurn === t.index));
    if (filter === "fix") return byFeedback.has(t.index);
    return true;
  });
  const notSurfaced = session.scorecard?.signals.filter((s) => s.status === "not_surfaced") ?? [];
  const score = pct(session.score);

  return (
    <div className="wrap page review">
      <Link href={`/session/${sessionId}/scorecard`} className="back-link">← Bảng đánh giá</Link>
      <div className="split review-head">
        <div>
          <p className="card-kicker">{session.guideContext}</p>
          <h1>{session.guideTitle} · với {name}</h1>
        </div>
        <div className="review-meta">
          <span className="small">{fmtDate(session.startedAt)} · {fmtTime(session.startedAt)} · {session.questionCount} câu hỏi</span>
          <span className="tag tag-accent">{STATUS_TEXT[session.status]}{score !== null ? ` · ${score}/100 điểm` : ""}</span>
        </div>
      </div>

      <div className="review-bar">
        <div className="seg" role="radiogroup" aria-label="Lọc các lượt">
          {(["all", "clues", "fix"] as Filter[]).map((f) => (
            <label key={f} className="seg-opt">
              <input type="radio" name="filter" checked={filter === f} onChange={() => setFilter(f)} />
              {f === "all" ? "Tất cả" : f === "clues" ? "Chỗ có manh mối" : "Câu nên hỏi khác"}
            </label>
          ))}
        </div>
        <label className="switch">
          <input type="checkbox" checked={explain} onChange={(e) => setExplain(e.target.checked)} />
          <span className="switch-track"><span className="switch-thumb" /></span>
          Giải thích từng lượt
        </label>
      </div>

      <div className="review-list">
        {visible.map((t) => (
          <TurnRow key={t.index} t={t} session={session} name={name} explain={explain} bySignal={bySignal} byFeedback={byFeedback} />
        ))}
        {visible.length === 0 && <p className="muted">Không có lượt nào khớp bộ lọc này.</p>}
      </div>

      {notSurfaced.length > 0 && (
        <section className="card review-untold">
          <h3>{name} chưa kịp kể</h3>
          <p className="muted">Những chuyện này cần thêm vài câu hỏi nữa để {name} kể tới.</p>
          <ul>
            {notSurfaced.map((s) => (
              <li key={s.signalId}>{s.label}</li>
            ))}
          </ul>
        </section>
      )}

      {session.selfCheckLog.length > 0 && (
        <details className="tech">
          <summary>Chi tiết kỹ thuật</summary>
          <p className="small">Trước khi đưa ra bảng đánh giá, SignalCoach tự đối chiếu lại với cuộc trò chuyện. Đây là {session.selfCheckLog.length} chỗ đã được sửa.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Mục</th><th>Kiểm tra</th><th>Trước</th><th>Sau</th></tr>
              </thead>
              <tbody>
                {session.selfCheckLog.map((e, i) => (
                  <tr key={i}>
                    <td>{e.target}</td>
                    <td>{e.check}</td>
                    <td className="muted">{e.before}</td>
                    <td>{e.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function TurnRow({
  t,
  session,
  name,
  explain,
  bySignal,
  byFeedback,
}: {
  t: Turn;
  session: SessionView;
  name: string;
  explain: boolean;
  bySignal: Map<string, ScSignal>;
  byFeedback: Map<number, ScFeedback>;
}) {
  const signal = t.signalId ? bySignal.get(t.signalId) : undefined;
  const planted = Boolean(t.signalId) && t.layerDepth === 1;
  const deeper = Boolean(t.signalId) && (t.layerDepth ?? 0) > 1;
  const caughtHere = session.scorecard?.signals.filter((s) => s.evidenceTurn === t.index) ?? [];
  const fb = byFeedback.get(t.index);
  const offScript = t.flags?.includes("break_attempt");
  const isUser = t.role === "user";
  const hasSide = (signal && (planted || deeper)) || caughtHere.length > 0 || fb || (isUser && offScript);

  return (
    <div id={`t${t.index}`} className={`rv-turn ${t.role}`}>
      <div className="rv-who">
        <b>{isUser ? "Bạn" : name}</b>
        <span className="muted">{turnNo(t.index)}</span>
      </div>
      <div className="rv-body">
        <p className="rv-text">{t.text}</p>
        {/* The judge's own note is written for the agent (ids, English terms); learners get the plain line per question kind. */}
        {explain && isUser && offScript && <p className="rv-explain">Đây không phải câu hỏi phỏng vấn, nên không tính là câu hỏi tốt hay chưa tốt.</p>}
        {explain && isUser && !offScript && t.questionType && (
          <p className="rv-explain">
            <span className={`tag ${t.questionType === "good" ? "tag-accent" : "tag-warn"}`}>{QUESTION_TEXT[t.questionType]}</span> {QUESTION_WHY[t.questionType]}
          </p>
        )}
        {explain && !isUser && t.decision && (
          <p className="rv-explain">
            {actionText(t.decision.action, name)}
            {t.decision.reason && <span className="rv-reason">Lý do: {plain(t.decision.reason, name)}</span>}
          </p>
        )}
      </div>
      {hasSide && (
        <div className="rv-side">
          {signal && (planted || deeper) && (
            <div className="rv-note">
              <span className={`chip chip-${signal.status}`}>{planted ? SIGNAL_TEXT[signal.status] : "Kể thêm"}</span>
              <span>{planted ? `${name} nhắc thoáng qua: ${signal.label}` : `${name} kể sâu hơn về: ${signal.label}`}</span>
            </div>
          )}
          {caughtHere.map((s) => (
            <div key={s.signalId} className="rv-note">
              <span className={`chip chip-${s.status}`}>{SIGNAL_TEXT[s.status]}</span>
              <span>{s.status === "caught" ? "Bạn hỏi sâu" : s.status === "partial" ? "Bạn chạm tới" : "Câu hỏi về"}: {s.label}</span>
            </div>
          ))}
          {isUser && offScript && <div className="rv-note muted">Câu này nhờ {name} làm việc khác ngoài buổi phỏng vấn. {name} vẫn kể chuyện của mình.</div>}
          {fb && (
            <div className="rv-note rv-fix">
              <span className="tag tag-warn">{QUESTION_TEXT[fb.type]}</span>
              <span>Nên hỏi: “{fb.rewrite}”</span>
              <Link href={`/principles#${fb.principleId}`} className="small">Vì sao?</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
