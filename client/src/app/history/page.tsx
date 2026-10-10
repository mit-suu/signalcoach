"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { SessionSummary, TranscriptSummary } from "@/types/api";
import { ArrowRight } from "@/components/BrandMark";
import { Dialog } from "@/components/Dialog";
import { SignalDots } from "@/components/SignalDots";
import { ProgressChart } from "@/components/ProgressChart";
import { STATUS_TEXT, fmtDate, pct } from "@/lib/labels";

/**
 * S10/S11 — practice history (FR-11): progress chart (score + question mistakes), current focus, sessions table,
 * analysed real-interview transcripts, deletes with confirmation.
 */
export default function HistoryPage() {
  const [rows, setRows] = useState<SessionSummary[] | null>(null);
  const [analyses, setAnalyses] = useState<TranscriptSummary[] | null>(null);
  const [analysisToDelete, setAnalysisToDelete] = useState<TranscriptSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<SessionSummary | null>(null);
  const [deleteAll, setDeleteAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Sessions and analyses load independently: one failing must not hide the other.
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [analysesError, setAnalysesError] = useState<string | null>(null);
  const load = () =>
    Promise.allSettled([
      api.sessions().then(
        (s) => {
          setRows(s);
          setSessionsError(null);
        },
        (e: Error) => {
          setRows([]);
          setSessionsError(e.message);
        },
      ),
      api.transcripts().then(
        (a) => {
          setAnalyses(a);
          setAnalysesError(null);
        },
        (e: Error) => {
          setAnalyses([]);
          setAnalysesError(e.message);
        },
      ),
    ]);
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const ended = useMemo(() => (rows ?? []).filter((r) => r.status !== "active"), [rows]);
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

  async function confirmDeleteAnalysis() {
    if (!analysisToDelete) return;
    setBusy(true);
    try {
      await api.deleteTranscript(analysisToDelete.id);
      setToast(`Đã xoá bản ghi ${analysisToDelete.title}`);
      setAnalysisToDelete(null);
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
      const { deleted, analysesDeleted = 0 } = await api.deleteAllSessions();
      setToast(analysesDeleted ? `Đã xoá ${deleted} buổi và ${analysesDeleted} bản ghi` : `Đã xoá ${deleted} buổi`);
      setDeleteAll(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!rows || !analyses) return <div className="state-msg muted">Đang tải…</div>;

  if (rows.length === 0 && analyses.length === 0 && !sessionsError && !analysesError) {
    // S10a — empty history
    return (
      <div className="state-msg">
        <h6 className="muted">Khả năng bắt tín hiệu</h6>
        <h2>Chưa có buổi nào. Điểm của bạn sẽ hiện ở đây sau buổi đầu tiên.</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/" className="btn btn-primary">Bắt đầu buổi đầu tiên <ArrowRight size={16} /></Link>
          <Link href="/transcripts/new" className="btn btn-secondary">Phân tích bản ghi thật</Link>
        </div>
      </div>
    );
  }

  const deleteAllButton = (
    <button className="btn btn-ghost" onClick={() => setDeleteAll(true)}>Xoá lịch sử</button>
  );

  return (
    <>
      {sessionsError && (
        <div className="section">
          <h3 style={{ margin: "0 0 12px" }}>Các buổi</h3>
          <div className="error-banner">Không tải được các buổi luyện tập: {sessionsError}</div>
        </div>
      )}
      {rows.length > 0 && (
      <>
      <div className="section grid-12 hist-top">
        <div style={{ gridColumn: "1 / span 7" }}>
          <ProgressChart sessions={ended} />
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
          {deleteAllButton}
        </div>
        <div className="hist-table-wrap">
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
      </div>
      </>
      )}

      <div className="section">
        <div className="sc-row-head">
          <h3 style={{ margin: 0 }}>Bản ghi đã phân tích</h3>
          {rows.length === 0 ? deleteAllButton : <Link href="/transcripts/new">Phân tích bản ghi mới</Link>}
        </div>
        {analysesError ? (
          <div className="error-banner">Không tải được các bản ghi đã phân tích: {analysesError}</div>
        ) : analyses.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Chưa có bản ghi nào. <Link href="/transcripts/new">Dán bản ghi một buổi phỏng vấn thật</Link> để xem bạn đã bắt hay bỏ lỡ tín hiệu nào.
          </p>
        ) : (
          <div className="hist-table-wrap">
            <table className="table hist-table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Bản ghi</th>
                  <th>Tín hiệu</th>
                  <th>Câu nên viết lại</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {analyses.map((a) => (
                  <tr key={a.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(a.createdAt)}</td>
                    <td>
                      <Link href={`/transcripts/${a.id}`} style={{ color: "inherit" }}>
                        <strong>{a.title}</strong>
                      </Link>
                      <span className="muted"> · {a.turnCount} lượt</span>
                    </td>
                    <td>
                      {a.counts.total > 0 ? (
                        <SignalDots
                          size={10}
                          statuses={[
                            ...Array<"caught">(a.counts.caught).fill("caught"),
                            ...Array<"partial">(a.counts.partial).fill("partial"),
                            ...Array<"missed">(a.counts.missed).fill("missed"),
                          ]}
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted">{a.feedbackCount}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-icon" aria-label="Xoá bản ghi" title="Xoá bản ghi" onClick={() => setAnalysisToDelete(a)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      {toDelete && (
        <Dialog title={`Xoá buổi ${fmtDate(toDelete.startedAt)} · ${toDelete.guideTitle}?`} confirmLabel="Xoá" onConfirm={confirmDelete} onCancel={() => setToDelete(null)} busy={busy} danger>
          Hội thoại và bảng đánh giá của buổi này sẽ bị xoá khỏi lịch sử của bạn. Không thể hoàn tác.
        </Dialog>
      )}
      {analysisToDelete && (
        <Dialog title={`Xoá bản ghi ${analysisToDelete.title}?`} confirmLabel="Xoá" onConfirm={confirmDeleteAnalysis} onCancel={() => setAnalysisToDelete(null)} busy={busy} danger>
          Bản ghi và phân tích này sẽ bị xoá. Không thể hoàn tác.
        </Dialog>
      )}
      {deleteAll && (
        <Dialog title="Xoá toàn bộ lịch sử?" confirmLabel="Xoá tất cả" onConfirm={confirmDeleteAll} onCancel={() => setDeleteAll(false)} busy={busy} danger>
          {rows.length} buổi cùng hội thoại và bảng đánh giá, và {analyses.length} bản ghi đã phân tích sẽ bị xoá khỏi lịch sử của bạn (cả trên tài khoản). Không thể hoàn tác.
        </Dialog>
      )}
    </>
  );
}
