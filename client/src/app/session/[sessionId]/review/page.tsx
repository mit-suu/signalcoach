import { Suspense } from "react";
import { LoadingState } from "@/components/LoadingState";
import { TranscriptReview } from "./TranscriptReview";

/** S13 — full transcript with the agent's decisions. */
export default function ReviewPage({ params }: PageProps<"/session/[sessionId]/review">) {
  return (
    <Suspense fallback={<LoadingState label="Đang mở lại cuộc trò chuyện…" />}>
      <TranscriptReview params={params} />
    </Suspense>
  );
}
