import { toNextJsHandler } from "better-auth/next-js";
import { withBasePath } from "@/lib/basePath";
import { auth } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const internalAuthPath = "/api/auth";
const publicAuthPath = withBasePath(internalAuthPath);
const handlers = toNextJsHandler(auth);

function restorePublicBasePath(request: Request): Request {
  if (publicAuthPath === internalAuthPath) {
    return request;
  }

  const url = new URL(request.url);

  // Next.js removes its configured basePath before invoking Route Handlers.
  // Better Auth uses the public URL as its router base, so restore that prefix.
  if (
    url.pathname === internalAuthPath ||
    url.pathname.startsWith(`${internalAuthPath}/`)
  ) {
    url.pathname = `${publicAuthPath}${url.pathname.slice(internalAuthPath.length)}`;
    return new Request(url, request);
  }

  return request;
}

export function GET(request: Request) {
  return handlers.GET(restorePublicBasePath(request));
}

export function POST(request: Request) {
  return handlers.POST(restorePublicBasePath(request));
}
