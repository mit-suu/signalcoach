import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import type { Guide } from "../types/content";

/**
 * User-generated interview guides (the built-in three live in server/content).
 * The guide body is validated against GuideSchema before insert; sessions snapshot it,
 * so deleting a guide never breaks history.
 */
const guideSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    guide: { type: Schema.Types.Mixed, required: true },
    brief: {
      product: String,
      audience: String,
      goal: String,
      notes: String,
    },
  },
  { timestamps: true },
);

export type GuideRecord = Omit<InferSchemaType<typeof guideSchema>, "guide"> & { guide: Guide };
export type GuideDoc = HydratedDocument<GuideRecord>;
export const GuideModel = model("Guide", guideSchema);
