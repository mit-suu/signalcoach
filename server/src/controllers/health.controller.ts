import type { Request, Response } from "express";
import { dbState } from "../config/db";
import { env } from "../config/env";

/** Used by Azure App Service Health check (Monitoring → Health check → path /api/health). */
export function health(_req: Request, res: Response) {
  const db = dbState();
  res.status(db === "connected" ? 200 : 503).json({
    status: db === "connected" ? "ok" : "degraded",
    db,
    llm: env.LLM_PROVIDER,
    uptime: Math.round(process.uptime()),
  });
}
