# SignalCoach

Luyện phản xạ phỏng vấn người dùng: một persona AI cố ý thả các *tín hiệu* vào cuộc trò chuyện,
người luyện phải nhận ra và hỏi sâu; sau buổi, scorecard chỉ ra tín hiệu đã bắt/bỏ lỡ, câu hỏi cần
viết lại (dẫn về thư viện nguyên tắc) và trọng tâm cho buổi sau.

PRD: [`../docs/prd.vi.md`](../docs/prd.vi.md) · Design: `../Design/Design/SignalCoach MVP -VI-.dc.html` ·
Cơ chế agent: [docs/AGENT.md](docs/AGENT.md) · Kịch bản demo + hạn chế: [docs/DEMO.md](docs/DEMO.md) ·
Deploy: [docs/DEPLOY.md](docs/DEPLOY.md)

```
client/   Next.js 16 (App Router) — UI, deploy Vercel
server/   Express 5 + MongoDB (Mongoose) + session agent trên Gemini — deploy Azure App Service
docs/     AGENT.md · DEMO.md · DEPLOY.md
```

## Chạy local

Cần Node 22+, một MongoDB (Atlas hoặc local) và một Gemini API key
([aistudio.google.com](https://aistudio.google.com/)).

```bash
# API  → http://localhost:4000
cd server
cp .env.example .env     # điền MONGODB_URI, JWT_SECRET, GEMINI_API_KEYS
npm install
npm run dev

# Web  → http://localhost:3000  (proxy /api/* sang API)
cd client
cp .env.example .env.local
npm install
npm run dev
```

Không có MongoDB? `npm run db:memory` trong `server/` chạy một Mongo tạm (mất dữ liệu khi tắt) và giữ
`MONGODB_URI=mongodb://127.0.0.1:27017`. Không có key? `LLM_PROVIDER=mock` chạy toàn bộ pipeline với
model giả (dùng cho test và làm UI). `npm run llm:ping` đo độ trễ token đầu tiên của model đang cấu hình.

| | client | server |
|---|---|---|
| dev | `npm run dev` | `npm run dev` |
| build | `npm run build` | `npm run build` |
| lint / types | `npm run lint` | `npm run typecheck` |
| tests | — | `npm test` (Mongo in-memory, model mock) |

## Tính năng

- **Buổi luyện** với persona AI, trả lời streaming; câu hỏi được giữ lại khi model lỗi, quay lại được
  khi đóng tab (FR-1, FR-4, NFR-3).
- **Agent một vòng lặp mỗi lượt**: judge → state machine → persona → lưu; thả tín hiệu đúng lúc, trả lời
  ngắn với câu dẫn dắt/đóng, hỏi lại khi câu gộp hai ý, giữ vai khi bị phá (FR-2, FR-3, FR-5).
- **Scorecard tự kiểm tra**: mọi kết luận có trích dẫn từ hội thoại, mọi góp ý dẫn về một nguyên tắc
  trong thư viện (tool `lookup_interview_principle`), câu gợi ý không trùng câu đã hỏi; nhật ký
  tự kiểm tra xem được trên trang hội thoại (FR-6, FR-7, FR-9, FR-10).
- **3 kịch bản dựng sẵn** (chi tiêu, tập luyện, quản lý dự án), mỗi kịch bản 6 tín hiệu × 3 lớp (FR-8).
- **Tạo kịch bản từ sản phẩm của bạn**: agent dựng persona + 6 tín hiệu từ mô tả sản phẩm và người
  dùng, kiểm tra cấu trúc trước khi lưu, hỏi lại khi mô tả quá mơ hồ (v1.1 trong PRD, đã làm).
- **Lịch sử + trọng tâm**, xoá từng buổi hoặc tất cả; luyện ngay không cần tài khoản, đăng ký để giữ
  lịch sử qua nhiều máy (FR-11, FR-12).

## Server layout

```
server/
  content/            guides/*.json, principles.json — tĩnh, kiểm tra schema lúc khởi động
  scripts/            memory-db.ts · llm-ping.ts · review-bench.ts
  test/               stateMachine (unit) · selfCheck (unit) · api (integration, supertest + mongodb-memory-server)
  src/
    server.ts         boot: env → content → Mongo → listen, graceful shutdown
    app.ts            express app: helmet, cors, logging, json, cookies, /api, errors
    config/           env.ts (Zod, model/thinking theo vai) · db.ts · logger.ts
    routes/           URL → middleware → controller
    controllers/      HTTP in/out (sessions, guides, auth, health); view ẩn trạng thái tín hiệu khi buổi còn active
    services/         auth, token, session, guide (built-in + do người dùng tạo), content (+ lookupPrinciple)
    agent/            judge.ts · stateMachine.ts (pure) · personaPrompt.ts · turnRunner.ts
                      review.ts (review + self-check) · scoring.ts · guideGenerator.ts
    lib/llm.ts        cổng LLM duy nhất: gemini (nhiều key, fallback model, retry) | openai_compatible | mock
    models/           Mongoose: users, sessions (snapshot guide + turns + signal state + decision log), guides
    middleware/       auth (identify / requireAccount), validate (Zod), errorHandler
    schemas/          Zod request DTOs
    types/            domain enums + ngưỡng, content schemas, scorecard
    utils/            errors (AppError), sse
```

Hướng phụ thuộc: `routes → controllers → services/agent → models, lib`; `agent` không import Express;
`config` được mọi nơi import, không import ai.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | DB + LLM provider (Azure health check) |
| GET | `/api/principles` | thư viện nguyên tắc |
| GET | `/api/guides`, `/api/guides/:id` | kịch bản dựng sẵn + của người dùng (không lộ nội dung tín hiệu) |
| POST | `/api/guides/generate` | `{product, audience, goal?, notes?}` → `{guide}` hoặc `{clarify}` |
| DELETE | `/api/guides/:id` | xoá kịch bản của mình (các buổi đã luyện vẫn còn) |
| POST | `/api/auth/register` · `/login` · `/logout` | access token (JWT) trong cookie httpOnly, cũng trả trong body |
| GET | `/api/auth/me` | `{ anonymous, user }` |
| GET/POST/DELETE | `/api/sessions` | danh sách · tạo `{guideId}` · xoá tất cả |
| GET/DELETE | `/api/sessions/:id` | khi buổi đã kết thúc trả thêm scorecard, quyết định + tool call từng lượt, nhật ký tự kiểm tra |
| POST | `/api/sessions/:id/turns` | `{text, clientMessageId}` → SSE `accepted · delta* · done \| error` |
| POST | `/api/sessions/:id/end` | đóng buổi, chạy review + self-check → scorecard |
| POST | `/api/sessions/:id/scorecard` | tạo lại scorecard nếu lần trước lỗi |

Lỗi: `{ "error": { "code", "message", "details?" } }`.

### Auth

- Không có bước đăng ký (FR-12): request đầu tiên nhận một **token ẩn danh** (cookie, 180 ngày).
- **Đăng ký** biến id ẩn danh thành id tài khoản → lịch sử giữ nguyên.
- **Đăng nhập** ở máy khác gộp các buổi ẩn danh của máy đó vào tài khoản.
- Chỉ access token, không refresh token: hết hạn (`JWT_EXPIRES_IN`, mặc định 7 ngày) thì thành ẩn danh
  và đăng nhập lại. Nhận cả `Authorization: Bearer <token>`.

### LLM

`LLM_PROVIDER=gemini` với `GEMINI_API_KEYS=key1,key2` (key sau được dùng khi key trước bị từ chối hoặc
hết quota). Model mặc định theo vai, đo ngày 2026-10-09: persona `gemini-3.5-flash` thinking *minimal*
(~1 s tới token đầu), judge `gemini-3.5-flash-lite` *minimal* (~1.2 s), review `gemini-3.5-flash` *high*
(~20 s cho cả buổi). Khi model quá tải (503) tự chuyển sang `LLM_MODEL_FALLBACKS`. Xem `server/.env.example`.
