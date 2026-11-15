/**
 * Rate limits that work behind the website's and the POS app's proxy.
 *
 * Visitors and staff reach this server through Vercel (later Render's static
 * site) rewrites, so req.ip is the proxy's address for everyone. Counting by
 * req.ip alone would let one person's mistakes lock out every user.
 *
 * Each limit therefore has two layers:
 *  - per visitor: the first X-Forwarded-For address (the real visitor, as the
 *    proxy reports it). Strict.
 *  - per connection: req.ip. Generous, so normal traffic through the proxy
 *    never hits it, but someone calling this server directly with a faked
 *    X-Forwarded-For header is still capped.
 */
import type { Request, RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/** The visitor's own address as reported by the proxy, falling back to the connection. */
export function visitorKey(req: Request): string {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  return ipKeyGenerator(forwarded || req.ip || "unknown");
}

function connectionKey(req: Request): string {
  return ipKeyGenerator(req.ip || "unknown");
}

type LimitOptions = {
  windowMs: number;
  /** Requests per visitor in the window. */
  perVisitor: number;
  /** Requests per connection in the window (covers everyone behind one proxy). */
  perConnection: number;
  message: string;
};

export function layeredLimit({ windowMs, perVisitor, perConnection, message }: LimitOptions): RequestHandler[] {
  const common = { windowMs, standardHeaders: true, legacyHeaders: false, message: { success: false, message } } as const;
  return [
    rateLimit({ ...common, limit: perConnection, keyGenerator: connectionKey }),
    rateLimit({ ...common, limit: perVisitor, keyGenerator: visitorKey }),
  ];
}

/** Extra login limit per account, whatever address the attempts come from. */
export const perAccountLoginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => "login:" + String(req.body?.email ?? "").trim().toLowerCase().slice(0, 200),
  skipSuccessfulRequests: true,
  message: { success: false, message: "Too many attempts for this account. Please wait 15 minutes and try again." },
});
