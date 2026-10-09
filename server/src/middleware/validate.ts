import type { RequestHandler } from "express";
import type { z } from "zod";

interface Schemas {
  body?: z.ZodType;
  params?: z.ZodType;
}

/**
 * Parses req.body / req.params with Zod and replaces them with the parsed value.
 * Failures throw ZodError → errorHandler turns it into a 400.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params));
    next();
  };
}
