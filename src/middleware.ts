import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { clientIp, rateLimit, SECURITY_HEADERS } from "@/lib/security";

const COOKIE = "ledgerly_token";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/pricing",
  "/pilot",
];

const PUBLIC_API = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/leads",
];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  // Signed invoice share links (token is verified by the page / route itself)
  if (pathname.startsWith("/share/") || pathname.startsWith("/api/share/")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

/** Staff may only use invoices + quick bill modules */
const STAFF_ALLOWED = [
  "/invoices",
  "/api/invoices",
  "/api/customers", // autocomplete for commercial quick bill
  "/api/templates",
  "/api/auth/me",
  "/api/auth/logout",
];

function staffAllowed(pathname: string) {
  return STAFF_ALLOWED.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

async function readSession(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return {
      userId: payload.sub as string,
      role: String(payload.role || "staff"),
      userType: String(payload.userType || "regular"),
      permissions: Array.isArray(payload.permissions)
        ? (payload.permissions as string[])
        : [],
    };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    const ip = clientIp(req);
    const ok = rateLimit(`api:${ip}`, 120, 60_000);
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Try again in a minute." },
        { status: 429, headers: SECURITY_HEADERS }
      );
    }
  }

  const session = await readSession(req);

  if (!isPublic(pathname)) {
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized" },
          { status: 401, headers: SECURITY_HEADERS }
        );
      }
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    if (session.role === "staff" && !staffAllowed(pathname)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { ok: false, error: "Staff can only access Invoices & Quick Bill" },
          { status: 403, headers: SECURITY_HEADERS }
        );
      }
      const url = req.nextUrl.clone();
      url.pathname = "/invoices";
      return NextResponse.redirect(url);
    }
  }

  // Logged-in users hitting login/register → dashboard
  if (session && (pathname === "/login" || pathname === "/register")) {
    const url = req.nextUrl.clone();
    url.pathname = session.role === "staff" ? "/invoices" : "/dashboard";
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|uploads/|pdf\\.worker\\.min\\.mjs|pdfjs-shim\\.js).*)",
  ],
};
