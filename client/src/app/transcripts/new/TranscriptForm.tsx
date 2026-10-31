"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { SampleTranscript } from "@/types/api";
import { ArrowRight } from "@/components/BrandMark";
import { MIN_MY_TURNS, TRANSCRIPT_MAX_CHARS, detectSpeakers } from "@/lib/transcript";

const STEPS = ["Tách các lượt nói", "Tìm các manh mối người kia nhắc tới", "Xem bạn có hỏi tiếp ngay sau đó không", "Kiểm tra lại từng câu trích"];

const PLACEHOLDER = "Minh: Kể mình nghe lần gần nhất chị ghi chi tiêu là khi nào?\nLan: Tối qua. Mà dạo này mình hay quên…\nMinh: …";

/** Score a real interview: paste the dialogue, pick which speaker is "me", analyse (or try a sample). */
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
    <div className="wrap page creator">
      <div className="creator-intro">
        <p className="eyebrow">Chấm buổi phỏng vấn thật</p>
        <h1>Bạn đã bỏ lỡ gì trong một buổi phỏng vấn thật?</h1>
        <p className="lead">
          Dán lời thoại một buổi bạn đã phỏng vấn. SignalCoach tìm những chi tiết người kia nhắc thoáng qua (manh mối), xem bạn có hỏi tiếp trong 2 câu ngay sau đó không, và chỉ ra câu nào nên hỏi khác đi.
        </p>
        <div className="notice notice-warn">
          <div>
            <b>Trước khi dán</b>
            <p className="small">Xoá tên thật, số điện thoại, tên công ty và chi tiết nhận dạng khác. Chỉ dùng lời thoại khi người được phỏng vấn đã đồng ý. Kết quả được lưu trong lịch sử của bạn và xoá được bất cứ lúc nào.</p>
          </div>
        </div>
        {samples.length > 0 && (
          <>
            <span className="label">Chưa có lời thoại? Thử một buổi mẫu</span>
            <div className="stack">
              {samples.map((s) => (
                <button key={s.id} type="button" className="example-card" onClick={() => loadSample(s)} disabled={busy}>
                  <b>{s.title}</b>
                  <span className="small">{s.description}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <form className="card creator-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="transcript">Lời thoại *</label>
          <span className="hint-line">Mỗi lượt một dòng, bắt đầu bằng tên và dấu hai chấm.</span>
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
          <div id="transcript-count" className={`char-count${tooLong ? " over" : ""}`}>
            {text.length.toLocaleString("vi-VN")} / {TRANSCRIPT_MAX_CHARS.toLocaleString("vi-VN")} ký tự
          </div>
        </div>

        {speakers.length >= 2 && (
          <fieldset className="speaker-pick" disabled={busy}>
            <legend>Bạn là ai trong lời thoại?</legend>
            <div className="speaker-options">
              {speakers.map((s) => (
                <label key={s.name} className={`speaker-option${chosen?.name === s.name ? " on" : ""}`}>
                  <input type="radio" name="me" value={s.name} checked={chosen?.name === s.name} onChange={() => setMe(s.name)} />
                  <span>{s.name}</span>
                  <span className="small">{s.turns} lượt</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="field">
          <label htmlFor="title">Tên buổi (không bắt buộc)</label>
          <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Mặc định: tên người được phỏng vấn và ngày" disabled={busy} />
        </div>

        {hint && <p className="small">{hint}</p>}
        {error && (
          <div className="error-banner error-row" role="alert">
            <span className="pre-line">{error.message}</span>
            {error.status === 503 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => submit()}>
                Thử lại
              </button>
            )}
          </div>
        )}

        {busy ? (
          <div className="notice" aria-live="polite">
            <div className="typing"><span /><span /><span /></div>
            <div>
              <b>{STEPS[step]}…</b>
              <p className="small">Thường mất 15–40 giây.</p>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" disabled={!canSubmit}>
            Chấm buổi này <ArrowRight />
          </button>
        )}
        <Link href="/history" className="back-link">Các buổi đã chấm nằm ở trang Lịch sử →</Link>
      </form>
    </div>
  );
}
