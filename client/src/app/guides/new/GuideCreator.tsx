"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PublicGuide } from "@/types/api";
import { ArrowRight, Avatar } from "@/components/BrandMark";

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

const STEPS = ["Đọc mô tả sản phẩm", "Dựng persona và bối cảnh", "Viết sáu tín hiệu ba lớp", "Kiểm tra cấu trúc kịch bản"];

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

  // Fake progress while the agent works (typically 15–30 s).
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
    const p = result.persona;
    return (
      <>
        <div className="section grid-12">
          <div style={{ gridColumn: "1 / span 7" }}>
            <div className="card-kicker">{result.context} · kịch bản của bạn</div>
            <h1 style={{ margin: "6px 0 16px" }}>{result.title}</h1>
            <h6 className="muted">Mục tiêu</h6>
            <p style={{ fontSize: 16 }}>{result.goal}</p>
            <p className="muted" style={{ fontSize: 13 }}>Ẩn trong cuộc trò chuyện · {result.signalCount} tín hiệu — bạn sẽ thấy chúng sau buổi, không phải trước.</p>
          </div>
          <div style={{ gridColumn: "9 / span 4", alignSelf: "end", display: "grid", gap: 8 }}>
            <button className="btn btn-primary btn-wide" style={{ width: "100%" }} onClick={start} disabled={busy}>
              {busy ? "Đang chuẩn bị…" : "Bắt đầu phỏng vấn"}
              <ArrowRight />
            </button>
            <button className="btn btn-secondary btn-wide" style={{ width: "100%" }} onClick={() => setResult(null)} disabled={busy}>
              Sửa mô tả, tạo lại
            </button>
          </div>
        </div>
        <div className="section grid-12">
          <div className="persona-line" style={{ gridColumn: "1 / span 5", alignItems: "flex-start" }}>
            <Avatar initial={p.initial} size={64} />
            <div>
              <h4 style={{ margin: 0 }}>{p.name}, {p.age}</h4>
              <p className="muted">{p.background}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {p.traits.map((t) => (
                  <span key={t} className="tag tag-neutral">{t}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ gridColumn: "7 / span 6" }}>
            <h6 className="muted">Câu hỏi gợi ý</h6>
            {result.suggestedQuestions.map((q, i) => (
              <div key={q} className="q-row">
                <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</span>
                {q}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="section grid-12 creator">
      <div style={{ gridColumn: "1 / span 5" }}>
        <Link href="/" className="muted back-link">← Tất cả kịch bản</Link>
        <h1 style={{ margin: "16px 0 12px" }}>Tạo kịch bản từ sản phẩm của bạn</h1>
        <p className="muted">
          Agent đọc mô tả, dựng một người dùng có thật trong bối cảnh đó, rồi viết sáu tín hiệu ba lớp (điều họ buột miệng nói · chuyện đã xảy ra · lý do thật). Kịch bản chỉ bạn thấy; tín hiệu được giấu cho tới khi buổi kết thúc.
        </p>
        <h6 className="muted" style={{ marginTop: 24 }}>Ví dụ</h6>
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
          >
            <strong>{ex.product.split(":")[0]}</strong>
            <span className="muted">{ex.audience}</span>
          </button>
        ))}
      </div>
      <form className="creator-form" style={{ gridColumn: "7 / span 6" }} onSubmit={submit}>
        <div className="field">
          <label htmlFor="product">Sản phẩm hoặc dự án *</label>
          <textarea id="product" className="input" value={product} onChange={(e) => setProduct(e.target.value)} required minLength={10} maxLength={2000} rows={4} placeholder="Nó làm gì, cho ai, đang ở giai đoạn nào…" disabled={busy} />
        </div>
        <div className="field">
          <label htmlFor="audience">Người bạn sắp phỏng vấn *</label>
          <input id="audience" className="input" value={audience} onChange={(e) => setAudience(e.target.value)} required minLength={3} maxLength={500} placeholder="Ví dụ: chủ quán cà phê 30–45 tuổi, đã dùng thử rồi bỏ" disabled={busy} />
        </div>
        <div className="field">
          <label htmlFor="goal">Bạn muốn hiểu điều gì? (tuỳ chọn)</label>
          <input id="goal" className="input" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={500} placeholder="Ví dụ: vì sao họ bỏ sau tuần đầu" disabled={busy} />
        </div>
        <div className="field">
          <label htmlFor="notes">Ghi chú thêm (tuỳ chọn)</label>
          <input id="notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Tính cách persona, bối cảnh đặc biệt…" disabled={busy} />
        </div>
        {clarify && (
          <div className="clarify-box">
            <h6 style={{ margin: "0 0 6px" }}>Agent cần hỏi lại</h6>
            <p style={{ margin: 0 }}>{clarify}</p>
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>Bổ sung vào mô tả ở trên rồi gửi lại.</p>
          </div>
        )}
        {error && <div className="tag tag-accent" style={{ padding: "8px 12px", fontSize: 13 }}>{error}</div>}
        {busy ? (
          <div className="progress-box" aria-live="polite">
            <div className="typing"><span /><span /><span /></div>
            <div>
              <strong>{STEPS[step]}…</strong>
              <div className="muted" style={{ fontSize: 13 }}>Thường mất 15–30 giây.</div>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary btn-wide" disabled={product.trim().length < 10 || audience.trim().length < 3}>
            Dựng kịch bản
            <ArrowRight />
          </button>
        )}
      </form>
    </div>
  );
}
