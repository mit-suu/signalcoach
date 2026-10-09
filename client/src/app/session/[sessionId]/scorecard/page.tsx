import { Suspense } from "react";
import { Scorecard } from "./Scorecard";

/** S07/S08/S09 — scorecard after a session. */
export default function ScorecardPage({ params }: PageProps<"/session/[sessionId]/scorecard">) {
  return (
    <Suspense fallback={<div className="state-msg muted">Đang tải bảng đánh giá…</div>}>
      <Scorecard params={params} />
    </Suspense>
  );
}
