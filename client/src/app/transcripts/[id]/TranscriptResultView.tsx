"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { ScorecardFeedback, TranscriptAnalysis, TranscriptSignal } from "@/types/api";
import { ArrowRight } from "@/components/BrandMark";
import { Dialog } from "@/components/Dialog";
import { DotLegend, SignalDots } from "@/components/SignalDots";
import { KIND_TEXT, QUESTION_TEXT, SIGNAL_TEXT, fmtDate, fmtTime } from "@/lib/labels";

/**
 * Result of a transcript analysis: signals the interviewee dropped (caught / partial / missed, with
 * the verbatim quote, my follow-up and a suggested question), per-question feedback tied to a
 * principle, and the transcript itself with #turn anchors. Counts only — no score.
 */
export function TranscriptResultView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [analysis, setAnalysis] = useState<TranscriptAnalysis | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.transcript(id).then(setAnalysis).catch((e: ApiError) => setError(e));
  }, [id]);

  // Scroll to #tNN once loaded (deep links)
  useEffect(() => {
    if (!analysis || !window.location.hash) return;
    const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.classList.add("hl");
    }
  }, [analysis]);

  const signalsByTurn = useMemo(() => groupBy(analysis?.result.signals ?? [], (s) => s.turnIndex), [analysis]);
  const followUps = useMemo(() => groupBy((analysis?.result.signals ?? []).filter((s) => s.followUpTurn !== null), (s) => s.followUpTurn!), [analysis]);
  const feedbackByTurn = useMemo(() => new Map(analysis?.result.feedback.map((f) => [f.turnIndex, f]) ?? []), [analysis]);

  async function remove() {
    setBusy(true);
    try {
      await api.deleteTranscript(id);
      router.push("/history");
    } catch (e) {
      setError(e as ApiError);
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="state-msg">
        <h2>Không mở được bản phân tích</h2>
        <p className="muted">{error.status === 404 ? "Bản phân tích không tồn tại hoặc đã bị xoá." : error.message}</p>
        <Link href="/history" className="btn btn-secondary">Về lịch sử</Link>
      </div>
    );
  }
  if (!analysis) return <div className="state-msg muted">Đang tải phân tích…</div>;

  const { result, turns, me } = analysis;
  const myQuestions = turns.filter((t) => t.speaker === me).length;
  return (
    <div className="scorecard transcript-result">
      <div className="section grid-12 sc-head">
        <div style={{ gridColumn: "1 / span 7" }}>
          <div className="card-kicker">Phân tích bản ghi · bạn là {me}</div>
          <h1 style={{ margin: "6px 0 8px", overflowWrap: "anywhere" }}>{analysis.title}</h1>
          <div className="muted" style={{ fontSize: 13 }}>
            {fmtDate(analysis.createdAt)} · {fmtTime(analysis.createdAt)} · {turns.length} lượt · {myQuestions} lượt hỏi của bạn
          </div>
        </div>
        <div style={{ gridColumn: "9 / span 4", alignSelf: "end" }}>
          {result.signals.length > 0 ? (
            <>
              <SignalDots statuses={result.signals.map((s) => s.status)} labels={result.signals.map((s) => s.label)} size={22} />
              <DotLegend counts={result.counts} />
            </>
          ) : (
            <div className="muted">Không tìm thấy tín hiệu nào đáng hỏi sâu.</div>
          )}
        </div>
      </div>

      {result.summary && (
        <div className="section">
          <p style={{ margin: 0, fontSize: 16, maxWidth: 720 }}>{result.summary}</p>
        </div>
      )}

      <div className="section">
        <div className="sc-row-head">
          <h3 style={{ margin: 0 }}>Tín hiệu</h3>
          <span className="muted" style={{ fontSize: 13 }}>
            {result.counts.caught} bắt được · {result.counts.partial} một phần · {result.counts.missed} bỏ lỡ
          </span>
        </div>
        {result.signals.length > 0 && (
          <div className="sig-table">
            <div className="sig-head muted">
              <span />
              <span>Họ nói</span>
              <span>Bạn hỏi tiếp</span>
              <span>Có thể hỏi</span>
            </div>
            {result.signals.map((s, i) => (
              <SignalRow key={`${s.turnIndex}-${i}`} s={s} />
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <div className="sc-row-head">
          <h3 style={{ margin: 0 }}>Câu hỏi của bạn</h3>
          <span className="muted" style={{ fontSize: 13 }}>
            {result.feedback.length === 0 ? "Không có câu nào cần viết lại" : `${result.feedback.length} câu nên viết lại · sắp theo mức ảnh hưởng`}
          </span>
        </div>
        {result.feedback.map((f) => (
          <FeedbackRow key={f.turnIndex} f={f} />
        ))}
      </div>

      <div className="section" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <h3 className="transcript-head">Bản ghi</h3>
        <div className="review-list">
          {turns.map((t) => {
            const mine = t.speaker === me;
            const sigs = signalsByTurn.get(t.index) ?? [];
            const fu = followUps.get(t.index) ?? [];
            const fb = feedbackByTurn.get(t.index);
            return (
              <div key={t.index} id={`t${t.index}`} className={`rv-turn ${mine ? "user" : ""}`}>
                <div className="muted" style={{ fontSize: 13, overflowWrap: "anywhere" }}>
                  #{t.index} · <strong style={{ color: "var(--color-text)" }}>{t.speaker}</strong>
                </div>
                <p>{t.text}</p>
                <div className="rv-side">
                  {sigs.map((s, i) => (
                    <div key={`s${i}`} className="rv-sig">
                      <span className={`dot dot-${s.status}`} />
                      <span>{s.label} · {SIGNAL_TEXT[s.status]}</span>
                    </div>
                  ))}
                  {fu.map((s, i) => (
                    <div key={`f${i}`} className="rv-sig muted">
                      <span className={`dot dot-${s.status}`} />
                      <span>Hỏi tiếp #{s.turnIndex}</span>
                    </div>
                  ))}
                  {fb && (
                    <span className="rv-fb">
                      <span className="tag tag-neutral">{QUESTION_TEXT[fb.type]}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {analysis.selfCheckLog.length > 0 && (
        <div className="section">
          <details>
            <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>Tự kiểm tra: {analysis.selfCheckLog.length} điều chỉnh so với đề xuất của mô hình</summary>
            <ul className="selfcheck-list">
              {analysis.selfCheckLog.map((l, i) => (
                <li key={i}>
                  <code>{l.target}</code> {l.check}: <span className="muted">{l.before}</span> → {l.after}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      <div className="section" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/transcripts/new" className="btn btn-primary">Phân tích bản ghi khác <ArrowRight size={16} /></Link>
        <Link href="/history" className="btn btn-secondary">Lịch sử</Link>
        <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>Xoá bản phân tích</button>
      </div>

      {confirmDelete && (
        <Dialog title={`Xoá “${analysis.title}”?`} confirmLabel="Xoá" onConfirm={remove} onCancel={() => setConfirmDelete(false)} busy={busy} danger>
          Bản ghi và phân tích sẽ bị xoá. Không thể hoàn tác.
        </Dialog>
      )}
    </div>
  );
}

/** In-page link to a transcript turn: scrolls to it and highlights it. */
function TurnLink({ n }: { n: number }) {
  return (
    <a
      href={`#t${n}`}
      className="muted"
      onClick={(e) => {
        const el = document.getElementById(`t${n}`);
        if (!el) return;
        e.preventDefault();
        document.querySelectorAll(".rv-turn.hl").forEach((x) => x.classList.remove("hl"));
        el.classList.add("hl");
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        history.replaceState(null, "", `#t${n}`);
      }}
    >
      #{n}
    </a>
  );
}

function SignalRow({ s }: { s: TranscriptSignal }) {
  return (
    <div className={`sig-row sig-${s.status}`}>
      <span className={`dot dot-${s.status}`} />
      <div>
        <div className="sig-label">
          {s.label} <span className={`tag ${s.status === "caught" ? "tag-accent-2" : "tag-neutral"}`}>{SIGNAL_TEXT[s.status]}</span>
          <span className="tag tag-outline">{KIND_TEXT[s.kind]}</span>
        </div>
        <div className="sig-quote">“{s.quote}” <TurnLink n={s.turnIndex} /></div>
        {s.note && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{s.note}</div>}
      </div>
      <div className="sig-asked">
        {s.followUpTurn !== null && s.followUpQuote ? (
          <>
            <TurnLink n={s.followUpTurn} /> {s.followUpQuote}
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </div>
      <div className="sig-suggest">{s.suggestedQuestion ?? <span className="muted">—</span>}</div>
    </div>
  );
}

function FeedbackRow({ f }: { f: ScorecardFeedback }) {
  return (
    <div className="fb-row">
      <span className="tag tag-neutral">{QUESTION_TEXT[f.type]}</span>
      <div>
        <div className="fb-original">
          <TurnLink n={f.turnIndex} /> {f.original}
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

function groupBy<T>(items: T[], key: (t: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), it]);
  return m;
}
