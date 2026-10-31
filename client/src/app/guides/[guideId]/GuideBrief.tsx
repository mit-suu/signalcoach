"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PublicGuide } from "@/types/api";
import { ArrowRight, Avatar, BulbIcon } from "@/components/BrandMark";
import { Dialog } from "@/components/Dialog";
import { plain, shortName } from "@/lib/labels";

/** Before the interview: who you are talking to, the goal, how clues work, and a start button. */
export function GuideBrief({ params }: { params: Promise<{ guideId: string }> }) {
  const { guideId } = use(params);
  const router = useRouter();
  const [guide, setGuide] = useState<PublicGuide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    api.guide(guideId).then(setGuide).catch((e: Error) => setError(e.message));
  }, [guideId]);

  async function start() {
    setStarting(true);
    try {
      const session = await api.createSession(guideId);
      router.push(`/session/${session.id}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  }

  async function remove() {
    try {
      await api.deleteGuide(guideId);
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
      setConfirmDelete(false);
    }
  }

  if (error) return <div className="wrap"><div className="error-banner">{error}</div></div>;
  if (!guide) return <div className="wrap state-msg muted">Đang tải…</div>;
  return <GuideIntro guide={guide} onStart={start} starting={starting} onDelete={guide.custom ? () => setConfirmDelete(true) : undefined} confirmDelete={confirmDelete} onConfirmDelete={remove} onCancelDelete={() => setConfirmDelete(false)} />;
}

/** Shared by the brief page and the guide creator's result. */
export function GuideIntro({
  guide,
  onStart,
  starting,
  onDelete,
  onEdit,
  confirmDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  guide: PublicGuide;
  onStart: () => void;
  starting: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  confirmDelete?: boolean;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
}) {
  const p = guide.persona;
  const name = shortName(p.name);

  return (
    <div className="wrap page brief">
      <Link href="/#chon-nguoi" className="back-link">← Chọn người khác</Link>
      <div className="brief-grid">
        <section className="card card-pop brief-main">
          <p className="card-kicker">{guide.title}{guide.custom ? " · người dùng bạn tạo" : ""}</p>
          <div className="who-card">
            <Avatar initial={p.initial} size="lg" />
            <div>
              <h1>{p.name}, {p.age}</h1>
              <span>{p.tagline}</span>
            </div>
          </div>
          <p>{plain(p.background, name)}</p>
          {p.traits.length > 0 && (
            <div className="row">
              {p.traits.map((t) => (
                <span key={t} className="tag tag-neutral">{t}</span>
              ))}
            </div>
          )}
          <div>
            <span className="label">Mục tiêu buổi này</span>
            <p>{plain(guide.goal, name)}</p>
          </div>
          <div className="cta">
            <button className="btn btn-primary" onClick={onStart} disabled={starting}>
              {starting ? "Đang chuẩn bị…" : `Bắt đầu phỏng vấn ${name}`} <ArrowRight />
            </button>
            {onEdit && <button className="btn btn-secondary" onClick={onEdit} disabled={starting}>Sửa mô tả, tạo lại</button>}
            {onDelete && <button className="btn-link" onClick={onDelete} disabled={starting}>Xoá người dùng này</button>}
          </div>
          <p className="small">Khoảng {guide.estimatedMinutes} phút · chat bằng chữ · lưu tự động</p>
        </section>

        <aside className="stack">
          <section className="card brief-clues">
            <span className="hint-icon"><BulbIcon /></span>
            <h2>{name} giấu {guide.signalCount} manh mối. Hỏi đúng thì bạn tìm ra.</h2>
            <p className="muted">
              Manh mối là chi tiết {name} chỉ nhắc thoáng qua một lần, ví dụ một câu than nhẹ hay một chuyện kể dở. Khi nghe thấy, hãy hỏi sâu ngay: “Lần gần nhất chuyện đó xảy ra là khi nào?”. Lướt qua thì chi tiết đó trôi mất.
            </p>
            <p className="muted">Nếu bật gợi ý trong buổi, một gợi ý nhỏ sẽ hiện khi {name} vừa nhắc điều gì đáng hỏi. Bạn bật hoặc tắt gợi ý được bất cứ lúc nào.</p>
          </section>
          {guide.suggestedQuestions.length > 0 && (
            <section className="card">
              <span className="label">Câu mở đầu gợi ý</span>
              <ol className="q-list">
                {guide.suggestedQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
              <p className="small">Chỉ để bắt đầu. Sau đó hãy đi theo câu chuyện của {name}, không theo danh sách.</p>
            </section>
          )}
        </aside>
      </div>

      {confirmDelete && onConfirmDelete && onCancelDelete && (
        <Dialog title={`Xoá ${name} (${guide.title})?`} confirmLabel="Xoá" onConfirm={onConfirmDelete} onCancel={onCancelDelete} danger>
          Các buổi bạn đã luyện với {name} vẫn còn trong lịch sử. Không thể khôi phục.
        </Dialog>
      )}
    </div>
  );
}
