import { Types } from "mongoose";
import { GuideModel } from "../models/guide.model";
import { generateGuide, type GuideBrief, type GuideGenerationResult } from "../agent/guideGenerator";
import { listGuides as listBuiltIn, toPublicGuide, tryGetGuide } from "./content.service";
import type { Guide } from "../types/content";
import { notFound } from "../utils/errors";

const oid = (id: string) => new Types.ObjectId(id);

export interface PublicGuideView extends ReturnType<typeof toPublicGuide> {
  custom: boolean;
  createdAt: string | null;
}

const view = (guide: Guide, custom: boolean, createdAt?: Date): PublicGuideView => ({
  ...toPublicGuide(guide),
  custom,
  createdAt: createdAt?.toISOString() ?? null,
});

/** Built-in guides first, then the user's own, newest first. */
export async function listGuidesFor(userId: string): Promise<PublicGuideView[]> {
  const mine = await GuideModel.find({ ownerId: oid(userId) }).sort({ createdAt: -1 }).lean();
  return [...listBuiltIn().map((g) => view(g, false)), ...mine.map((m) => view(m.guide as Guide, true, m.createdAt))];
}

/** Resolve a guide id the way sessions do: built-in by slug, otherwise one the user owns. */
export async function resolveGuide(userId: string, guideId: string): Promise<{ guide: Guide; custom: boolean; createdAt?: Date }> {
  const builtIn = tryGetGuide(guideId);
  if (builtIn) return { guide: builtIn, custom: false };
  if (!Types.ObjectId.isValid(guideId)) throw notFound("Guide");
  const mine = await GuideModel.findOne({ _id: oid(guideId), ownerId: oid(userId) }).lean();
  if (!mine) throw notFound("Guide");
  return { guide: mine.guide as Guide, custom: true, createdAt: mine.createdAt };
}

export async function getGuideView(userId: string, guideId: string): Promise<PublicGuideView> {
  const { guide, custom, createdAt } = await resolveGuide(userId, guideId);
  return view(guide, custom, createdAt);
}

export async function createGuideFromBrief(userId: string, brief: GuideBrief): Promise<{ kind: "guide"; guide: PublicGuideView } | { kind: "clarify"; question: string }> {
  const result: GuideGenerationResult = await generateGuide(brief);
  if (result.kind === "clarify") return result;
  const doc = await GuideModel.create({ _id: oid(result.guide.id), ownerId: oid(userId), guide: result.guide, brief });
  return { kind: "guide", guide: view(result.guide, true, doc.createdAt) };
}

export async function deleteGuide(userId: string, guideId: string): Promise<void> {
  if (!Types.ObjectId.isValid(guideId)) throw notFound("Guide");
  const { deletedCount } = await GuideModel.deleteOne({ _id: oid(guideId), ownerId: oid(userId) });
  if (!deletedCount) throw notFound("Guide");
}
