import { Suspense } from "react";
import { LoadingState } from "@/components/LoadingState";
import { SessionRoom } from "./SessionRoom";

/** S03/S04 — the live interview. */
export default function SessionPage({ params }: PageProps<"/session/[sessionId]">) {
  return (
    <Suspense fallback={<LoadingState label="Đang mở buổi luyện của bạn…" />}>
      <SessionRoom params={params} />
    </Suspense>
  );
}
