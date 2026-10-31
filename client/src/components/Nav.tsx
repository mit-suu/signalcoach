"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { BrandMark } from "./BrandMark";

const LINKS = [
  { href: "/", label: "Luyện tập", match: (p: string) => p === "/" || p.startsWith("/guides") },
  { href: "/history", label: "Lịch sử", match: (p: string) => p.startsWith("/history") || p.startsWith("/session") },
  { href: "/transcripts/new", label: "Chấm buổi phỏng vấn thật", match: (p: string) => p.startsWith("/transcripts") },
  { href: "/principles", label: "Nguyên tắc hỏi", match: (p: string) => p.startsWith("/principles") },
];

const noopSubscribe = () => () => {};

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  // Nav sits in Suspense, so it can hydrate after AuthProvider has already resolved /me.
  // Render the server's "loading" output until hydrated, or the auth links mismatch.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const loading = authLoading || !hydrated;
  const close = () => setOpen(false);

  return (
    <nav className="app-nav" aria-label="Chính">
      <div className="wrap app-nav-inner">
        <Link href="/" className="brand" onClick={close}>
          <BrandMark />
          SignalCoach
        </Link>
        <button type="button" className="btn btn-secondary btn-sm nav-toggle" aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((v) => !v)}>
          {open ? "Đóng" : "Menu"}
        </button>
        <div id="nav-links" className="nav-links" data-open={open || undefined}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={l.match(pathname) ? "page" : undefined} onClick={close}>
              {l.label}
            </Link>
          ))}
          {loading ? null : user ? (
            <>
              <span className="nav-user">{user.displayName ?? user.email}</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  close();
                  await logout();
                  router.push("/");
                }}
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link href="/login" aria-current={pathname === "/login" ? "page" : undefined} onClick={close}>
                Đăng nhập
              </Link>
              <Link href="/register" className="btn btn-secondary btn-sm" onClick={close}>
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
