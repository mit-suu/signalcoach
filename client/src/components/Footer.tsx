"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "./BrandMark";

// The live interview room (/session/[id]) fills the screen — no footer there.
const isSessionRoom = (p: string) => /^\/session\/[^/]+\/?$/.test(p);

export function Footer() {
  const pathname = usePathname();
  if (isSessionRoom(pathname)) return null;

  return (
    <footer className="app-footer">
      <div className="wrap">
        <Link href="/" className="brand">
          <BrandMark size={22} />
          SignalCoach
        </Link>
        <span>— luyện phỏng vấn người dùng · © 2026</span>
      </div>
    </footer>
  );
}
