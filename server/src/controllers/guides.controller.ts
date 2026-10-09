import type { Request, Response } from "express";
import { userId } from "../middleware/auth";
import * as guides from "../services/guide.service";
import { listPrinciples } from "../services/content.service";

export async function list(req: Request, res: Response) {
  res.json({ guides: await guides.listGuidesFor(userId(req)) });
}

export async function getById(req: Request<{ id: string }>, res: Response) {
  res.json({ guide: await guides.getGuideView(userId(req), req.params.id) });
}

/**
 * POST /guides/generate — the agent writes a guide from the user's product brief.
 * 200 { guide } when a valid guide was produced and saved; 200 { clarify } when the brief was too
 * vague and the agent asks a question instead of inventing (addendum: "vague input triggers a
 * clarifying question").
 */
export async function generate(req: Request, res: Response) {
  const result = await guides.createGuideFromBrief(userId(req), req.body);
  if (result.kind === "clarify") {
    res.json({ clarify: result.question });
    return;
  }
  res.status(201).json({ guide: result.guide });
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  await guides.deleteGuide(userId(req), req.params.id);
  res.status(204).end();
}

export function principles(_req: Request, res: Response) {
  res.json({ principles: listPrinciples() });
}
