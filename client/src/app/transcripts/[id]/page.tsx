import { Suspense } from "react";
import { TranscriptResultView } from "./TranscriptResultView";

/** Saved analysis of a real interview transcript. */
export default function TranscriptPage({ params }: PageProps<"/transcripts/[id]">) {
  return (
    <Suspense fallback={<div className="state-msg muted">Đang tải phân tích…</div>}>
      <TranscriptResultView params={params} />
    </Suspense>
  );
}
