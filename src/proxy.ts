import { NextResponse } from "next/server";
import { getEnvironmentConfig } from "@/lib/environment.mjs";

export function proxy() {
  const response = NextResponse.next();
  if (!getEnvironmentConfig().isIndexable) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = { matcher: "/:path*" };
