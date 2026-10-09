"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { SessionView, Turn } from "@/types/api";
import { ACTION_TEXT, QUESTION_TEXT, SIGNAL_TEXT, STATUS_TEXT, fmtDate, fmtTime, pct, shortName } from "@/lib/labels";

type Filter = "all" | "signals" | "rewrite";

/**
 * S13 — the whole conversation after a session, with the signal verdicts, the question-quality
 * tags and (toggle) the agent's per-turn decision, reason and tool calls — the "explain the agent"
 * view for the demo.
 */
export function TranscriptReview({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showAgent, setShowAgent] = useState(false);
  const [showChecks, setShowChecks] = useState(false);

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

  if (error) return <div className="error-banner">{error.message}</div>;
  if (!session) return <div className="state-msg muted">Đang tải hội thoại…</div>;

  const personaShort = shortName(session.persona.name);
  const visible = session.turns.filter((t) => {
    if (filter === "signals") return Boolean(t.signalId) || (t.role === "user" && session.scorecard?.signals.some((s) => s.evidenceTurn === t.index));
    if (filter === "rewrite") return byFeedback.has(t.index);
    return true;
  });
  const notSurfaced = session.scorecard?.signals.filter((s) => s.status === "not_surfaced") ?? [];

  return (
    <div className="review">
      <div className="section">
        <Link href={`/session/${sessionId}/scorecard`} className="muted back-link">← Bảng đánh giá</Link>
        <div className="sc-row-head" style={{ marginTop: 12 }}>
          <div>
            <div className="card-kicker">{session.guideContext}</div>
            <h2 style={{ margin: "6px 0 0" }}>{session.guideTitle} · với {personaShort}</h2>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="muted" style={{ fontSize: 13 }}>{fmtDate(session.startedAt)} · {fmtTime(session.startedAt)} · {session.questionCount} câu hỏi</div>
            <span className="tag tag-accent">{STATUS_TEXT[session.status]}{session.score !== null ? ` · ${pct(session.score)}%` : ""}</span>
          </div>
        </div>
      </div>

      <div className="section review-bar">
        <div className="seg" role="tablist">
          {(["all", "signals", "rewrite"] as Filter[]).map((f) => (
            <label key={f} className="seg-opt">
              <input type="radio" name="filter" checked={filter === f} onChange={() => setFilter(f)} />
              {f === "all" ? "Tất cả" : f === "signals" ? "Chỉ tín hiệu" : "Chỉ câu cần viết lại"}
            </label>
          ))}
        </div>
        <label className="switch">
          <input type="checkbox" checked={showAgent} onChange={(e) => setShowAgent(e.target.checked)} />
          <span className="switch-track"><span className="switch-thumb" /></span>
          Hiện quyết định của agent
        </label>
      </div>

      <div className="review-list">
        {visible.map((t) => (
          <TurnRow key={t.index} t={t} session={session} personaShort={personaShort} showAgent={showAgent} bySignal={bySignal} byFeedback={byFeedback} />
        ))}
        {visible.length === 0 && <div className="state-msg muted">Không có lượt nào khớp bộ lọc.</div>}
      </div>

      {notSurfaced.length > 0 && (
        <div className="section">
          <h4 style={{ margin: 0 }}>Chưa xuất hiện</h4>
          <p className="muted">{personaShort} còn giữ những điều này.</p>
          <div className="signal-dots" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
            {notSurfaced.map((s) => (
              <span key={s.signalId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="dot dot-not_surfaced" /> {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {session.selfCheckLog.length > 0 && (
        <div className="section">
          <button className="btn btn-ghost" onClick={() => setShowChecks((v) => !v)}>
            {showChecks ? "Ẩn" : "Hiện"} nhật ký tự kiểm tra ({session.selfCheckLog.length})
          </button>
          {showChecks && (
            <table className="table" style={{ marginTop: 12 }}>
              <thead>
                <tr><th>Mục</th><th>Kiểm tra</th><th>Trước</th><th>Sau</th></tr>
              </thead>
              <tbody>
                {session.selfCheckLog.map((e, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap" }}>{e.target}</td>
                    <td>{e.check}</td>
                    <td className="muted">{e.before}</td>
                    <td>{e.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function TurnRow({
  t,
  session,
  personaShort,
  showAgent,
  bySignal,
  byFeedback,
}: {
  t: Turn;
  session: SessionView;
  personaShort: string;
  showAgent: boolean;
  bySignal: Map<string, NonNullable<SessionView["scorecard"]>["signals"][number]>;
  byFeedback: Map<number, NonNullable<SessionView["scorecard"]>["feedback"][number]>;
}) {
  const signal = t.signalId ? bySignal.get(t.signalId) : undefined;
  const planted = Boolean(t.signalId) && t.layerDepth === 1;
  const deeper = Boolean(t.signalId) && (t.layerDepth ?? 0) > 1;
  const caughtHere = session.scorecard?.signals.filter((s) => s.evidenceTurn === t.index) ?? [];
  const fb = byFeedback.get(t.index);
  const breakAttempt = t.flags?.includes("break_attempt");

  return (
    <div id={`t${t.index}`} className={`rv-turn ${t.role}`}>
      <div className="turn-who">
        <b>{t.role === "user" ? "Bạn" : personaShort}</b>
        <span className="muted">#{String(t.index).padStart(2, "0")}</span>
      </div>
      <div>
        <p>{t.text}</p>
        {showAgent && t.role === "user" && t.questionType && (
          <div className="rv-agent">
            <span className="tag tag-neutral">{QUESTION_TEXT[t.questionType]}</span>
            <span className="muted">{t.judgeNote}</span>
          </div>
        )}
        {showAgent && t.role === "persona" && t.decision && (
          <div className="rv-agent">
            <span className="tag tag-outline">{ACTION_TEXT[t.decision.action]}</span>
            <span className="muted">{t.decision.reason}</span>
            {t.toolCalls && t.toolCalls.length > 0 && (
              <code className="rv-tools">
                {t.toolCalls.map((c, i) => (
                  <span key={i}>
                    {c.name}({Object.entries(c.args).map(([k, v]) => `${k}=${String(v)}`).join(", ")})
                  </span>
                ))}
              </code>
            )}
          </div>
        )}
      </div>
      <div className="rv-side">
        {signal && (planted || deeper) && (
          <div className="rv-sig">
            <span className={`dot dot-${signal.status}`} />
            <div>
              <strong>{signal.label}</strong>
              <div className="muted" style={{ fontSize: 12 }}>{planted ? SIGNAL_TEXT[signal.status] : `kể sâu hơn · lớp ${t.layerDepth}`}</div>
            </div>
          </div>
        )}
        {caughtHere.map((s) => (
          <div key={s.signalId} className="rv-note">
            ↳ {s.status === "caught" ? "bắt được" : s.status === "partial" ? "chạm một phần" : "bằng chứng"}: {s.label}
          </div>
        ))}
        {breakAttempt && <div className="rv-note muted">cố phá vai · persona giữ vai</div>}
        {fb && (
          <Link href={`/principles#${fb.principleId}`} className="rv-fb">
            <span className="tag tag-outline">{QUESTION_TEXT[fb.type]}</span>
            <span><span className="muted">{fb.principleId}</span> {fb.principleName}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
