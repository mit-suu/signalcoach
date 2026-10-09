"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { SessionSummary } from "@/types/api";
import { ArrowRight } from "@/components/BrandMark";
import { Dialog } from "@/components/Dialog";
import { SignalDots } from "@/components/SignalDots";
import { STATUS_TEXT, fmtDate, pct } from "@/lib/labels";

const CHART_N = 6;

/** S10/S11 — practice history (FR-11): score trend, current focus, sessions table, deletes with confirmation. */
export default function HistoryPage() {
  const [rows, setRows] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<SessionSummary | null>(null);
  const [deleteAll, setDeleteAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = () => api.sessions().then(setRows).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const ended = useMemo(() => (rows ?? []).filter((r) => r.status !== "active"), [rows]);
  const chart = useMemo(() => ended.slice(0, CHART_N).reverse(), [ended]);
  const scored = ended.filter((r) => r.score !== null);
  // Focus tracking: the latest scored session's first focus, and whether a later session on a new guide beat the earlier score.
  const latestFocus = ended.find((r) => r.focus.length)?.focus[0] ?? null;
  const improvedOnNew = scored.length >= 2 && scored[0]!.guideId !== scored[1]!.guideId && (scored[0]!.score ?? 0) > (scored[1]!.score ?? 0);

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.deleteSession(toDelete.id);
      setToast(`Đã xoá buổi ${fmtDate(toDelete.startedAt)}`);
      setToDelete(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteAll() {
    setBusy(true);
    try {
      const { deleted } = await api.deleteAllSessions();
      setToast(`Đã xoá ${deleted} buổi`);
      setDeleteAll(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!rows) return <div className="state-msg muted">Đang tải…</div>;

  if (rows.length === 0) {
    // S10a — empty history
    return (
      <div className="state-msg">
        <h6 className="muted">Khả năng bắt tín hiệu</h6>
        <h2>Chưa có buổi nào. Điểm của bạn sẽ hiện ở đây sau buổi đầu tiên.</h2>
        <Link href="/" className="btn btn-primary">Bắt đầu buổi đầu tiên <ArrowRight size={16} /></Link>
      </div>
    );
  }

  return (
    <>
      <div className="section grid-12 hist-top">
        <div style={{ gridColumn: "1 / span 7" }}>
          <div className="sc-row-head">
            <h2 style={{ margin: 0 }}>Khả năng bắt tín hiệu</h2>
            <span className="muted" style={{ fontSize: 13 }}>{chart.length === 1 ? "1 buổi" : `${chart.length} buổi gần nhất`}</span>
          </div>
          <div className="bars" role="img" aria-label="Điểm các buổi gần nhất">
            {chart.map((r) => {
              const p = pct(r.score);
              return (
                <Link key={r.id} href={`/session/${r.id}/scorecard`} className="bar-col" title={`${r.guideTitle} · ${fmtDate(r.startedAt)}`}>
                  <span className="bar-val">{p === null ? "—" : p}</span>
                  <span className="bar" style={{ height: `${Math.max(4, p ?? 4)}%` }} data-none={p === null || undefined} />
                  <span className="bar-label muted">{r.guideTitle.replace(/^App /, "")}</span>
                </Link>
              );
            })}
          </div>
          {chart.length === 1 && <div className="muted" style={{ fontSize: 13 }}>Thêm một buổi để thấy tiến bộ.</div>}
        </div>
        <div style={{ gridColumn: "9 / span 4" }} className="focus-box">
          <h6 className="muted" style={{ margin: 0 }}>Đang tập trung</h6>
          {latestFocus ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 18, margin: "6px 0 4px" }}>{latestFocus.skill}</div>
              <div className="muted" style={{ fontSize: 13 }}>{latestFocus.why}</div>
            </>
          ) : (
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Hoàn thành một buổi để nhận trọng tâm cho lần sau.</div>
          )}
          {improvedOnNew && <div className="tag tag-accent-2" style={{ marginTop: 10 }}>↑ Tiến bộ ở kịch bản mới</div>}
          <Link href="/" className="btn btn-primary" style={{ marginTop: 16, alignSelf: "flex-start" }}>Buổi mới <ArrowRight size={16} /></Link>
        </div>
      </div>

      <div className="section">
        <div className="sc-row-head">
          <h3 style={{ margin: 0 }}>Các buổi</h3>
          <button className="btn btn-ghost" onClick={() => setDeleteAll(true)}>Xoá lịch sử</button>
        </div>
        <table className="table hist-table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Kịch bản</th>
              <th>Điểm</th>
              <th>Tín hiệu</th>
              <th>Trọng tâm từ buổi này</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.startedAt)}</td>
                <td>
                  <Link href={r.status === "active" ? `/session/${r.id}` : `/session/${r.id}/scorecard`} style={{ color: "inherit" }}>
                    <strong>{r.guideTitle}</strong>
                  </Link>
                  <span className="muted"> · {r.personaName}</span>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{r.score !== null ? `${pct(r.score)}%` : STATUS_TEXT[r.status]}</td>
                <td>
                  {r.counts ? (
                    <SignalDots
                      size={10}
                      statuses={[
                        ...Array<"caught">(r.counts.caught).fill("caught"),
                        ...Array<"partial">(r.counts.partial).fill("partial"),
                        ...Array<"missed">(r.counts.missed).fill("missed"),
                        ...Array<"unsure">(r.counts.unsure).fill("unsure"),
                        ...Array<"not_surfaced">(r.counts.not_surfaced).fill("not_surfaced"),
                      ]}
                    />
                  ) : (
                    <span className="muted">{r.questionCount} câu hỏi</span>
                  )}
                </td>
                <td className="muted">{r.focus[0]?.skill ?? "—"}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn btn-icon" aria-label="Xoá buổi" title="Xoá buổi" onClick={() => setToDelete(r)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {toDelete && (
        <Dialog title={`Xoá buổi ${fmtDate(toDelete.startedAt)} · ${toDelete.guideTitle}?`} confirmLabel="Xoá" onConfirm={confirmDelete} onCancel={() => setToDelete(null)} busy={busy} danger>
          Hội thoại và bảng đánh giá của buổi này sẽ bị xoá khỏi trình duyệt. Không thể hoàn tác.
        </Dialog>
      )}
      {deleteAll && (
        <Dialog title="Xoá toàn bộ lịch sử?" confirmLabel="Xoá tất cả" onConfirm={confirmDeleteAll} onCancel={() => setDeleteAll(false)} busy={busy} danger>
          {rows.length} buổi cùng hội thoại và bảng đánh giá sẽ bị xoá khỏi trình duyệt này. Không thể hoàn tác.
        </Dialog>
      )}
    </>
  );
}
