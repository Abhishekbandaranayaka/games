import type { Metadata } from "next";
import { preload } from "react-dom";
import { MINI_LOGO_SRC, SPLASH_LOGO_SRC } from "@/lib/brand";

export const metadata: Metadata = {
  title: "හිඟන්නා",
  description: "Realtime multiplayer card game — King, Queen, Beggar",
  appleWebApp: { title: "හිඟන්නා" },
};

export default function HigannaLayout({ children }: LayoutProps<"/higanna">) {
  preload(SPLASH_LOGO_SRC, { as: "image", type: "image/webp", fetchPriority: "high" });
  preload(MINI_LOGO_SRC, { as: "image", type: "image/webp" });
  return children;
}
