import type { Metadata } from "next";
import { Suspense } from "react";
import { Archivo } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { Nav } from "@/components/Nav";
import "@/styles/modernist.css";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600", "800"],
});

export const metadata: Metadata = {
  title: "SignalCoach",
  description: "Luyện nghe những điều người dùng suýt nói ra.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={archivo.variable}>
      <body>
        <AuthProvider>
          <Suspense fallback={<nav className="nav app-nav" />}>
            <Nav />
          </Suspense>
          <main className="app-main">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
