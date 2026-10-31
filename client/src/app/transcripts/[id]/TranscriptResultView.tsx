"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { ScorecardFeedback, TranscriptAnalysis, TranscriptSignal } from "@/types/api";
import { ArrowRight } from "@/components/BrandMark";
import { Dialog } from "@/components/Dialog";
import { CLUE_EXPLAINER, FIX_TITLE, KIND_TEXT, QUESTION_TEXT, QUESTION_WHY, SIGNAL_TEXT, fmtDate, fmtTime, plain, turnNo } from "@/lib/labels";

/**
 * Result of scoring a real interview: clues found / missed, what to ask differently (asked → why →
 * better), the dialogue with #turn anchors, and the self-check log behind "Chi tiết kỹ thuật".
 * Counts only — no score.
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
      <div className="wrap state-msg">
        <h2>Không mở được kết quả này</h2>
        <p className="muted">{error.status === 404 ? "Kết quả không còn hoặc đã bị xoá." : error.message}</p>
        <Link href="/history" className="btn btn-secondary">Về lịch sử</Link>
      </div>
    );
  }
  if (!analysis) return <div className="wrap state-msg muted">Đang tải kết quả…</div>;

  const { result, turns, me } = analysis;
  const myQuestions = turns.filter((t) => t.speaker === me).length;
  const fixes = [...result.feedback].sort((a, b) => b.impact - a.impact);
  const top = fixes.slice(0, 3);
  const rest = fixes.slice(3);

  return (
    <div className="wrap score transcript-result">
      <section className="score-head">
        <div>
          <p className="eyebrow">Buổi phỏng vấn thật · bạn là {me} · {fmtDate(analysis.createdAt)} {fmtTime(analysis.createdAt)}</p>
          <h1 className="break">{analysis.title}</h1>
          {result.summary && <p className="lead">{plain(result.summary)}</p>}
          <p className="small">{turns.length} lượt nói · {myQuestions} lượt của bạn</p>
        </div>
        <div className="score-viz">
          <div className="ring ring-plain" role="img" aria-label={`Tìm được ${result.counts.caught} trên ${result.counts.total} manh mối`}>
            <span>{result.counts.caught}/{result.counts.total}</span>
          </div>
          <p className="small">
            {result.counts.total > 0
              ? `Tìm được ${result.counts.caught} · hỏi chưa tới ${result.counts.partial} · bỏ lỡ ${result.counts.missed}`
              : "Không thấy manh mối nào đáng hỏi sâu."}
          </p>
        </div>
      </section>

      <section aria-labelledby="fixes-title">
        <h2 id="fixes-title">{top.length > 1 ? `${top.length} điều cần sửa ở buổi sau` : "Điều cần sửa ở buổi sau"}</h2>
        {top.length === 0 ? (
          <div className="card fix-none">
            <b>Không có lỗi lớn nào.</b>
            <p className="muted">Các câu hỏi của bạn đều mở và bám theo câu chuyện.</p>
          </div>
        ) : (
          <ol className="fixes">
            {top.map((f, i) => (
              <FixItem key={f.turnIndex} f={f} n={i + 1} />
            ))}
          </ol>
        )}
        {rest.length > 0 && (
          <details className="more-fixes">
            <summary className="btn-link">Xem thêm {rest.length} câu nên hỏi khác đi</summary>
            <ul className="more-list">
              {rest.map((f) => (
                <li key={f.turnIndex}>
                  <span className="tag tag-neutral">{QUESTION_TEXT[f.type]}</span>
                  <div>
                    <p className="asked-line"><TurnLink n={f.turnIndex} /> “{f.original}”</p>
                    <p className="better-line"><ArrowRight size={14} /> “{f.rewrite}”</p>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {result.signals.length > 0 && (
        <details className="clues" open>
          <summary>
            <span className="sum-title">{result.signals.length} manh mối trong buổi này</span>
            <span className="small">Bấm để thu gọn</span>
          </summary>
          <p className="explain-line clue-explainer">{CLUE_EXPLAINER}</p>
          <ul>
            {result.signals.map((s, i) => (
              <ClueRow key={`${s.turnIndex}-${i}`} s={s} />
            ))}
          </ul>
        </details>
      )}

      <section className="card dialogue">
        <h2>Lời thoại</h2>
        <div className="review-list">
          {turns.map((t) => {
            const mine = t.speaker === me;
            const sigs = signalsByTurn.get(t.index) ?? [];
            const fu = followUps.get(t.index) ?? [];
            const fb = feedbackByTurn.get(t.index);
            return (
              <div key={t.index} id={`t${t.index}`} className={`rv-turn${mine ? " user" : ""}`}>
                <div className="rv-who">
                  <b className="break">{t.speaker}</b>
                  <span className="muted">{turnNo(t.index)}</span>
                </div>
                <div className="rv-body">
                  <p className="rv-text">{t.text}</p>
                </div>
                {(sigs.length > 0 || fu.length > 0 || fb) && (
                  <div className="rv-side">
                    {sigs.map((s, i) => (
                      <div key={`s${i}`} className="rv-note">
                        <span className={`chip chip-${s.status}`}>{SIGNAL_TEXT[s.status]}</span>
                        <span>Manh mối: {s.label}</span>
                      </div>
                    ))}
                    {fu.map((s, i) => (
                      <div key={`f${i}`} className="rv-note muted">Hỏi tiếp manh mối ở {turnNo(s.turnIndex)}</div>
                    ))}
                    {fb && (
                      <div className="rv-note">
                        <span className="tag tag-warn">{QUESTION_TEXT[fb.type]}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {analysis.selfCheckLog.length > 0 && (
        <details className="tech">
          <summary>Chi tiết kỹ thuật</summary>
          <p className="small">SignalCoach đã tự đối chiếu kết quả với lời thoại và sửa {analysis.selfCheckLog.length} chỗ.</p>
          <ul className="selfcheck-list">
            {analysis.selfCheckLog.map((l, i) => (
              <li key={i}>
                <code>{l.target}</code> {l.check}: <span className="muted">{l.before}</span> → {l.after}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="cta result-actions">
        <Link href="/transcripts/new" className="btn btn-primary">Chấm thêm một buổi <ArrowRight size={16} /></Link>
        <Link href="/history" className="btn btn-secondary">Lịch sử</Link>
        <button className="btn-link" onClick={() => setConfirmDelete(true)}>Xoá kết quả này</button>
      </div>

      {confirmDelete && (
        <Dialog title={`Xoá “${analysis.title}”?`} confirmLabel="Xoá" onConfirm={remove} onCancel={() => setConfirmDelete(false)} busy={busy} danger>
          Lời thoại và kết quả chấm sẽ bị xoá. Không thể khôi phục.
        </Dialog>
      )}
    </div>
  );
}

/** In-page link to a turn: scrolls to it and highlights it. */
function TurnLink({ n }: { n: number }) {
  return (
    <a
      href={`#t${n}`}
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
      {turnNo(n)}
    </a>
  );
}

