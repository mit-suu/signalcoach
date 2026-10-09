import type { RequestHandler } from "express";
import { readToken, issueAnonymousToken, setAuthCookie, type AuthClaims } from "../services/token.service";
import { unauthorized } from "../utils/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthClaims;
    }
  }
}

/**
 * Every practice route needs an identity, but FR-12 forbids a sign-up wall.
 * So: valid token → use it; no/invalid/expired token → mint an anonymous one.
 * Registering later upgrades that same id, so history is kept.
 */
export const identify: RequestHandler = (req, res, next) => {
  const claims = readToken(req);
  if (claims) {
    req.auth = claims;
    return next();
  }
  const { token, claims: anon } = issueAnonymousToken();
  setAuthCookie(res, token);
  req.auth = anon;
  next();
};

/** Routes that only make sense for a registered account. */
export const requireAccount: RequestHandler = (req, _res, next) => {
  const claims = req.auth ?? readToken(req);
  if (!claims || claims.anon) return next(unauthorized());
  req.auth = claims;
  next();
};

export function userId(req: Express.Request): string {
  if (!req.auth) throw unauthorized();
  return req.auth.sub;
}
