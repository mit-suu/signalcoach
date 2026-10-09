import Link from "next/link";

export default function NotFound() {
  return (
    <div className="state-msg">
      <h2>Không tìm thấy trang này</h2>
      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/history" className="btn btn-secondary">Về lịch sử</Link>
        <Link href="/" className="btn btn-primary">Luyện buổi mới</Link>
      </div>
    </div>
  );
}
