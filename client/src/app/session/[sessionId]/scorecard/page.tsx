import { Suspense } from "react";
import { LoadingState } from "@/components/LoadingState";
import { Scorecard } from "./Scorecard";

/** S07/S08/S09 — scorecard after a session. */
export default function ScorecardPage({ params }: PageProps<"/session/[sessionId]/scorecard">) {
  return (
    <Suspense fallback={<LoadingState label="Đang tải bảng đánh giá của bạn…" />}>
      <Scorecard params={params} />
    </Suspense>
  );
}
