import { TokenPayload } from "../authentication/jwt.util";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export {};