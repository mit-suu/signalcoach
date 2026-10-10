import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import type { SelfCheckEntry } from "../types/scorecard";
import type { TranscriptResult, TranscriptTurn } from "../types/transcript";

/**
 * Analyses of real interview transcripts, owned like sessions (anonymous identities included,
 * moved onto the account at login, removed by "Xoá lịch sử"). Turns are stored parsed; the
 * self-checked result and its correction log are Mixed payloads.
 */
const transcriptSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, required: true },
    me: { type: String, required: true },
    turns: { type: Schema.Types.Mixed, required: true },
    result: { type: Schema.Types.Mixed, required: true },
    selfCheckLog: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true },
);

export type TranscriptRecord = Omit<InferSchemaType<typeof transcriptSchema>, "turns" | "result" | "selfCheckLog"> & {
  turns: TranscriptTurn[];
  result: TranscriptResult;
  selfCheckLog: SelfCheckEntry[];
};
export type TranscriptDoc = HydratedDocument<TranscriptRecord>;
export const TranscriptModel = model("Transcript", transcriptSchema);
