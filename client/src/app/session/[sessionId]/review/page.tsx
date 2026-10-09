import { Suspense } from "react";
import { TranscriptReview } from "./TranscriptReview";

/** S13 — full transcript with the agent's decisions. */
export default function ReviewPage({ params }: PageProps<"/session/[sessionId]/review">) {
  return (
    <Suspense fallback={<div className="state-msg muted">Đang tải hội thoại…</div>}>
      <TranscriptReview params={params} />
    </Suspense>
  );
}