function FixItem({ f, n }: { f: ScorecardFeedback; n: number }) {
  return (
    <li className="fix">
      <h3>
        <span className="num">{n}</span>
        {FIX_TITLE[f.type]}
      </h3>
      <dl>
        <div className="asked">
          <dt>Bạn đã hỏi <TurnLink n={f.turnIndex} /></dt>
          <dd>“{f.original}”</dd>
        </div>
        <div className="why">
          <dt>Vì sao chưa tốt</dt>
          <dd>{QUESTION_WHY[f.type]}</dd>
        </div>
        <div className="better">
          <dt>Nên hỏi</dt>
          <dd>“{f.rewrite}”</dd>
        </div>
      </dl>
      <Link href={`/principles#${f.principleId}`} className="fix-principle">Đọc thêm: {plain(f.principleName)}</Link>
    </li>
  );
}

function ClueRow({ s }: { s: TranscriptSignal }) {
  return (
    <li>
      <span className={`chip chip-${s.status}`}>{SIGNAL_TEXT[s.status]}</span>
      <div className="clue-main">
        <b>{s.label}</b> <span className="small">· {KIND_TEXT[s.kind]}</span>
        <p className="clue-quote">“{s.quote}” <TurnLink n={s.turnIndex} /></p>
        {s.followUpTurn !== null && s.followUpQuote && (
          <p className="clue-quote">Bạn hỏi tiếp: <TurnLink n={s.followUpTurn} /> “{s.followUpQuote}”</p>
        )}
        {s.suggestedQuestion && s.status !== "caught" && <p className="clue-suggest">Có thể hỏi: “{s.suggestedQuestion}”</p>}
        {s.note && <p className="small">{plain(s.note)}</p>}
      </div>
    </li>
  );
}

function groupBy<T>(items: T[], key: (t: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), it]);
  return m;
}
