import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { UserModel } from "../models/user.model";
import { SessionModel } from "../models/session.model";
import type { AuthClaims } from "./token.service";
import { AppError, conflict } from "../utils/errors";

const BCRYPT_ROUNDS = 12;

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
}

function toPublicUser(u: { _id: Types.ObjectId; email: string; displayName?: string | null }): PublicUser {
  return { id: u._id.toHexString(), email: u.email, displayName: u.displayName ?? null };
}

/**
 * Register upgrades the current anonymous identity: the new account reuses the anon id,
 * so every session practised before signing up stays in the user's history.
 */
export async function register(
  input: { email: string; password: string; displayName?: string },
  current: AuthClaims | undefined,
): Promise<PublicUser> {
  if (await UserModel.exists({ email: input.email })) {
    throw conflict("EMAIL_TAKEN", "Email này đã được đăng ký");
  }
  const id = current?.anon ? new Types.ObjectId(current.sub) : new Types.ObjectId();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  try {
    const user = await UserModel.create({ _id: id, email: input.email, passwordHash, displayName: input.displayName });
    return toPublicUser(user);
  } catch (err) {
    // Race on the unique email index.
    if ((err as { code?: number }).code === 11000) throw conflict("EMAIL_TAKEN", "Email này đã được đăng ký");
    throw err;
  }
}

/**
 * Login to an existing account. Sessions practised anonymously in this browser
 * are moved onto the account so nothing is lost.
 */
export async function login(
  input: { email: string; password: string },
  current: AuthClaims | undefined,
): Promise<PublicUser> {
  const user = await UserModel.findOne({ email: input.email }).select("+passwordHash");
  // Same message for unknown email and wrong password — don't leak which emails exist.
  const ok = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !ok) throw new AppError(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");

  if (current?.anon && current.sub !== user.id) {
    await SessionModel.updateMany({ userId: new Types.ObjectId(current.sub) }, { $set: { userId: user._id } });
  }
  return toPublicUser(user);
}

export async function getUser(id: string): Promise<PublicUser | null> {
  const user = await UserModel.findById(id).lean();
  return user ? toPublicUser(user) : null;
}
