import type { SignalStatus } from "@/types/api";
import { SIGNAL_TEXT } from "@/lib/labels";

/**
 * Row of squares, one per signal, coloured by status (design S05/S07/S10).
 * `statuses` may contain "pending"/"seeded" for live sessions, shown as empty.
 */
export function SignalDots({ statuses, size = 14, labels }: { statuses: (SignalStatus | "pending" | "seeded")[]; size?: number; labels?: string[] }) {
  return (
    <div className="signal-dots" role="img" aria-label={statuses.map((s, i) => `${labels?.[i] ?? `Tín hiệu ${i + 1}`}: ${dotText(s)}`).join(", ")}>
      {statuses.map((s, i) => (
        <span key={i} className={`dot dot-${s}`} style={{ width: size, height: size }} title={`${labels?.[i] ?? ""} ${dotText(s)}`.trim()} />
      ))}
    </div>
  );
}

function dotText(s: SignalStatus | "pending" | "seeded"): string {
  if (s === "pending") return "chưa xuất hiện";
  if (s === "seeded") return "vừa xuất hiện";
  return SIGNAL_TEXT[s];
}

export function DotLegend({ counts }: { counts: Partial<Record<SignalStatus, number>> }) {
  const items: [SignalStatus, string][] = [
    ["caught", "Bắt được"],
    ["partial", "Một phần"],
    ["missed", "Bỏ lỡ"],
    ["unsure", "Chưa chắc · không tính điểm"],
    ["not_surfaced", "Chưa xuất hiện"],
  ];
  return (
    <div className="dot-legend">
      {items
        .filter(([k]) => (counts[k] ?? 0) > 0)
        .map(([k, label]) => (
          <span key={k}>
            <span className={`dot dot-${k}`} /> {label} {counts[k]}
          </span>
        ))}
    </div>
  );
}
