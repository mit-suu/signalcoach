import type { Request, Response } from "express";
import { userId } from "../middleware/auth";
import * as transcripts from "../services/transcript.service";

type IdReq = Request<{ id: string }>;

/** GET /transcripts/samples — built-in sample transcripts (known answers stay server-side). */
export function samples(_req: Request, res: Response) {
  res.json({ samples: transcripts.listSamples() });
}

/** POST /transcripts — parse, analyse, self-check and save. 201 { analysis }. */
export async function create(req: Request, res: Response) {
  const analysis = await transcripts.createAnalysis(userId(req), req.body);
  res.status(201).json({ analysis });
}

export async function list(req: Request, res: Response) {
  res.json({ analyses: await transcripts.listAnalyses(userId(req)) });
}

export async function get(req: IdReq, res: Response) {
  res.json({ analysis: await transcripts.getAnalysis(userId(req), req.params.id) });
}

export async function remove(req: IdReq, res: Response) {
  await transcripts.deleteAnalysis(userId(req), req.params.id);
  res.status(204).end();
}
