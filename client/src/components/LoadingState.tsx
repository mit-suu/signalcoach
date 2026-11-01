interface LoadingStateProps {
  label?: string;
  compact?: boolean;
}

/** Shared data wait for both Suspense and client fetches; no simulated progress. */
export function LoadingState({ label = "Đang tải nội dung…", compact = false }: LoadingStateProps) {
  return (
    <div className={compact ? "loading-inline" : "wrap loading-page"}>
      <div className={`loading-card${compact ? " loading-card-compact" : ""}`} role="status" aria-live="polite">
        <div className="loading-illustration" aria-hidden="true">
          <span className="loading-spark">✦</span>
          <div className="loading-bubble"><i /><i /><i /></div>
        </div>
        <p className="loading-label">{label}</p>
        <p className="loading-description">Đang lấy nội dung cho bạn.</p>
        <div className="loading-preview" aria-hidden="true">
          <span className="loading-preview-avatar" />
          <div className="loading-preview-lines"><i /><i /><i /></div>
        </div>
      </div>
    </div>
  );
}
