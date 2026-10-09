"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { BrandMark } from "./BrandMark";

const LINKS = [
  { href: "/", label: "Luyện tập", match: (p: string) => p === "/" || p.startsWith("/guides") },
  { href: "/history", label: "Lịch sử", match: (p: string) => p.startsWith("/history") || p.startsWith("/session") },
  { href: "/principles", label: "Nguyên tắc", match: (p: string) => p.startsWith("/principles") },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();

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
