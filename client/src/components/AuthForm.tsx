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
    <div className="wrap page auth">
      <div className="auth-intro">
        <p className="eyebrow">{isRegister ? "Đăng ký" : "Đăng nhập"}</p>
        <h1>{isRegister ? "Giữ lịch sử luyện tập của bạn." : "Chào mừng bạn quay lại."}</h1>
        <p className="lead">
          {isRegister
            ? "Không bắt buộc: bạn vẫn luyện được mà không cần tài khoản. Đăng ký để giữ các buổi đã luyện trên trình duyệt này và mở lại ở máy khác."
            : "Các buổi bạn vừa luyện trên trình duyệt này sẽ được gộp vào tài khoản."}
        </p>
      </div>
      <form className="card auth-form" onSubmit={submit}>
        {isRegister && (
          <div className="field">
            <label htmlFor="displayName">Tên hiển thị (không bắt buộc)</label>
            <input id="displayName" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Mật khẩu{isRegister ? " (ít nhất 8 ký tự)" : ""}</label>
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
        {error && <div className="error-banner" role="alert">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Đang xử lý…" : isRegister ? "Đăng ký" : "Đăng nhập"} <ArrowRight />
        </button>
        <p className="small">
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
