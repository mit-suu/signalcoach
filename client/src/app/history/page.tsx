"use client";

import { LoadingState } from "@/components/LoadingState";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { SessionSummary, TranscriptSummary } from "@/types/api";
import { ArrowRight, TrashIcon } from "@/components/BrandMark";
import { Dialog } from "@/components/Dialog";
import { ProgressChart } from "@/components/ProgressChart";
import { CLUE_EXPLAINER, fmtDate, pct, plain } from "@/lib/labels";
import { unscoredReason } from "@/lib/progress";

/**
 * Practice history: score chart (with plain reasons for unscored sessions), current focus, the
 * sessions list, analysed real-interview transcripts, deletes with confirmation.
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
      setToast(`Đã xoá ${analysisToDelete.title}`);
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
      setToast(analysesDeleted ? `Đã xoá ${deleted} buổi luyện và ${analysesDeleted} buổi đã chấm` : `Đã xoá ${deleted} buổi`);
      setDeleteAll(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="wrap"><div className="error-banner">{error}</div></div>;
  if (!rows || !analyses) return <LoadingState label="Đang mở lịch sử của bạn…" />;

  if (rows.length === 0 && analyses.length === 0 && !sessionsError && !analysesError) {
    // Empty history
    return (
      <div className="wrap state-msg">
        <p className="eyebrow">Lịch sử luyện tập</p>
        <h2>Chưa có buổi nào. Điểm của bạn sẽ hiện ở đây sau buổi đầu tiên.</h2>
        <p className="muted">{CLUE_EXPLAINER}</p>
        <div className="cta">
          <Link href="/#chon-nguoi" className="btn btn-primary">Bắt đầu buổi đầu tiên <ArrowRight size={16} /></Link>
          <Link href="/transcripts/new" className="btn btn-secondary">Chấm một buổi phỏng vấn thật</Link>
        </div>
      </div>
    );
  }

  const deleteAllButton = (
    <button className="btn-link" onClick={() => setDeleteAll(true)}>Xoá toàn bộ lịch sử</button>
  );

  return (
    <div className="wrap page history">
      <h1>Lịch sử luyện tập</h1>
      {sessionsError && <div className="error-banner">Chưa tải được các buổi luyện: {sessionsError}</div>}
      {rows.length > 0 && (
        <>
          <div className="hist-top">
            <section className="card">
              <ProgressChart sessions={ended} />
            </section>
            <aside className="card card-pop focus-box">
              <span className="label">Đang tập trung</span>
              {latestFocus ? (
                <>
                  <h3>{plain(latestFocus.skill)}</h3>
                  <p className="muted">{plain(latestFocus.why)}</p>
                </>
              ) : (
                <p className="muted">Luyện xong một buổi để biết buổi sau nên tập trung vào điều gì.</p>
              )}
              {improvedOnNew && <span className="tag tag-accent">Điểm tăng ở người dùng mới</span>}
              <Link href="/#chon-nguoi" className="btn btn-primary">Luyện buổi mới <ArrowRight size={16} /></Link>
            </aside>
          </div>

          <section className="hist-section">
            <div className="split">
              <h2>Các buổi đã luyện</h2>
              {deleteAllButton}
            </div>
            <ul className="hist-list">
              {rows.map((r) => (
                <li key={r.id} className="hist-row">
                  <span className="hist-date">{fmtDate(r.startedAt)}</span>
                  <div className="hist-main">
                    <Link href={r.status === "active" ? `/session/${r.id}` : `/session/${r.id}/scorecard`}>
                      <b>{r.guideTitle}</b>
                    </Link>
                    <span className="small">với {r.personaName}{r.focus[0] ? ` · Buổi sau: ${plain(r.focus[0].skill)}` : ""}</span>
                  </div>
                  <div className="hist-score">
                    {r.score !== null ? <b>{pct(r.score)} điểm</b> : <span className="hist-reason">{unscoredReason(r)}</span>}
                    <span className="small">{r.counts ? `Tìm được ${r.counts.caught}/${r.counts.total} manh mối` : `${r.questionCount} câu hỏi`}</span>
                  </div>
                  <button className="btn btn-icon" aria-label={`Xoá buổi ${fmtDate(r.startedAt)}`} title="Xoá buổi" onClick={() => setToDelete(r)}>
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="hist-section">
        <div className="split">
          <h2>Buổi phỏng vấn thật đã chấm</h2>
          {rows.length === 0 ? deleteAllButton : <Link href="/transcripts/new">Chấm thêm một buổi</Link>}
        </div>
        {analysesError ? (
          <div className="error-banner">Chưa tải được các buổi đã chấm: {analysesError}</div>
        ) : analyses.length === 0 ? (
          <p className="muted">
            Chưa có buổi nào. <Link href="/transcripts/new">Dán lời thoại một buổi phỏng vấn thật</Link> để xem bạn tìm được hay bỏ lỡ manh mối nào.
          </p>
        ) : (
          <ul className="hist-list">
            {analyses.map((a) => (
              <li key={a.id} className="hist-row">
                <span className="hist-date">{fmtDate(a.createdAt)}</span>
                <div className="hist-main">
                  <Link href={`/transcripts/${a.id}`}><b>{a.title}</b></Link>
                  <span className="small">{a.turnCount} lượt nói</span>
                </div>
                <div className="hist-score">
                  <span className="small">{a.counts.total > 0 ? `Tìm được ${a.counts.caught}/${a.counts.total} manh mối` : "Không thấy manh mối nào"}</span>
                  <span className="small">{a.feedbackCount} câu nên hỏi khác</span>
                </div>
                <button className="btn btn-icon" aria-label={`Xoá ${a.title}`} title="Xoá" onClick={() => setAnalysisToDelete(a)}>
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && <div className="toast" role="status">{toast}</div>}

      {toDelete && (
        <Dialog title={`Xoá buổi ${fmtDate(toDelete.startedAt)} · ${toDelete.guideTitle}?`} confirmLabel="Xoá" onConfirm={confirmDelete} onCancel={() => setToDelete(null)} busy={busy} danger>
          Cuộc trò chuyện và bảng đánh giá của buổi này sẽ bị xoá khỏi lịch sử. Không thể khôi phục.
        </Dialog>
      )}
      {analysisToDelete && (
        <Dialog title={`Xoá “${analysisToDelete.title}”?`} confirmLabel="Xoá" onConfirm={confirmDeleteAnalysis} onCancel={() => setAnalysisToDelete(null)} busy={busy} danger>
          Lời thoại và kết quả chấm của buổi này sẽ bị xoá. Không thể khôi phục.
        </Dialog>
      )}
      {deleteAll && (
        <Dialog title="Xoá toàn bộ lịch sử?" confirmLabel="Xoá tất cả" onConfirm={confirmDeleteAll} onCancel={() => setDeleteAll(false)} busy={busy} danger>
          {rows.length} buổi luyện và {analyses.length} buổi phỏng vấn thật đã chấm sẽ bị xoá (cả trên tài khoản). Không thể khôi phục.
        </Dialog>
      )}
    </div>
  );
}
