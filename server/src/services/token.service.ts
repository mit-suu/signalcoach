import type { CookieOptions, Request, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { Types } from "mongoose";
import { env } from "../config/env";

/**
 * Access-token only (no refresh token). The JWT is stored in an httpOnly cookie;
 * an `Authorization: Bearer` header is accepted too (scripts, tests, mobile).
 * When it expires the visitor silently becomes anonymous again and must log in.
 */
export interface AuthClaims {
  sub: string; // user id (ObjectId hex) — anonymous visitors get one too
  anon: boolean;
  exp?: number;
}

const ISSUER = "signalcoach";

function sign(claims: Omit<AuthClaims, "exp">, expiresIn: string): string {
  return jwt.sign(claims, env.JWT_SECRET, {
    algorithm: "HS256",
    issuer: ISSUER,
    expiresIn: expiresIn as SignOptions["expiresIn"],
  });
}

export function issueAnonymousToken(): { token: string; claims: AuthClaims } {
  const claims: AuthClaims = { sub: new Types.ObjectId().toHexString(), anon: true };
  return { token: sign(claims, env.ANON_TOKEN_EXPIRES_IN), claims };
}

export function issueAccountToken(userId: string): { token: string; claims: AuthClaims } {
  const claims: AuthClaims = { sub: userId, anon: false };
  return { token: sign(claims, env.JWT_EXPIRES_IN), claims };
}

export function verifyToken(token: string): AuthClaims | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"], issuer: ISSUER });
    if (typeof decoded !== "object" || typeof decoded.sub !== "string" || !Types.ObjectId.isValid(decoded.sub)) return null;
    return { sub: decoded.sub, anon: Boolean(decoded.anon), exp: decoded.exp };
  } catch {
    return null;
  }
}

export function readToken(req: Request): AuthClaims | null {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = bearer ?? (req.cookies?.[env.COOKIE_NAME] as string | undefined);
  return token ? verifyToken(token) : null;
}

function cookieOptions(): CookieOptions {
  return { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAMESITE, path: "/" };
}

export function setAuthCookie(res: Response, token: string): void {
  const decoded = jwt.decode(token) as { exp: number };
  res.cookie(env.COOKIE_NAME, token, { ...cookieOptions(), expires: new Date(decoded.exp * 1000) });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(env.COOKIE_NAME, cookieOptions());
}
