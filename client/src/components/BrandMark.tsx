export function BrandMark({ size = 32 }: { size?: number }) {
  // Video có nền trắng; multiply làm nền trắng "tan" vào nền #f3f2f2 của trang.
  return (
    <video
      src="/logo.mp4"
      autoPlay
      muted
      loop
      playsInline
      aria-hidden
      style={{ height: size, width: "auto", mixBlendMode: "multiply" }}
    />
  );
}

export function Avatar({ initial, size = 40 }: { initial: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {initial}
    </span>
  );
}

export function ArrowRight({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
