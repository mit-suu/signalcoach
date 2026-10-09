"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { ArrowRight } from "./BrandMark";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await register(email, password, displayName || undefined);
      else await login(email, password);
      router.push("/history");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div style={{ gridColumn: "1 / span 6" }}>
        <h1>{isRegister ? "Giữ lịch sử luyện tập của bạn." : "Chào mừng quay lại."}</h1>
        <p className="muted">
          {isRegister
            ? "Không bắt buộc — bạn vẫn luyện được mà không cần tài khoản. Đăng ký để giữ các buổi đã luyện trên trình duyệt này và mở lại ở máy khác."
            : "Các buổi bạn vừa luyện trên trình duyệt này sẽ được gộp vào tài khoản."}
        </p>
      </div>
      <form className="auth-form" onSubmit={submit}>
        {isRegister && (
          <div className="field">
            <label htmlFor="displayName">Tên hiển thị (tuỳ chọn)</label>
            <input id="displayName" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Mật khẩu{isRegister ? " (tối thiểu 8 ký tự)" : ""}</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isRegister ? 8 : 1}
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </div>
        {error && <div className="tag tag-accent" style={{ padding: "8px 12px", fontSize: 13 }}>{error}</div>}
        <button className="btn btn-primary btn-wide" disabled={busy}>
          {busy ? "Đang xử lý…" : isRegister ? "Đăng ký" : "Đăng nhập"}
          <ArrowRight />
        </button>
        <p className="muted" style={{ fontSize: 13 }}>
          {isRegister ? (
            <>Đã có tài khoản? <Link href="/login">Đăng nhập</Link></>
          ) : (
            <>Chưa có tài khoản? <Link href="/register">Đăng ký</Link></>
          )}
        </p>
      </form>
    </div>
  );
}
