import { Suspense } from "react";
import { SessionRoom } from "./SessionRoom";

/** S03/S04 — the live interview. */
export default function SessionPage({ params }: PageProps<"/session/[sessionId]">) {
  return (
    <Suspense fallback={<div className="state-msg muted">Đang mở buổi luyện…</div>}>
      <SessionRoom params={params} />
    </Suspense>
  );
}
