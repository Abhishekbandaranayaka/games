import type { Metadata } from "next";
import { preload } from "react-dom";
import { KALU_RAJINA_NAME } from "@/lib/brand";
import { KALU_RAJINA_CARD_SRC } from "@/lib/cardAssets";

export const metadata: Metadata = {
  title: KALU_RAJINA_NAME,
  description: "Match pairs and pass the Black Queen — realtime multiplayer card game",
  appleWebApp: { title: KALU_RAJINA_NAME },
};

export default function KaluRajinaLayout({ children }: LayoutProps<"/kalu-rajina">) {
  preload(KALU_RAJINA_CARD_SRC, { as: "image", type: "image/svg+xml", fetchPriority: "high" });
  return children;
}
