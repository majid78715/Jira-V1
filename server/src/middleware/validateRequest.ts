import { NextFunction, Request, Response } from "express";
import { ZodError, ZodTypeAny } from "zod";

type RequestSchema = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

type FormattedError = {
  path: string;
  message: string;
};

export function validateRequest(schema: RequestSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body ?? {});
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params ?? {}) as any;
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query ?? {}) as any;
      }
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation failed.",
          errors: formatErrors(error)
        });
      }
      return next(error);
    }
  };
}

function formatErrors(error: ZodError): FormattedError[] {
  const issues = (error.issues ?? (error as unknown as { errors?: typeof error.issues }).errors) ?? [];
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}
