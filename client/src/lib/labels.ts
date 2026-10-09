import type { AgentAction, QuestionType, SessionStatus, SignalKind, SignalStatus } from "@/types/api";

/** Vietnamese labels shared by scorecard, history and transcript review. */

export const STATUS_TEXT: Record<SessionStatus, string> = {
  active: "Đang luyện",
  complete: "Hoàn thành",
  incomplete: "Chưa hoàn thành",
  insufficient: "Chưa đủ để chấm điểm",
};

export const SIGNAL_TEXT: Record<SignalStatus, string> = {
  caught: "Bắt được",
  partial: "Một phần",
  missed: "Bỏ lỡ",
  unsure: "Chưa chắc",
  not_surfaced: "Chưa xuất hiện",
};

export const KIND_TEXT: Record<SignalKind, string> = {
  emotion: "Cảm xúc",
  trailing: "Bỏ lửng",
  contradiction: "Mâu thuẫn",
  behavior: "Hành vi",
};

export const QUESTION_TEXT: Record<QuestionType, string> = {
  good: "Câu hỏi tốt",
  leading: "Câu dẫn dắt",
  closed: "Câu hỏi đóng",
  vague: "Chung chung",
  double: "Gộp hai ý",
  future: "Giả định tương lai",
  bare_why: "“Tại sao” trống",
  over_talking: "Nói quá nhiều",
};

export const ACTION_TEXT: Record<AgentAction, string> = {
  answer: "Trả lời",
  plant_signal: "Thả tín hiệu",
  go_deeper: "Kể sâu hơn",
  answer_briefly: "Trả lời ngắn",
  clarify: "Hỏi lại cho rõ",
  propose_end: "Gợi ý kết thúc",
  stay_in_character: "Giữ vai",
};

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
export const pct = (score: number | null) => (score === null ? null : Math.round(score * 100));
export const shortName = (name: string) => name.trim().split(" ").at(-1) ?? name;
