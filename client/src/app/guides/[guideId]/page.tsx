import { Suspense } from "react";
import { LoadingState } from "@/components/LoadingState";
import { GuideBrief } from "./GuideBrief";

/** S02 — Guide brief before starting. */
export default function GuidePage({ params }: PageProps<"/guides/[guideId]">) {
  return (
    <Suspense fallback={<LoadingState label="Đang chuẩn bị buổi phỏng vấn…" />}>
      <GuideBrief params={params} />
    </Suspense>
  );
}
