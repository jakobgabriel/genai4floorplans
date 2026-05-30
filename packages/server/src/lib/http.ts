import type { NextFunction, Request, Response } from "express";

// A typed HTTP error the central handler turns into a JSON response.
export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg, "bad_request");
export const unauthorized = (msg = "Not signed in") => new HttpError(401, msg, "unauthorized");
export const forbidden = (msg = "Forbidden") => new HttpError(403, msg, "forbidden");
export const notFound = (msg = "Not found") => new HttpError(404, msg, "not_found");
export const conflict = (msg: string) => new HttpError(409, msg, "conflict");

/** Wrap an async handler so thrown errors reach the central error middleware. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as T, res, next).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  // Zod and unexpected errors collapse to 400/500 without leaking internals.
  const message = err instanceof Error ? err.message : "Internal error";
  res.status(500).json({ error: message, code: "internal" });
}
