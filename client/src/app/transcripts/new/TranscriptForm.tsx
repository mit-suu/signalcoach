"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { SampleTranscript } from "@/types/api";
import { ArrowRight } from "@/components/BrandMark";
import { MIN_MY_TURNS, TRANSCRIPT_MAX_CHARS, detectSpeakers } from "@/lib/transcript";

const STEPS = ["Tách các lượt nói", "Tìm tín hiệu người được phỏng vấn thả ra", "Đối chiếu câu hỏi tiếp theo của bạn", "Kiểm tra từng trích dẫn nguyên văn"];

const PLACEHOLDER = "Minh: Kể mình nghe lần gần nhất chị ghi chi tiêu là khi nào?\nLan: Tối qua. Mà dạo này mình hay quên…\nMinh: …";

/** Transcript analysis form: paste, pick which speaker is "me", analyse (or try a sample). */
export function TranscriptForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const [samples, setSamples] = useState<SampleTranscript[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    api.transcriptSamples().then(setSamples).catch(() => setSamples([]));
  }, []);

  // Fake progress while the model works.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 5000);
    return () => clearInterval(id);
  }, [busy]);

  const speakers = useMemo(() => detectSpeakers(text), [text]);
  // Keep the choice if that speaker is still there; otherwise default to whoever speaks first.
  const chosen = speakers.find((s) => s.name === me) ?? speakers[0] ?? null;
  const tooLong = text.length > TRANSCRIPT_MAX_CHARS;
  const hint = !text.trim()
    ? null
    : speakers.length < 2
      ? "Chưa nhận ra hai người nói. Mỗi lượt một dòng, bắt đầu bằng tên và dấu hai chấm — “Minh: …”."
      : chosen && chosen.turns < MIN_MY_TURNS
        ? `${chosen.name} mới có ${chosen.turns} lượt hỏi — cần ít nhất ${MIN_MY_TURNS} để phân tích.`
        : null;
  const canSubmit = !busy && !tooLong && speakers.length >= 2 && Boolean(chosen) && chosen!.turns >= MIN_MY_TURNS;

  function loadSample(s: SampleTranscript) {
    setText(s.text);
    setMe(s.me);
    setTitle("");
    setError(null);
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit || !chosen) return;
    setStep(0);
    setBusy(true);
    setError(null);
    try {
      const a = await api.analyzeTranscript({ text, me: chosen.name, title: title.trim() || undefined });
      router.push(`/transcripts/${a.id}`);
    } catch (err) {
      setError(err as ApiError);
      setBusy(false);
    }
  }

  return (
    <div className="section grid-12 creator">
      <div style={{ gridColumn: "1 / span 5" }}>
        <h1 style={{ margin: "0 0 12px" }}>Phân tích bản ghi</h1>
        <p className="muted">
          Dán bản ghi một buổi phỏng vấn bạn đã làm thật. Agent chỉ ra những tín hiệu người được phỏng vấn đã thả ra, bạn có hỏi tiếp trong 2 câu hỏi ngay sau đó không, và câu hỏi nào nên viết lại — mỗi góp ý gắn với một nguyên tắc.
        </p>
        <div className="privacy-note">
          <strong>Trước khi dán</strong>
          <span>Xoá tên thật, số điện thoại, công ty và chi tiết nhận dạng khác; và chỉ dùng bản ghi khi người được phỏng vấn đã đồng ý. Bản ghi được lưu trong lịch sử của bạn, bạn xoá được bất cứ lúc nào.</span>
        </div>
        <h6 className="muted" style={{ marginTop: 24 }}>Chưa có bản ghi?</h6>
        {samples.length > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => loadSample(samples[0]!)} disabled={busy}>
            Thử với bản ghi mẫu
          </button>
        )}
        {samples.map((s) => (
          <button key={s.id} type="button" className="example-card" onClick={() => loadSample(s)} disabled={busy}>
            <strong>{s.title}</strong>
            <span className="muted">{s.description}</span>
          </button>
        ))}
      </div>

      <form className="creator-form" style={{ gridColumn: "7 / span 6" }} onSubmit={submit}>
        <div className="field">
          <label htmlFor="transcript">Bản ghi *</label>
          <textarea
            id="transcript"
            className="input transcript-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            placeholder={PLACEHOLDER}
            disabled={busy}
            aria-describedby="transcript-count"
          />
          <div id="transcript-count" className={`char-count ${tooLong ? "over" : "muted"}`}>
            {text.length.toLocaleString("vi-VN")} / {TRANSCRIPT_MAX_CHARS.toLocaleString("vi-VN")} ký tự
          </div>
        </div>

        {speakers.length >= 2 && (
          <fieldset className="speaker-pick" disabled={busy}>
            <legend>Bạn là ai trong bản ghi?</legend>
            <div className="speaker-options">
              {speakers.map((s) => (
                <label key={s.name} className={`speaker-option ${chosen?.name === s.name ? "on" : ""}`}>
                  <input type="radio" name="me" value={s.name} checked={chosen?.name === s.name} onChange={() => setMe(s.name)} />
                  <span>{s.name}</span>
                  <span className="muted">{s.turns} lượt</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="field">
          <label htmlFor="title">Tên bản ghi (tuỳ chọn)</label>
          <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Mặc định: tên người được phỏng vấn + ngày" disabled={busy} />
        </div>

        {hint && <div className="muted" style={{ fontSize: 13 }}>{hint}</div>}
        {error && (
          <div className="error-box" role="alert">
            <span style={{ whiteSpace: "pre-line" }}>{error.message}</span>
            {error.status === 503 && (
              <button type="button" className="btn btn-secondary" onClick={() => submit()}>
                Thử lại
              </button>
            )}
          </div>
        )}

        {busy ? (
          <div className="progress-box" aria-live="polite">
            <div className="typing"><span /><span /><span /></div>
            <div>
              <strong>{STEPS[step]}…</strong>
              <div className="muted" style={{ fontSize: 13 }}>Thường mất 15–40 giây.</div>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary btn-wide" disabled={!canSubmit}>
            Phân tích
            <ArrowRight />
          </button>
        )}
        <Link href="/history" className="muted back-link">Các bản ghi đã phân tích ở trang Lịch sử →</Link>
      </form>
    </div>
  );
}
