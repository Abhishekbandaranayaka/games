import { HUB_NAME, HUB_NAME_SI } from "@/lib/brand";

type HubLogoSize = "splash" | "hero" | "header";

const SUITS = [
  { glyph: "♠", red: false },
  { glyph: "♥", red: true },
  { glyph: "♦", red: true },
  { glyph: "♣", red: false },
];

/** Sellam game hub wordmark (text-based, scales without image assets). */
export function HubLogo({
  size = "hero",
  className = "",
}: {
  size?: HubLogoSize;
  className?: string;
}) {
  if (size === "header") {
    return (
      <span className={["hub-logo hub-logo--header", className].filter(Boolean).join(" ")}>
        <span className="hub-logo__si">{HUB_NAME_SI}</span>
        <span className="hub-logo__en">{HUB_NAME}</span>
      </span>
    );
  }

  return (
    <span
      className={["hub-logo", `hub-logo--${size}`, className].filter(Boolean).join(" ")}
      role="img"
      aria-label={HUB_NAME}
    >
      <span className="hub-logo__suits" aria-hidden>
        {SUITS.map((suit) => (
          <span key={suit.glyph} className={suit.red ? "hub-logo__suit--red" : undefined}>
            {suit.glyph}
          </span>
        ))}
      </span>
      <span className="hub-logo__si" aria-hidden>
        {HUB_NAME_SI}
      </span>
      <span className="hub-logo__en" aria-hidden>
        {HUB_NAME}
      </span>
      <span className="hub-logo__tag" aria-hidden>
        Game hub
      </span>
    </span>
  );
}
