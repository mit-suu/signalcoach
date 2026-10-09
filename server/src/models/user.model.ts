import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Only registered accounts are stored. Anonymous visitors exist only as a JWT `sub`;
 * on register that same id becomes this document's _id, so their sessions carry over.
 */
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, trim: true, maxlength: 60 },
  },
  { timestamps: true },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<User>;
export const UserModel = model("User", userSchema);
