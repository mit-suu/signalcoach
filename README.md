# SignalCoach

Luyện phản xạ phỏng vấn người dùng: một persona AI cố ý thả các *tín hiệu* vào cuộc trò chuyện,
người luyện phải nhận ra và hỏi sâu; sau buổi, scorecard chỉ ra tín hiệu đã bắt/bỏ lỡ và câu hỏi cần
viết lại. PRD: `../docs/prd.vi.md` · Design: `../Design/Design/SignalCoach MVP -VI-.dc.html`.

```
client/   Next.js 16 (App Router) — UI, deploys to Vercel
server/   Express 5 + MongoDB (Mongoose) + session agent — deploys to Azure App Service
docs/     DEPLOY.md
```

## Run locally

Prereqs: Node 22+, and MongoDB on `localhost:27017` — either `docker compose up -d mongo`
or, without Docker, `npm run db:memory` in `server/` (throwaway, data lost on exit).

```bash
# API  → http://localhost:4000
cd server
cp .env.example .env          # set JWT_SECRET; LLM_PROVIDER=mock works offline
npm install
npm run dev

# Web  → http://localhost:3000  (proxies /api/* to the API)
cd client
cp .env.example .env.local
npm install
npm run dev
```

To use the real model, set in `server/.env`: `LLM_PROVIDER=openai_compatible`, `LLM_BASE_URL`,
`LLM_API_KEY`, `LLM_MODEL_PERSONA` (GLM on Modal exposes an OpenAI-compatible `/v1`).

| | client | server |
|---|---|---|
| dev | `npm run dev` | `npm run dev` |
| build | `npm run build` | `npm run build` |
| lint / types | `npm run lint` | `npm run typecheck` |
| tests | — | `npm test` (in-memory Mongo) |

## Server layout

```
server/
  content/            guides/*.json, principles.json — static, validated at boot
  scripts/            memory-db.ts
  test/               API integration tests (supertest + mongodb-memory-server)
  src/
    server.ts         boot: env → content → Mongo → listen, graceful shutdown
    app.ts            express app: helmet, cors, logging, json, cookies, /api, errors
    config/           env.ts (Zod-validated env) · db.ts · logger.ts
    routes/           URL → middleware → controller wiring
    controllers/      HTTP in/out only (parse req, shape response)
    services/         business logic + data access (auth, token, session, content)
    agent/            session agent: turnRunner (per-turn pipeline), personaPrompt
                      → next: judge, stateMachine (pure, unit-tested), selfCheck, scorecard
    lib/llm.ts        the single LLM port (OpenAI-compatible | mock)
    models/           Mongoose schemas (users, sessions)
    middleware/       auth (identify / requireAccount), validate (Zod), errorHandler
    schemas/          Zod request DTOs
    types/            domain enums, content schemas
    utils/            errors (AppError), sse
```

Dependency direction: `routes → controllers → services/agent → models, lib`; `agent` never imports
Express; `config` is imported by anyone, imports nobody.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | DB + LLM mode (Azure health check) |
| GET | `/api/guides`, `/api/guides/:id`, `/api/principles` | public content (no signal contents) |
| POST | `/api/auth/register` · `/login` · `/logout` | access token (JWT) in httpOnly cookie, also returned in body |
| GET | `/api/auth/me` | `{ anonymous, user }` |
| GET/POST/DELETE | `/api/sessions` | list · create `{guideId}` · delete all |
| GET/DELETE | `/api/sessions/:id` | |
| POST | `/api/sessions/:id/turns` | `{text, clientMessageId}` → SSE `accepted · delta* · done \| error` |
| POST | `/api/sessions/:id/end` | final status (scorecard: TODO) |

Errors: `{ "error": { "code", "message", "details?" } }`.

### Auth model

- No sign-up wall (FR-12): the first request mints an **anonymous** access token (cookie, 180 d).
- **Register** turns that anonymous id into the account id → practice history is kept.
- **Login** from another browser moves that browser's anonymous sessions onto the account.
- **Access token only**, no refresh token: when it expires (`JWT_EXPIRES_IN`, default 7 d) the
  visitor is anonymous again and logs in. `Authorization: Bearer <token>` is accepted too.

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md) — Atlas, Azure App Service env/settings, Vercel, smoke test.
