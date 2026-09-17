import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
    

    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Malformed token" });
    }

    const decoded = jwt.verify(token, ACCESS_SECRET) ;

    req.user = decoded;

    next(); // ✅ only here
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export default authMiddleware;