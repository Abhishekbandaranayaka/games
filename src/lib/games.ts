import { SPLASH_LOGO_SRC } from "./brand";
import { MAX_PLAYERS, MIN_PLAYERS } from "./engine";
import { HIGANNA_PATH } from "./routes";

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
];
