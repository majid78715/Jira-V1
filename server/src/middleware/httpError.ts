import { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type MaybeHttpError = {
  status?: number;
  message?: string;
  details?: unknown;
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const httpError = err as MaybeHttpError;
  const status = Number.isInteger(httpError?.status) ? Number(httpError!.status) : 500;
  const message = err instanceof Error && err.message ? err.message : "Unexpected error";
  const body = {
    message,
    error: {
      code: status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
      message,
      details: httpError?.details ?? undefined
    }
  };
  if (status === 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(status).json(body);
}
