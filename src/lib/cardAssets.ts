import type { Card } from "./types";
import { withBasePath } from "./basePath";

export const KALU_RAJINA_CARD_SRC = withBasePath("/cards/kalu-rajina.svg");

export function cardImageSrc(card: Card): string {
  if (card.oldMaid) return KALU_RAJINA_CARD_SRC;
  // Declared joker face shows as the represented card on the table.
  if (card.joker && card.asRank && card.asSuit) {
    return withBasePath(`/cards/${card.asSuit}-${card.asRank}.svg`);
  }
  if (card.joker) {
    return card.id.includes("black")
      ? withBasePath("/cards/joker-blue.svg")
      : withBasePath("/cards/joker-color.svg");
  }
  return withBasePath(`/cards/${card.suit}-${card.rank}.svg`);
}
