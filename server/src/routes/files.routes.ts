import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import multer from "multer";
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { uploadFileController } from "../controllers/files.controller";
import { requireAuth } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";
import { createRateLimiter } from "../middleware/rateLimit";

const router = Router();

const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "application/pdf",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

const uploadMetadataSchema = {
  body: z.object({
    entityId: z.string().trim().min(1).optional(),
    entityType: z.enum(["TASK", "TIMESHEET", "PROJECT", "PROFILE"] as const).optional()
  })
};

const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many uploads. Please slow down.",
  keyGenerator: (req) => `${req.ip}:file-upload`,
  skip: () => process.env.NODE_ENV === "test"
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const hash = createHash("sha256")
      .update(`${Date.now()}-${randomUUID()}-${file.originalname}`)
      .digest("hex");
    const name = `${hash}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Unsupported file type."));
    }
    cb(null, true);
  }
});

function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message });
    }
    return next();
  });
}

router.post(
  "/",
  requireAuth,
  uploadRateLimiter,
  handleUpload,
  validateRequest(uploadMetadataSchema),
  uploadFileController
);

export default router;
