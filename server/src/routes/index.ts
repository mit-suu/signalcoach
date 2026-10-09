import { Router } from "express";
import { identify } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { CreateSessionBody, GenerateGuideBody, IdParam, LoginBody, RegisterBody, TurnBody } from "../schemas/api.schemas";
import * as auth from "../controllers/auth.controller";
import * as guides from "../controllers/guides.controller";
import * as sessions from "../controllers/sessions.controller";
import { health } from "../controllers/health.controller";

const authRoutes = Router()
  .post("/register", validate({ body: RegisterBody }), auth.register)
  .post("/login", validate({ body: LoginBody }), auth.login)
  .post("/logout", auth.logout)
  .get("/me", identify, auth.me);

// Guides: the built-in three plus the visitor's own generated ones (identity needed for the latter).
const guideRoutes = Router()
  .use(identify)
  .get("/", guides.list)
  .post("/generate", validate({ body: GenerateGuideBody }), guides.generate)
  .get("/:id", validate({ params: IdParam }), guides.getById)
  .delete("/:id", validate({ params: IdParam }), guides.remove);

// Practice works for anonymous visitors too (FR-12) — identify mints an anon token if needed.
const sessionRoutes = Router()
  .use(identify)
  .get("/", sessions.list)
  .post("/", validate({ body: CreateSessionBody }), sessions.create)
  .delete("/", sessions.removeAll)
  .get("/:id", validate({ params: IdParam }), sessions.get)
  .delete("/:id", validate({ params: IdParam }), sessions.remove)
  .post("/:id/turns", validate({ params: IdParam, body: TurnBody }), sessions.postTurn)
  .post("/:id/end", validate({ params: IdParam }), sessions.end)
  .post("/:id/scorecard", validate({ params: IdParam }), sessions.scorecard);

export const apiRouter = Router()
  .get("/health", health)
  .get("/principles", guides.principles)
  .use("/auth", authRoutes)
  .use("/guides", guideRoutes)
  .use("/sessions", sessionRoutes);
