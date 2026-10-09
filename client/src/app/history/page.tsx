"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SessionStatus, SessionSummary } from "@/types/api";

const STATUS_TEXT: Record<SessionStatus, string> = {
  active: "Đang luyện",
  complete: "Hoàn thành",
  incomplete: "Chưa hoàn thành",
  insufficient: "Chưa đủ để chấm điểm",
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });

/**
 * S10 — practice history (FR-11). Scaffold: table + delete.
 * TODO(S10): score chart, focus tracking, delete confirmations (S11/S11b).
 */
export default function HistoryPage() {
  const [rows, setRows] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.sessions().then(setRows).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  async function remove(id: string) {
    await api.deleteSession(id);
    void load();
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!rows) return <div className="state-msg muted">Đang tải…</div>;

  if (rows.length === 0) {
    // S10a — empty history
    return (
      <div className="state-msg">
        <h6 className="muted">Khả năng bắt tín hiệu</h6>
        <h2>Chưa có buổi nào. Điểm của bạn sẽ hiện ở đây sau buổi đầu tiên.</h2>
        <Link href="/" className="btn btn-primary">Bắt đầu buổi đầu tiên</Link>
      </div>
    );
  }

  return (
    <div className="section">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Các buổi</h2>
        <Link href="/" className="btn btn-primary">Buổi mới</Link>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Kịch bản</th>
            <th>Điểm</th>
            <th>Câu hỏi</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{fmtDate(r.startedAt)}</td>
              <td>
                <Link href={`/session/${r.id}`} style={{ color: "inherit" }}>{r.guideTitle}</Link>
                <span className="muted"> · {r.personaName}</span>
              </td>
              <td>{r.score !== null ? `${Math.round(r.score * 100)}%` : STATUS_TEXT[r.status]}</td>
              <td>{r.questionCount}</td>
              <td style={{ textAlign: "right" }}>
                <button className="btn btn-ghost" onClick={() => remove(r.id)}>Xoá</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
