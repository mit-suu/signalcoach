export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
      <rect x="1" y="1" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="12" y="4" width="6" height="6" fill="var(--color-accent)" />
    </svg>
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
