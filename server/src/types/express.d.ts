import { PublicUser } from "../models/_types";

declare global {
  namespace Express {
    interface Request {
      currentUser?: PublicUser;
      file?: Express.Multer.File;
    }
  }
}

export {};
