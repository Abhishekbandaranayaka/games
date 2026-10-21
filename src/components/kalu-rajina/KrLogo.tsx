import { withBasePath } from "@/lib/basePath";
import { KALU_RAJINA_NAME } from "@/lib/brand";
import { KALU_RAJINA_CARD_SRC } from "@/lib/cardAssets";

/** Kalu Rajina wordmark: the Black Queen card fanned over two backs, plus the game name. */
export function KrLogo({
  size = "hero",
  className = "",
}: {
  size?: "splash" | "hero" | "header";
  className?: string;
}) {
  if (size === "header") {
    return (
      <span className={["kr-logo kr-logo--header", className].filter(Boolean).join(" ")}>
        <img src={KALU_RAJINA_CARD_SRC} alt="" className="kr-logo__mini-card" draggable={false} />
        <span className="kr-logo__si">{KALU_RAJINA_NAME}</span>
      </span>
    );
  }

  const back = withBasePath("/cards/card_back.svg");
  return (
    <span
      className={["kr-logo", `kr-logo--${size}`, className].filter(Boolean).join(" ")}
      role="img"
      aria-label={KALU_RAJINA_NAME}
    >
      <span className="kr-logo__fan" aria-hidden>
        <img src={back} alt="" className="kr-logo__card kr-logo__card--left" draggable={false} />
        <img src={back} alt="" className="kr-logo__card kr-logo__card--right" draggable={false} />
        <img src={KALU_RAJINA_CARD_SRC} alt="" className="kr-logo__card kr-logo__card--queen" draggable={false} />
      </span>
      <span className="kr-logo__si" aria-hidden>
        {KALU_RAJINA_NAME}
      </span>
      <span className="kr-logo__en" aria-hidden>
        Kalu Rajina
      </span>
    </span>
  );
}
