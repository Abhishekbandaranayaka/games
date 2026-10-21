import { KALU_RAJINA_NAME, SPLASH_LOGO_SRC } from "./brand";
import { KALU_RAJINA_CARD_SRC } from "./cardAssets";
import { MAX_PLAYERS, MIN_PLAYERS } from "./engine";
import { KR_MAX_PLAYERS, KR_MIN_PLAYERS } from "./kalu-rajina/engine";
import { HIGANNA_PATH, KALU_RAJINA_PATH } from "./routes";

export type HubGame = {
  id: string;
  name: string;
  localName: string;
  tagline: string;
  players: string;
  href: string;
  logoSrc: string;
};

/** Games listed on the hub dashboard. Every game shares the same account and wallet. */
export const HUB_GAMES: readonly HubGame[] = [
  {
    id: "higanna",
    name: "Higanna",
    localName: "හිඟන්නා",
    tagline: "King, Queen and Beggar — realtime multiplayer card game",
    players: `${MIN_PLAYERS}–${MAX_PLAYERS} players`,
    href: HIGANNA_PATH,
    logoSrc: SPLASH_LOGO_SRC,
  },
  {
    id: "kalu-rajina",
    name: "Kalu Rajina",
    localName: KALU_RAJINA_NAME,
    tagline: "Match pairs, pass the Black Queen — don't be left holding her",
    players: `${KR_MIN_PLAYERS}–${KR_MAX_PLAYERS} players`,
    href: KALU_RAJINA_PATH,
    logoSrc: KALU_RAJINA_CARD_SRC,
  },
];
