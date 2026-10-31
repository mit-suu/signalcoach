import type { Metadata } from "next";
import { Suspense } from "react";
import { Lexend, Nunito } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import "@/styles/coach.css";
import "./globals.css";
import "./screens.css";

// Coach design: Lexend for headings and buttons, Nunito for body text (both variable fonts).
const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin", "vietnamese"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "SignalCoach",
  description: "Phỏng vấn một người dùng AI trong khoảng 15 phút, rồi xem mình đã bỏ lỡ điều gì và nên hỏi lại thế nào.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${lexend.variable} ${nunito.variable}`}>
      <body>
        <AuthProvider>
          {/* Nav and Footer read usePathname(); with cacheComponents they must sit in Suspense
              or prerendering dynamic routes (/guides/[guideId]) fails. */}
          <Suspense fallback={<nav className="app-nav" />}>
            <Nav />
          </Suspense>
          <main className="app-main">{children}</main>
          <Suspense fallback={null}>
            <Footer />
          </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
