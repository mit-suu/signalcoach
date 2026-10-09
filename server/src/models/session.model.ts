import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import {
  AGENT_ACTIONS,
  QUESTION_TYPES,
  SESSION_STATUSES,
  SIGNAL_STATUSES,
  TOOL_NAMES,
  TURN_ROLES,
} from "../types/domain";
import type { Guide } from "../types/content";
import type { Scorecard, SelfCheckEntry } from "../types/scorecard";

/**
 * One document per practice session; the guide snapshot, turns, signal state and the agent's
 * decision log are embedded (document-shaped, always read together, saved after every turn — NFR-3).
 * The guide is snapshotted so a user-generated guide can be deleted without breaking history.
 * Every query MUST be scoped by userId (NFR-2).
 */
const decisionSchema = new Schema(
  {
    action: { type: String, enum: AGENT_ACTIONS, required: true },
    reason: { type: String, required: true },
    signalId: String,
  },
  { _id: false },
);

const toolCallSchema = new Schema(
  {
    name: { type: String, enum: TOOL_NAMES, required: true },
    args: { type: Schema.Types.Mixed, default: {} },
    ok: { type: Boolean, default: true },
    note: String,
  },
  { _id: false },
);

const turnSchema = new Schema(
  {
    index: { type: Number, required: true },
    role: { type: String, enum: TURN_ROLES, required: true },
    text: { type: String, required: true },
    clientMessageId: String, // idempotent retry of the user's turn
    questionType: { type: String, enum: QUESTION_TYPES }, // user turns, set by the judge
    judgeNote: String, // one line: why the judge classified it that way
    signalId: String, // persona turns: signal planted in this reply
    layerDepth: Number, // persona turns: layer revealed (1 = the drop, 2–3 = deeper)
    decision: decisionSchema,
    toolCalls: { type: [toolCallSchema], default: [] },
    flags: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const signalStateSchema = new Schema(
  {
    signalId: { type: String, required: true },
    status: { type: String, enum: SIGNAL_STATUSES, default: "pending" },
    layer: { type: Number, default: 0 }, // deepest revealed layer
    surfacedTurn: Number, // persona turn index where layer 1 was dropped
    questionsSinceSeeded: { type: Number, default: 0 }, // follow-up window counter (FR-3)
    evidenceTurn: Number, // user turn that caught / partially caught it
    evidenceQuote: String,
    confidence: Number,
    suggestedQuestion: String,
    note: String,
  },
  { _id: false },
);

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    guideId: { type: String, required: true },
    guide: { type: Schema.Types.Mixed, required: true }, // Guide snapshot (validated at creation)
    status: { type: String, enum: SESSION_STATUSES, default: "active" },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    questionCount: { type: Number, default: 0 },
    score: { type: Number, default: null },
    turns: { type: [turnSchema], default: [] },
    signals: { type: [signalStateSchema], default: [] },
    revealedFacts: { type: [String], default: [] },
    flags: { type: [String], default: [] },
    scorecard: { type: Schema.Types.Mixed, default: null },
    scorecardError: { type: String, default: null },
    selfCheckLog: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true },
);

sessionSchema.index({ userId: 1, startedAt: -1 });

/** guide / scorecard / selfCheckLog are Mixed in Mongo; readers cast them to Guide / Scorecard / SelfCheckEntry[]. */
export type Session = InferSchemaType<typeof sessionSchema>;
export type SessionGuide = Guide;
export type SessionScorecard = Scorecard;
export type SessionSelfCheck = SelfCheckEntry[];
export type SessionDoc = HydratedDocument<Session>;
export type SessionTurn = Session["turns"][number];
export type SignalState = Session["signals"][number];
export const SessionModel = model("Session", sessionSchema);
