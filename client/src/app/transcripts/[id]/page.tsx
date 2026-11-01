import { Suspense } from "react";
import { LoadingState } from "@/components/LoadingState";
import { TranscriptResultView } from "./TranscriptResultView";

/** Saved analysis of a real interview transcript. */
export default function TranscriptPage({ params }: PageProps<"/transcripts/[id]">) {
  return (
    <Suspense fallback={<LoadingState label="Đang tải kết quả phỏng vấn…" />}>
      <TranscriptResultView params={params} />
    </Suspense>
  );
}
