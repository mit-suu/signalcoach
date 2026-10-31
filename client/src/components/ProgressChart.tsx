"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { SessionSummary } from "@/types/api";
import { buildProgress, type MistakeType, type ProgressSlot } from "@/lib/progress";
import { CLUE_EXPLAINER, QUESTION_TEXT, fmtDate } from "@/lib/labels";

/** One categorical colour per mistake type, from the design tokens; order follows MISTAKE_TYPES. */
const MISTAKE_COLOR: Record<MistakeType, string> = {
  leading: "var(--cat-1)",
  closed: "var(--cat-2)",
  vague: "var(--cat-3)",
  double: "var(--cat-4)",
  future: "var(--cat-5)",
  bare_why: "var(--cat-6)",
  over_talking: "var(--cat-7)",
};

const DIR = {
  down: { arrow: "↓", text: "giảm", cls: "pg-better" },
  up: { arrow: "↑", text: "tăng", cls: "pg-worse" },
  same: { arrow: "=", text: "không đổi", cls: "" },
} as const;

const ratePct = (r: number) => `${Math.round(r * 100)}%`;
const mistakeList = (s: ProgressSlot) =>
  s.segments.length ? s.segments.map((x) => `${QUESTION_TEXT[x.type]}: ${x.count}`).join(", ") : "không có câu nào cần sửa";
const pointTitle = (s: ProgressSlot) => `${fmtDate(s.startedAt)} · ${s.guideTitle}: ${s.pct === null ? s.reason : `${s.pct} điểm`}`;
const barTitle = (s: ProgressSlot) => `${fmtDate(s.startedAt)} · ${s.guideTitle}: ${s.total} câu nên hỏi khác (${mistakeList(s)})`;

/**
 * S10 progress section: score over time (line) above question mistakes per session (stacked bars),
 * sharing one x scale (slot = position in the window), plus a per-type trend summary.
 * The chart links are mouse shortcuts; the sessions table below carries the same links for keyboard
 * and screen-reader users, so the charts are exposed as figures with text summaries.
 */
