import { headers } from "next/headers";
import { auth } from "@/server/auth";

export async function getCurrentSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}
