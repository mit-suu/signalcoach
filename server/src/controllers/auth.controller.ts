import type { Request, Response } from "express";
import * as authService from "../services/auth.service";
import { clearAuthCookie, issueAccountToken, setAuthCookie } from "../services/token.service";
import { readToken } from "../services/token.service";

function sendAuthenticated(res: Response, status: number, user: authService.PublicUser) {
  const { token, claims } = issueAccountToken(user.id);
  setAuthCookie(res, token);
  // Token is also returned for non-browser clients; the web app relies on the httpOnly cookie.
  res.status(status).json({ user, accessToken: token, expiresAt: claims.exp ?? null });
}

export async function register(req: Request, res: Response) {
  const user = await authService.register(req.body, readToken(req) ?? undefined);
  sendAuthenticated(res, 201, user);
}

export async function login(req: Request, res: Response) {
  const user = await authService.login(req.body, readToken(req) ?? undefined);
  sendAuthenticated(res, 200, user);
}

export function logout(_req: Request, res: Response) {
  clearAuthCookie(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const claims = req.auth!;
  const user = claims.anon ? null : await authService.getUser(claims.sub);
  res.json({ anonymous: !user, user });
}
