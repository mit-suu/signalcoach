"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PublicGuide } from "@/types/api";
import { ArrowRight } from "@/components/BrandMark";
import { GuideIntro } from "@/app/guides/[guideId]/GuideBrief";

const EXAMPLES = [
  {
    product: "App đặt lịch khám cho phòng khám nha khoa nhỏ: lễ tân nhập lịch, bệnh nhân nhận nhắc qua Zalo.",
    audience: "Lễ tân phòng khám tư, 25–40 tuổi, đang quản lý lịch bằng sổ giấy và Zalo.",
    goal: "Hiểu vì sao họ vẫn quay lại sổ giấy sau khi thử phần mềm.",
  },
  {
    product: "Nền tảng học tiếng Anh giao tiếp 1-1 với gia sư online, gói theo tháng.",
    audience: "Nhân viên văn phòng 24–32 tuổi đã mua gói nhưng bỏ học sau tháng đầu.",
    goal: "Hiểu điều gì xảy ra trong tháng đầu khiến họ ngừng đặt lịch.",
  },
];

const STEPS = ["Đọc mô tả sản phẩm", "Tạo người dùng và hoàn cảnh của họ", "Giấu 6 manh mối vào câu chuyện", "Kiểm tra lại lần cuối"];

/** Create a simulated user from the learner's own product (takes ~30 s). */
export function GuideCreator() {
  const router = useRouter();
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [goal, setGoal] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clarify, setClarify] = useState<string | null>(null);
  const [result, setResult] = useState<PublicGuide | null>(null);

  // Fake progress while the guide is generated (typically 15–30 s).
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 6000);
    return () => clearInterval(id);
  }, [busy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStep(0);
    setBusy(true);
    setError(null);
    setClarify(null);
    try {
      const r = await api.generateGuide({ product, audience, goal: goal || undefined, notes: notes || undefined });
      if (r.clarify) setClarify(r.clarify);
      else if (r.guide) setResult(r.guide);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!result) return;
    setBusy(true);
    try {
      const s = await api.createSession(result.id);
      router.push(`/session/${s.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (result) {
    return (
      <>
        {error && <div className="wrap"><div className="error-banner">{error}</div></div>}
        <GuideIntro guide={result} onStart={start} starting={busy} onEdit={() => setResult(null)} />
      </>
    );
  }

  return (
    <div className="wrap page creator">
      <div className="creator-intro">
        <Link href="/#chon-nguoi" className="back-link">← Chọn người có sẵn</Link>
        <h1>Tạo người dùng từ sản phẩm của bạn</h1>
        <p className="lead">
          Mô tả sản phẩm và người bạn sắp phỏng vấn. SignalCoach tạo một người dùng giả lập có tính cách và hoàn cảnh riêng, giấu sẵn 6 manh mối để bạn tìm. Chỉ bạn thấy người dùng này.
        </p>
        <span className="label">Chưa biết viết gì? Thử một ví dụ</span>
        <div className="stack">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.product}
              type="button"
              className="example-card"
              onClick={() => {
                setProduct(ex.product);
                setAudience(ex.audience);
                setGoal(ex.goal);
              }}
              disabled={busy}
            >
              <b>{ex.product.split(":")[0]}</b>
              <span className="small">{ex.audience}</span>
            </button>
          ))}
        </div>
      </div>

      <form className="card creator-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="product">Sản phẩm của bạn *</label>
          <textarea id="product" className="input" value={product} onChange={(e) => setProduct(e.target.value)} required minLength={10} maxLength={2000} rows={4} placeholder="Nó làm gì, cho ai, đang ở giai đoạn nào…" disabled={busy} />
        </div>
        <div className="field">
          <label htmlFor="audience">Người bạn sắp phỏng vấn *</label>
          <input id="audience" className="input" value={audience} onChange={(e) => setAudience(e.target.value)} required minLength={3} maxLength={500} placeholder="Ví dụ: chủ quán cà phê 30–45 tuổi, đã dùng thử rồi bỏ" disabled={busy} />
        </div>
        <div className="field">
          <label htmlFor="goal">Bạn muốn hiểu điều gì? (không bắt buộc)</label>
          <input id="goal" className="input" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={500} placeholder="Ví dụ: vì sao họ bỏ sau tuần đầu" disabled={busy} />
        </div>
        <div className="field">
          <label htmlFor="notes">Ghi chú thêm (không bắt buộc)</label>
          <input id="notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Tính cách, hoàn cảnh đặc biệt…" disabled={busy} />
        </div>
        {clarify && (
          <div className="notice notice-warn">
            <div>
              <b>Cần thêm một chút thông tin</b>
              <p>{clarify}</p>
              <p className="small">Bổ sung vào mô tả ở trên rồi bấm tạo lại.</p>
            </div>
          </div>
        )}
        {error && <div className="error-banner">{error}</div>}
        {busy ? (
          <div className="notice" aria-live="polite">
            <div className="typing"><span /><span /><span /></div>
            <div>
              <b>{STEPS[step]}…</b>
              <p className="small">Thường mất 15–30 giây.</p>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" disabled={product.trim().length < 10 || audience.trim().length < 3}>
            Tạo người dùng <ArrowRight />
          </button>
        )}
      </form>
    </div>
  );
}
