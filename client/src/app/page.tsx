"use client";

import { LoadingState } from "@/components/LoadingState";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PublicGuide } from "@/types/api";
import { ArrowRight, Avatar, CheckIcon, CrossIcon } from "@/components/BrandMark";
import { plain, shortName } from "@/lib/labels";

/**
 * Home: what the product does in one sentence, a demo exchange, the 3 steps, what a "manh mối" is
 * (with a good and a bad follow-up), then the simulated users to pick from — no sign-up needed.
 */
export default function HomePage() {
  const [guides, setGuides] = useState<PublicGuide[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.guides().then(setGuides).catch((e: Error) => setError(e.message));
  }, []);

  const builtIn = (guides ?? []).filter((g) => !g.custom);
  const mine = (guides ?? []).filter((g) => g.custom);
  const first = builtIn[0];

  return (
    <>
      <div className="wrap">
        <section className="hero">
          <div>
            <p className="eyebrow">Luyện phỏng vấn người dùng</p>
            <h1>
              Phỏng vấn một người dùng AI. <em>Xem mình đã bỏ lỡ điều gì.</em>
            </h1>
            <p className="lead">
              Bạn hỏi chuyện một người dùng giả lập trong khoảng 15 phút. Sau buổi, SignalCoach chỉ ra những chi tiết quan trọng họ đã nhắc mà bạn chưa hỏi tới, và câu nên hỏi lại.
            </p>
            <div className="cta">
              <Link href={first ? `/guides/${first.id}` : "#chon-nguoi"} className="btn btn-primary">
                Bắt đầu buổi đầu tiên <ArrowRight />
              </Link>
              <a href="#manh-moi" className="btn btn-ghost">Manh mối là gì?</a>
            </div>
            <p className="note">Miễn phí · không cần đăng ký · chat bằng chữ</p>
          </div>

          <div className="hero-demo" aria-label="Ví dụ một đoạn phỏng vấn">
            <div className="demo-msg">
              <span className="who"><Avatar initial="M" size="sm" />Mai, 38</span>
              <p>Năm ngoái mình thử ba cái app, cài xong được vài hôm là bỏ. Nhập chi tiêu mỗi tối cứ như <mark>làm bài tập về nhà</mark> ấy.</p>
            </div>
            <div className="demo-msg user">
              <span className="who">Bạn</span>
              <p>Lần gần nhất chị bỏ nhập là khi nào? Hôm đó thế nào?</p>
            </div>
            <div className="demo-result"><CheckIcon /> Tìm được một manh mối: Mai bắt đầu kể chuyện thật</div>
          </div>
        </section>
      </div>

      <section className="band steps">
        <div className="wrap">
          <h2>Một buổi luyện có 3 bước</h2>
          <ol>
            <li>
              <span className="num">1</span>
              <h3>Chọn người để phỏng vấn</h3>
              <p>Chọn một trong ba người dùng có sẵn, hoặc mô tả sản phẩm của bạn để tạo người dùng riêng.</p>
            </li>
            <li>
              <span className="num">2</span>
              <h3>Hỏi chuyện khoảng 15 phút</h3>
              <p>Chat như phỏng vấn thật. Họ phản ứng theo cách bạn hỏi: hỏi gợi ý sẵn thì họ trả lời qua loa.</p>
            </li>
            <li>
              <span className="num">3</span>
              <h3>Xem bảng đánh giá</h3>
              <p>Bạn tìm được chi tiết nào, bỏ lỡ chi tiết nào, và 3 câu nên hỏi khác đi ở buổi sau.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="explain-band" id="manh-moi">
        <div className="wrap explain">
          <div>
            <p className="eyebrow">Manh mối là gì?</p>
            <h2>Người dùng hiếm khi nói thẳng vấn đề. Họ chỉ nhắc thoáng qua.</h2>
            <p className="explain-text">
              Mỗi người dùng trong SignalCoach giấu 6 chi tiết quan trọng, gọi là <strong>manh mối</strong>. Họ chỉ nhắc lướt một lần. Bạn hỏi sâu đúng lúc thì họ kể tiếp. Bạn lướt qua thì chi tiết đó trôi mất, giống hệt phỏng vấn thật.
            </p>
            <p className="explain-text"><strong>Mai giấu 6 manh mối. Hỏi đúng thì bạn tìm ra.</strong></p>
          </div>
          <div className="compare">
            <blockquote className="said">
              “Nhập chi tiêu mỗi tối cứ như làm bài tập về nhà ấy.” <cite>— Mai</cite>
            </blockquote>
            <div className="ans good">
              <span className="ans-label"><CheckIcon /> Hỏi sâu: tìm được</span>
              <p className="q">“Lần gần nhất chị bỏ nhập là khi nào?”</p>
              <p className="r">Mai kể tiếp: tháng trước đi công tác 3 ngày, về không nhớ nổi đã tiêu gì, thế là bỏ luôn.</p>
            </div>
            <div className="ans bad">
              <span className="ans-label"><CrossIcon /> Hỏi chuyện giả định: bỏ lỡ</span>
              <p className="q">“Nếu app tự nhập giúp thì chị có dùng không?”</p>
              <p className="r">Mai: “Chắc là có.” Một câu trả lời cho lịch sự, không có gì mới.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="chon-nguoi">
        <div className="wrap">
          <div className="sec-head">
            <h2>Chọn người để phỏng vấn</h2>
            <p className="muted">Mỗi buổi khoảng 15 phút</p>
          </div>
          {error && <div className="error-banner">Chưa tải được danh sách người dùng. {error}</div>}
          <div className="guide-cards">
            {builtIn.map((g, i) => (
              <GuideCard key={g.id} guide={g} tone={i + 1} primary={i === 0} />
            ))}
            {!guides && !error && <LoadingState label="Đang tìm người để bạn phỏng vấn…" compact />}
            <article className="card card-dashed guide-card">
              <div className="card-top">
                <span className="avatar avatar-plus">+</span>
                <div>
                  <b>Sản phẩm của bạn</b>
                  <span>Tạo trong khoảng 30 giây</span>
                </div>
              </div>
              <h3>Luyện với chính người dùng của bạn</h3>
              <p className="card-body">Mô tả sản phẩm và người bạn sắp phỏng vấn. SignalCoach tạo một người dùng riêng giấu 6 manh mối.</p>
              <Link href="/guides/new" className="btn btn-secondary">
                Tạo người dùng riêng <ArrowRight />
              </Link>
            </article>
          </div>

          {mine.length > 0 && (
            <>
              <div className="sec-head sec-head-sub">
                <h3>Người dùng bạn đã tạo</h3>
                <p className="muted">Chỉ bạn thấy</p>
              </div>
              <div className="guide-cards">
                {mine.map((g, i) => (
                  <GuideCard key={g.id} guide={g} tone={i + 2} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

function GuideCard({ guide: g, tone, primary }: { guide: PublicGuide; tone: number; primary?: boolean }) {
  const name = shortName(g.persona.name);
  return (
    <article className="card guide-card">
      <div className="card-top">
        <Avatar initial={g.persona.initial} tone={tone} />
        <div>
          <b>{name}, {g.persona.age}</b>
          <span>{g.persona.tagline}</span>
        </div>
      </div>
      <h3>{g.title}</h3>
      <p className="card-body">{plain(g.goal, name)}</p>
      <Link href={`/guides/${g.id}`} className={`btn ${primary ? "btn-primary" : "btn-secondary"}`}>
        Phỏng vấn {name} <ArrowRight />
      </Link>
    </article>
  );
}
