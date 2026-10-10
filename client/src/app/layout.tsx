import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import "@/styles/modernist.css";
import "./globals.css";
import "./screens.css";

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
          <Nav />
          <main className="app-main">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