export function ProgressChart({ sessions }: { sessions: SessionSummary[] }) {
  const p = useMemo(() => buildProgress(sessions), [sessions]);
  const n = p.slots.length;

  if (n === 0) {
    return (
      <div className="progress">
        <h2>Điểm qua từng buổi</h2>
        <p className="small">{p.hint}</p>
      </div>
    );
  }

  const x = (slot: number) => ((slot + 0.5) / n) * 100;
  const lastScored = p.points.at(-1)?.slot;
  const lineLabel = `Điểm qua từng buổi, ${p.caption}: ${p.slots.map((s) => `${fmtDate(s.startedAt)} ${s.pct === null ? s.reason : `${s.pct} điểm`}`).join("; ")}`;
  const barsLabel = `Số câu nên hỏi khác mỗi buổi: ${p.slots.map((s) => `${fmtDate(s.startedAt)} ${s.total}${s.total ? ` (${mistakeList(s)})` : ""}`).join("; ")}`;
  const unscored = p.slots.filter((s) => s.reason);

  return (
    <div className="progress">
      <div className="split">
        <h2>Điểm qua từng buổi</h2>
        <span className="small">{p.caption}</span>
      </div>
      <p className="small">Điểm cho biết bạn tìm được bao nhiêu manh mối và hỏi sâu tới đâu. {CLUE_EXPLAINER}</p>

      {/* Score line, 0–100 % */}
      <div className="pg-chart pg-chart-line">
        <div className="pg-y muted" aria-hidden>
          <span style={{ bottom: "100%" }}>100</span>
          <span style={{ bottom: "50%" }}>50</span>
          <span style={{ bottom: "0%" }}>0</span>
        </div>
        <div className="pg-plot pg-line" role="figure" aria-label={lineLabel}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {[0, 50, 100].map((g) => (
              <line key={g} x1="0" x2="100" y1={100 - g} y2={100 - g} className="pg-grid" vectorEffect="non-scaling-stroke" />
            ))}
            {p.points.length > 1 && (
              <polyline points={p.points.map((pt) => `${x(pt.slot)},${100 - pt.pct}`).join(" ")} className="pg-path" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {p.slots.map((s, i) =>
            s.pct === null ? (
              <Link key={s.id} href={s.href} tabIndex={-1} className="pg-pt pg-pt-none" style={{ left: `${x(i)}%`, bottom: 0 }} title={pointTitle(s)}>
                <span className="pg-pt-dot" />
              </Link>
            ) : (
              <Link key={s.id} href={s.href} tabIndex={-1} className="pg-pt" data-last={i === lastScored || undefined} data-d={s.labelDesktop || undefined} data-m={s.labelMobile || undefined} style={{ left: `${x(i)}%`, bottom: `${s.pct}%` }} title={pointTitle(s)}>
                <span className="pg-pt-dot" />
                <span className="pg-pt-val">{s.pct}</span>
              </Link>
            ),
          )}
        </div>
      </div>

      {/* Question mistakes per session, stacked by type */}
      {unscored.length > 0 && (
        <ul className="pg-unscored">
          {unscored.map((s) => (
            <li key={s.id}>
              <span className="pg-hollow" aria-hidden />
              <span><Link href={s.href}>{fmtDate(s.startedAt)}</Link>{`: ${s.reason}`}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="pg-sub">Số câu nên hỏi khác mỗi buổi</h3>
      <div className="pg-chart">
        <div className="pg-y" aria-hidden />
        <div className="pg-plot pg-bars" role="figure" aria-label={barsLabel} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {p.slots.map((s) => (
            <Link key={s.id} href={s.href} tabIndex={-1} className="pg-bar-col" title={barTitle(s)}>
              <span className="pg-bar-total">{s.total}</span>
              <span className="pg-stack" style={{ height: `calc((100% - 14px) * ${s.total / p.maxMistakes})` }}>
                {s.segments.map((seg) => (
                  <span key={seg.type} className="pg-seg" style={{ flexGrow: seg.count, background: MISTAKE_COLOR[seg.type] }} />
                ))}
              </span>
            </Link>
          ))}
        </div>
      </div>
      <div className="pg-chart" aria-hidden>
        <div className="pg-y" />
        <div className="pg-x muted" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {p.slots.map((s) => (
            <span key={s.id} className="pg-xl" data-d={s.labelDesktop || undefined} data-m={s.labelMobile || undefined}>
              {fmtDate(s.startedAt)}
            </span>
          ))}
        </div>
      </div>

      {p.usedTypes.length > 0 && (
        <ul className="pg-legend">
          {p.usedTypes.map((t) => (
            <li key={t}>
              <span className="pg-swatch" style={{ background: MISTAKE_COLOR[t] }} aria-hidden />
              {QUESTION_TEXT[t]}
            </li>
          ))}
        </ul>
      )}

      {p.hint && <p className="small pg-hint">{p.hint}</p>}

      {p.trend && (
        <div className="pg-trend">
          <h3 className="pg-sub">Tỉ lệ câu hỏi mắc từng lỗi: 3 buổi gần nhất so với trước đó</h3>
          {p.trend.length === 0 ? (
            <p className="small">Các buổi này không có câu nào cần sửa.</p>
          ) : (
            <ul>
              {p.trend.map((r) => {
                const d = DIR[r.dir];
                return (
                  <li key={r.type}>
                    <span className="pg-swatch" style={{ background: MISTAKE_COLOR[r.type] }} aria-hidden />
                    <span className="pg-trend-name">{QUESTION_TEXT[r.type]}</span>
                    <span className="muted">{ratePct(r.earlierRate)} → {ratePct(r.recentRate)}</span>
                    <span className={`pg-dir ${d.cls}`} title={d.text}>
                      <span aria-hidden>{d.arrow}</span> {d.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
