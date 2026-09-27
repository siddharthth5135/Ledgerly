import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { createHash, randomInt } from "crypto";

export type UserType = "commercial" | "regular";
export type UserRole = "owner" | "staff";

export type SessionUser = {
  userId: string;
  ownerId: string;
  email: string;
  name: string;
  role: UserRole;
  userType: UserType;
  permissions: string[];
  businessName?: string;
};

const COOKIE = "ledgerly_token";

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error("JWT_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(s);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  // Support pgcrypto bf hashes from seed ($2a$) and bcryptjs ($2b$)
  return bcrypt.compare(password, hash);
}

export function hashOtp(otp: string) {
  return createHash("sha256").update(otp).digest("hex");
}

export function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

export async function signToken(user: SessionUser) {
  return new SignJWT({
    ownerId: user.ownerId,
    email: user.email,
    name: user.name,
    role: user.role,
    userType: user.userType,
    permissions: user.permissions,
    businessName: user.businessName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      ownerId: String(payload.ownerId),
      email: String(payload.email),
      name: String(payload.name || ""),
      role: payload.role as UserRole,
      userType: payload.userType as UserType,
      permissions: Array.isArray(payload.permissions)
        ? (payload.permissions as string[])
        : [],
      businessName: payload.businessName ? String(payload.businessName) : undefined,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new AuthError("Unauthorized", 401);
  return s;
}

export function sessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return Promise.resolve(null);
  return verifyToken(token);
}

export function canAccess(user: SessionUser, module: string): boolean {
  if (user.role === "owner") return true;
  return user.permissions.includes(module) || user.permissions.includes("*");
}

export function requirePermission(user: SessionUser, module: string) {
  if (!canAccess(user, module)) {
    throw new AuthError("Forbidden for your role", 403);
  }
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export { COOKIE as AUTH_COOKIE };
