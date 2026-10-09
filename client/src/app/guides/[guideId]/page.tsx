import { Suspense } from "react";
import { GuideBrief } from "./GuideBrief";

/** S02 — Guide brief before starting. */
export default function GuidePage({ params }: PageProps<"/guides/[guideId]">) {
  return (
    <Suspense fallback={<div className="state-msg muted">Đang tải…</div>}>
      <GuideBrief params={params} />
    </Suspense>
  );
}
