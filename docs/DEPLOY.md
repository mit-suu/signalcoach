# Deploy

```
Browser ──► Vercel (client/, Next.js) ──/api/* rewrite──► Azure App Service (server/, Express) ──► MongoDB Atlas
                                                                    └──► Google Gemini API
```

The browser only talks to the Vercel origin. `/api/*` is proxied to Azure, so the auth cookie is
first-party (`SameSite=Lax`) and no CORS is needed.

---

## 1. MongoDB Atlas

1. Create a cluster → **Database Access**: add a user (password auth).
2. **Network Access**: allow the App Service outbound IPs
   (Azure portal → Web App → *Networking* → *Outbound addresses*), or `0.0.0.0/0` for the demo.
3. **Connect → Drivers** → copy the `mongodb+srv://…` URI → this is `MONGODB_URI`.
   The database name comes from `MONGODB_DB_NAME`, not the URI path.

Later, for RAG: the same cluster supports Atlas Vector Search; no code change to the connection.

## 2. API — Azure App Service (`server/`)

**Create:** Web App · Publish *Code* · Runtime **Node 22 LTS** · OS **Linux** · plan **B1 or higher**
(Free F1 has no *Always On*, so the app unloads when idle and the first request is slow).

**Configuration → General settings**
- Startup command: `npm start`
- Always On: **On**
- Health check (Monitoring → Health check): path `/api/health`

**Settings → Environment variables → App settings** (see `server/.env.example` for the full list)

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `MONGODB_URI` | Atlas URI |
| `MONGODB_DB_NAME` | `signalcoach` |
| `JWT_SECRET` | 48+ random chars — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `JWT_EXPIRES_IN` | `7d` |
| `ANON_TOKEN_EXPIRES_IN` | `180d` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | `lax` |
| `TRUST_PROXY` | `1` |
| `CORS_ORIGINS` | *(empty — traffic comes through the Vercel rewrite)* |
| `LLM_PROVIDER` | `gemini` (`mock` is refused in production) |
| `GEMINI_API_KEYS` | one or more keys, comma-separated (backup key used on 401/403/429) |
| `LLM_MODEL_PERSONA` / `_JUDGE` / `_REVIEW` | leave empty for the defaults (`gemini-3.5-flash` / `gemini-3.5-flash-lite` / `gemini-3.5-flash`) |
| `LLM_MODEL_FALLBACKS` | empty = `gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite` |
| `LLM_REASONING_PERSONA` / `_JUDGE` / `_REVIEW` | `minimal` / `minimal` / `high` |
| `LLM_TIMEOUT_MS` | `60000` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` — we upload a prebuilt package (below) |

`PORT` is injected by Azure; don't set it. The server validates env at boot and exits with a list
of what's wrong — check **Log stream** if the app won't start.

**Deploy** — build locally, upload a zip that already contains `dist/` + production `node_modules`
(all dependencies are pure JS, so a package built on Windows runs on Linux):

```powershell
cd server
npm ci; npm run build; npm prune --omit=dev
# not Compress-Archive: on Windows PowerShell 5.1 it writes "\" separators, which break on Linux
tar.exe -a -cf ..\api.zip dist content node_modules package.json package-lock.json
az webapp deploy --resource-group <rg> --name <app> --src-path ..\api.zip --type zip
npm ci   # restore dev dependencies for local work
```

Or push to `main` and let [.github/workflows/deploy-api.yml](../.github/workflows/deploy-api.yml) do it
(needs repo secrets `AZURE_WEBAPP_NAME` and `AZURE_WEBAPP_PUBLISH_PROFILE`; download the publish
profile from the Web App *Overview* page, which requires *SCM Basic Auth* enabled under
Configuration → General settings).

Check: `https://<app>.azurewebsites.net/api/health` → `{"status":"ok","db":"connected",…}`.

**Streaming note:** App Service closes idle connections after ~230 s; the SSE endpoint sends a
heartbeat every 15 s, so long LLM calls are fine.

## 3. Web — Vercel (`client/`)

1. Import the GitHub repo → **Root Directory: `client`** · Framework preset: Next.js (auto).
2. **Environment Variables** (Production + Preview):

   | Name | Value |
   |---|---|
   | `API_ORIGIN` | `https://<app>.azurewebsites.net` (no trailing slash, no `/api`) |

3. Deploy. `API_ORIGIN` is read when `next.config.ts` builds the rewrites — **redeploy after
   changing it**.

Check: open the site → pick a guide → ask a question; the reply should stream word by word.

## 4. After deploy — smoke test (SM-4)

- [ ] `/api/health` through the Vercel domain returns `ok`
- [ ] Start a session without signing up, ask 6+ questions, reply streams
- [ ] Reload mid-session → transcript is still there
- [ ] Register → the session is still in **Lịch sử**; log out → log in → still there
- [ ] Wrong password shows an error; no API key or token visible in browser JS (DevTools → Sources)

**Fallback if the Vercel → Azure proxy buffers or times out the SSE stream:** call Azure directly
from the browser — set `CORS_ORIGINS=https://<vercel-domain>`, `COOKIE_SAMESITE=none`,
`COOKIE_SECURE=true` on Azure, and point `client/src/lib/api.ts` at `NEXT_PUBLIC_API_ORIGIN`.
Third-party cookie blocking (Safari) makes this the less robust option, so try the rewrite first.
