"use client";

import { createAuthClient } from "better-auth/react";
import { withBasePath } from "@/lib/basePath";

export const authClient = createAuthClient({
  basePath: withBasePath("/api/auth"),
});
