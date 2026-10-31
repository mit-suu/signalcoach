import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap state-msg">
      <p className="eyebrow">Không tìm thấy</p>
      <h2>Trang này không có hoặc đã bị xoá</h2>
      <div className="cta">
        <Link href="/" className="btn btn-primary">Luyện buổi mới</Link>
        <Link href="/history" className="btn btn-secondary">Về lịch sử</Link>
      </div>
    </div>
  );
}
