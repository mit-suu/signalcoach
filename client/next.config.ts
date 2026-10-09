import type { NextConfig } from "next";

/**
 * The browser only ever talks to this origin: /api/* is proxied to the Express API
 * (Azure App Service in prod, localhost:4000 in dev). Same origin ⇒ the httpOnly
 * auth cookie works with SameSite=Lax and no CORS.
 * API_ORIGIN is read at build time — set it in Vercel before deploying.
 */
const apiOrigin = (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
