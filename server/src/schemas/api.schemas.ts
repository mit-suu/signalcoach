import { z } from "zod";

/** Request DTOs. Response shapes are mirrored in client/src/types/api.ts. */

export const RegisterBody = z.object({
  email: z.email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(128),
  displayName: z.string().trim().min(1).max(60).optional(),
});

export const LoginBody = z.object({
  email: z.email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1).max(128),
});

export const IdParam = z.object({ id: z.string().min(1) });

export const CreateSessionBody = z.object({ guideId: z.string().min(1) });

export const TurnBody = z.object({
  text: z.string().trim().min(1).max(2000),
  /** Client-generated id; resending the same id never creates a second turn (NFR-3). */
  clientMessageId: z.string().min(8).max(64),
});

/** Brief for the guide generator (FR-13). Short, concrete descriptions make better personas. */
export const GenerateGuideBody = z.object({
  product: z.string().trim().min(10, "Mô tả sản phẩm ít nhất 10 ký tự").max(2000),
  audience: z.string().trim().min(3, "Mô tả người dùng ít nhất 3 ký tự").max(500),
  goal: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
});
