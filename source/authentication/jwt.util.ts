
import jwt from "jsonwebtoken";

if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error("Missing JWT_ACCESS_SECRET environment variable");
}
if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error("Missing JWT_REFRESH_SECRET environment variable");
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

export interface TokenPayload {
    userId: string;
    role: string | null;
}

export function signAccessToken(payload: TokenPayload) {
    return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" });
}

export function signRefreshToken(payload: TokenPayload) {
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
    return jwt.verify(token, REFRESH_SECRET) as TokenPayload;
}