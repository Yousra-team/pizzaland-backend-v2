
import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../authentication/jwt.util";

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Malformed token" });
    }

    const decoded = verifyAccessToken(token) ;

    req.user = decoded;

    next(); // ✅ only here
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export default authMiddleware;