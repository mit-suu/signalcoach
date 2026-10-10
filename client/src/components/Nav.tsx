"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { BrandMark } from "./BrandMark";

const LINKS = [
  { href: "/", label: "Luyện tập", match: (p: string) => p === "/" || p.startsWith("/guides") },
  { href: "/history", label: "Lịch sử", match: (p: string) => p.startsWith("/history") || p.startsWith("/session") },
  { href: "/principles", label: "Nguyên tắc", match: (p: string) => p.startsWith("/principles") },
];

const noopSubscribe = () => () => {};

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  // Nav sits in Suspense, so it can hydrate after AuthProvider has already resolved /me.
  // Render the server's "loading" output until hydrated, or the auth links mismatch.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const loading = authLoading || !hydrated;

  return (
    <nav className="nav app-nav">
      <Link href="/" className="nav-brand brand">
        <BrandMark />
        SignalCoach
      </Link>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(pathname) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      <span className="nav-divider" aria-hidden />
      {loading ? null : user ? (
        <>
          <span className="nav-user">{user.displayName ?? user.email}</span>
          <button
            className="btn btn-ghost"
            onClick={async () => {
              await logout();
              router.push("/");
            }}
          >
            Đăng xuất
          </button>
        </>
      ) : (
        <>
          <Link href="/login" aria-current={pathname === "/login" ? "page" : undefined}>
            Đăng nhập
          </Link>
          <Link href="/register" className="btn btn-secondary">
            Đăng ký
          </Link>
        </>
      )}
    </nav>
  );
}
