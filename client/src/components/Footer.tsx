"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "./BrandMark";

// Phòng luyện tập live (/session/[id]) chiếm trọn chiều cao màn hình — không chèn footer vào đó.
const isSessionRoom = (p: string) => /^\/session\/[^/]+\/?$/.test(p);

export function Footer() {
  const pathname = usePathname();
  if (isSessionRoom(pathname)) return null;

  return (
    <footer className="app-footer">
      <div className="footer-brand">
        <Link href="/" className="brand">
          <BrandMark size={24} />
          SignalCoach
        </Link>
        <p className="muted">Luyện nghe những điều người dùng suýt nói ra.</p>
      </div>
      <p className="footer-meta muted">© 2026 SignalCoach</p>
    </footer>
  );
}
