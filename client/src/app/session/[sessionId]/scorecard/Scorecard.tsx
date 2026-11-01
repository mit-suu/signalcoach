"use client";

import { LoadingState } from "@/components/LoadingState";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { ScorecardSignal, SessionView, SignalStatus } from "@/types/api";
import { ArrowRight } from "@/components/BrandMark";
import { buildFixes, MAX_FIXES, type Fix } from "@/lib/fixes";
import { CLUE_EXPLAINER, QUESTION_TEXT, SIGNAL_TEXT, fmtDate, pct, plain, shortName, turnNo } from "@/lib/labels";

/** Ring colours, in the order the ring is drawn. */
const RING: [SignalStatus, string][] = [
  ["caught", "var(--ok)"],
  ["partial", "var(--part)"],
  ["missed", "var(--miss)"],
  ["unsure", "#C9BBA6"],
];

/**
 * Scorecard, ordered so the first 10 seconds say what to do differently next time:
 * head (clues found + ring) → "3 điều cần sửa" (asked → why → better) → collapsible clue list →
 * next-session call to action.
 */
export function Scorecard({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [againError, setAgainError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    api
      .session(sessionId)
      .then((s) => {
        if (s.status === "active") router.replace(`/session/${sessionId}`);
        else setSession(s);
      })
      .catch((e: ApiError) => setError(e));
  }, [sessionId, router]);

  const fixes = useMemo(() => (session?.scorecard ? buildFixes(session.scorecard, session.turns, session.persona.name) : []), [session]);

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

  // A failed restart keeps the scorecard on screen; the error shows next to the button.
  async function again() {
    setStarting(true);
    setAgainError(null);
    try {
      const s = await api.createSession(session!.guideId);
      router.push(`/session/${s.id}`);
    } catch (e) {
      setAgainError(`Chưa bắt đầu được buổi mới. ${(e as Error).message}`);
      setStarting(false);
    }
  }

  if (error) {
    return (
      <div className="wrap state-msg">
        <h2>Không mở được bảng đánh giá</h2>
        <p className="muted">{error.message}</p>
        <Link href="/history" className="btn btn-secondary">Về lịch sử</Link>
      </div>
    );
  }
  if (!session) return <LoadingState label="Đang tải bảng đánh giá của bạn…" />;

  const name = shortName(session.persona.name);
  const meta = `${session.guideTitle} · với ${name} · ${fmtDate(session.startedAt)} · ${session.questionCount} câu hỏi`;

  // Too short to score
  if (session.status === "insufficient") {
    return (
      <div className="wrap page page-narrow">
        <div className="card card-pop stack">
          <p className="eyebrow">{meta}</p>
          <h1>Buổi này ngắn quá để chấm điểm</h1>
          <p className="lead">Hãy hỏi ít nhất {session.minQuestionsToScore} câu để có đủ điều để góp ý. Buổi này bạn hỏi {session.questionCount} câu.</p>
          <div className="cta">
            <button className="btn btn-primary" onClick={again} disabled={starting}>Phỏng vấn lại {name} <ArrowRight /></button>
            <Link href="/" className="btn btn-secondary">Chọn người khác</Link>
          </div>
          {againError && <p className="error-inline" role="alert">{againError}</p>}
        </div>
      </div>
    );
  }

  // Review failed; the conversation is safe
  if (!session.scorecard) {
    return (
      <div className="wrap page page-narrow">
        <div className="card stack">
          <p className="eyebrow">{meta}</p>
          <h2>Chưa tạo được bảng đánh giá</h2>
          <p className="muted">{session.scorecardError ?? "Cuộc trò chuyện của bạn vẫn được lưu."} Bấm thử lại sau ít phút.</p>
          <div className="cta">
            <button className="btn btn-primary" onClick={retry} disabled={retrying}>{retrying ? "Đang đọc lại…" : "Thử lại"}</button>
            <Link href={`/session/${sessionId}/review`} className="btn btn-secondary">Xem lại cuộc trò chuyện</Link>
          </div>
        </div>
      </div>
    );
  }

  const sc = session.scorecard;
  const complete = session.status === "complete";
  const total = sc.counts.total || sc.signals.length;
  const found = sc.counts.caught;
  const score = pct(sc.score);
  const [focus, ...moreFocus] = sc.focus;
  const shownTurns = new Set(fixes.filter((x) => x.source === "feedback").map((x) => x.turnIndex));
  const restFeedback = [...sc.feedback].sort((a, b) => b.impact - a.impact).filter((f) => !shownTurns.has(f.turnIndex));

  const stops = ringStops(sc.counts, total);

  return (
    <div className="wrap score">
      <section className="score-head">
        <div>
          <p className="eyebrow">{meta}</p>
          <h1>
            Bạn tìm được <span className="big">{found}</span>/{total} manh mối
          </h1>
          {sc.summary && <p className="lead">{plain(sc.summary, name)}</p>}
          {!complete && <p className="small">Buổi kết thúc sớm nên chưa chấm điểm. {name} còn vài chuyện chưa kịp kể.</p>}
        </div>
        <div className="score-viz">
          <div className="ring" style={{ background: `radial-gradient(closest-side, var(--surface) 72%, transparent 73%), conic-gradient(${stops.join(", ")})` }} role="img" aria-label={`Tìm được ${found} trên ${total} manh mối`}>
            <span>{found}/{total}</span>
          </div>
          <ul className="ring-legend">
            {(["caught", "partial", "missed", "unsure", "not_surfaced"] as const)
              .filter((k) => sc.counts[k] > 0)
              .map((k) => (
                <li key={k}><span className={`dot dot-${k}`} />{SIGNAL_TEXT[k]}: {sc.counts[k]}</li>
              ))}
          </ul>
          {complete && score !== null && <p className="small">Điểm buổi này: <b>{score}/100</b></p>}
        </div>
      </section>

      <section aria-labelledby="fixes-title">
        <h2 id="fixes-title">{fixes.length > 1 ? `${fixes.length} điều cần sửa ở buổi sau` : "Điều cần sửa ở buổi sau"}</h2>
        {fixes.length === 0 ? (
          <div className="card fix-none">
            <b>Không có lỗi lớn nào.</b>
            <p className="muted">Các câu hỏi của bạn đều mở và bám theo câu chuyện. Buổi sau cứ giữ cách hỏi này.</p>
          </div>
        ) : (
          <ol className="fixes">
            {fixes.map((f, i) => (
              <FixCard key={f.key} f={f} n={i + 1} sessionId={sessionId} />
            ))}
          </ol>
        )}
        {restFeedback.length > 0 && (
          <div className="more-fixes">
            <button className="btn-link" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
              {showMore ? "Ẩn bớt" : `Xem thêm ${restFeedback.length} câu nên hỏi khác đi`}
            </button>
            {showMore && (
              <ul className="more-list">
                {restFeedback.map((f) => (
                  <li key={f.turnIndex}>
                    <span className="tag tag-neutral">{QUESTION_TEXT[f.type]}</span>
                    <div>
                      <p className="asked-line">
                        <Link href={`/session/${sessionId}/review#t${f.turnIndex}`}>{turnNo(f.turnIndex)}</Link> “{f.original}”
                      </p>
                      <p className="better-line"><ArrowRight size={14} /> “{f.rewrite}”</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {fixes.length < MAX_FIXES && fixes.length > 0 && <p className="small">Chỉ có {fixes.length} điều đáng sửa trong buổi này.</p>}
      </section>

      <details className="clues">
        <summary>
          <span className="sum-title">{total} manh mối trong buổi này</span>
          <span className="small">Bấm để xem từng manh mối</span>
        </summary>
        <p className="explain-line clue-explainer">{CLUE_EXPLAINER}</p>
        <ul>
          {sc.signals.map((s) => (
            <ClueRow key={s.signalId} s={s} sessionId={sessionId} name={name} />
          ))}
        </ul>
      </details>

      <section className="next">
        <div>
          <p className="eyebrow">Buổi sau</p>
          <h2>{focus ? plain(focus.skill, name) : "Luyện lại với trọng tâm này"}</h2>
          <p>{focus ? plain(focus.why, name) : `Phỏng vấn lại ${name} và thử sửa những điều ở trên.`} Nếu bật gợi ý trong buổi, SignalCoach sẽ nhắc bạn mỗi khi {name} nhắc thoáng qua một chi tiết.</p>
          {moreFocus.length > 0 && (
            <ul className="next-focus">
              {moreFocus.map((f) => (
                <li key={f.skill}>
                  <b>{plain(f.skill, name)}</b> {plain(f.why, name)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cta">
          <button className="btn btn-primary" onClick={again} disabled={starting}>
            {starting ? "Đang chuẩn bị…" : `Phỏng vấn lại ${name}`} <ArrowRight />
          </button>
          <Link href={`/session/${sessionId}/review`} className="btn btn-ghost">Xem lại toàn bộ cuộc trò chuyện</Link>
          <Link href="/#chon-nguoi" className="btn btn-ghost">Chọn người khác</Link>
        </div>
        {againError && <p className="error-inline error-inline-dark" role="alert">{againError}</p>}
      </section>
    </div>
  );
}

/** conic-gradient stops for the ring: found, half-found, missed, unsure, then the empty track. */
function ringStops(counts: Record<string, number>, total: number): string[] {
  const stops: string[] = [];
  let at = 0;
  for (const [k, color] of RING) {
    const n = counts[k] ?? 0;
    if (!n || !total) continue;
    stops.push(`${color} ${at}% ${at + (n / total) * 100}%`);
    at += (n / total) * 100;
  }
  stops.push(`var(--track) ${at}% 100%`);
  return stops;
}

function FixCard({ f, n, sessionId }: { f: Fix; n: number; sessionId: string }) {
  return (
    <li className="fix">
      <h3>
        <span className="num">{n}</span>
        {f.title}
      </h3>
      <dl>
        <div className="asked">
          <dt>
            {f.turnIndex !== null ? (
              <>Bạn đã hỏi <Link href={`/session/${sessionId}/review#t${f.turnIndex}`}>{turnNo(f.turnIndex)}</Link></>
            ) : (
              "Bạn đã hỏi"
            )}
          </dt>
          <dd>{f.asked ? `“${f.asked}”` : "Bạn chưa hỏi lại câu nào."}</dd>
        </div>
        <div className="why">
          <dt>Vì sao chưa tốt</dt>
          <dd>{f.why}</dd>
        </div>
        <div className="better">
          <dt>Nên hỏi</dt>
          <dd>“{f.better}”</dd>
        </div>
      </dl>
      {f.principleId && f.principleName && (
        <Link href={`/principles#${f.principleId}`} className="fix-principle">Đọc thêm: {f.principleName}</Link>
      )}
    </li>
  );
}

function ClueRow({ s, sessionId, name }: { s: ScorecardSignal; sessionId: string; name: string }) {
  const at = (n: number | null) => (n === null ? null : <Link href={`/session/${sessionId}/review#t${n}`}>{turnNo(n)}</Link>);
  let detail: React.ReactNode;
  switch (s.status) {
    case "caught":
      detail = <>Bạn hỏi sâu ở {at(s.evidenceTurn) ?? "một câu sau đó"}</>;
      break;
    case "partial":
      detail = <>Bạn chạm tới ở {at(s.evidenceTurn) ?? "một câu sau đó"} rồi chuyển chuyện</>;
      break;
    case "missed":
      detail = <>{name} nhắc ở {at(s.surfacedTurn) ?? "một lượt"}, bạn không hỏi lại</>;
      break;
    case "unsure":
      detail = <>Chưa rõ bạn có hỏi tới không, nên không tính điểm</>;
      break;
    default:
      detail = <>Cần thêm vài câu hỏi để {name} kể tới chuyện này</>;
  }
  return (
    <li>
      <span className={`chip chip-${s.status}`}>{SIGNAL_TEXT[s.status]}</span>
      <div className="clue-main">
        <b>{s.label}</b>
        {s.personaQuote && s.status !== "not_surfaced" && <p className="clue-quote">{name}: “{s.personaQuote}”</p>}
        {(s.status === "caught" || s.status === "partial") && s.evidenceQuote && <p className="clue-quote">Bạn: “{s.evidenceQuote}”</p>}
        {s.status === "unsure" && s.note && <p className="clue-quote">{plain(s.note, name)}</p>}
        {s.suggestedQuestion && s.status !== "caught" && <p className="clue-suggest">Có thể hỏi: “{s.suggestedQuestion}”</p>}
      </div>
      <span className="small">{detail}</span>
    </li>
  );
}
