import { RANKS, SUITS, type Card, type Rank } from "../types";

export const KR_MIN_PLAYERS = 3;
export const KR_MAX_PLAYERS = 8;
export const KR_TURN_MS = 30_000;
/** Offline players are auto-drawn for quickly so the table never stalls. */
export const KR_OFFLINE_TURN_MS = 4_000;
export const KALU_RAJINA_ID = "kalu-rajina";

export type KrPhase = "lobby" | "playing" | "finished";

export type KrPlayer = {
  id: string;
  name: string;
  hand: Card[];
  finishOrder: number | null;
  connected: boolean;
  isHost: boolean;
  lobbyReady: boolean;
  pairs: number;
};

export type KrPair = { playerId: string; playerName: string; cards: Card[] };

type KrLastDraw = {
  seq: number;
  drawerId: string;
  drawerName: string;
  fromId: string;
  fromName: string;
  cardId: string;
  paired: boolean;
  auto: boolean;
};

export type KrRoom = {
  code: string;
  hostId: string;
  phase: KrPhase;
  players: KrPlayer[];
  currentTurnId: string | null;
  turnDeadlineAt: number | null;
  round: number;
  log: string[];
  announcement: string | null;
  lastDraw: KrLastDraw | null;
  recentPairs: KrPair[];
};

export type KrPublicPlayer = {
  id: string;
  name: string;
  cardCount: number;
  finishOrder: number | null;
  connected: boolean;
  isHost: boolean;
  lobbyReady: boolean;
  pairs: number;
};

export type KrPublicDraw = {
  seq: number;
  drawerId: string;
  drawerName: string;
  fromId: string;
  fromName: string;
  paired: boolean;
  auto: boolean;
  /** Only sent to the drawer, so they can spot the new card in their hand. */
  cardId: string | null;
};

export type KrClientView = {
  code: string;
  phase: KrPhase;
  hostId: string;
  round: number;
  currentTurnId: string | null;
  /** Player the current drawer takes a card from. */
  targetId: string | null;
  turnEndsAt: number | null;
  players: KrPublicPlayer[];
  log: string[];
  announcement: string | null;
  lastDraw: KrPublicDraw | null;
  recentPairs: KrPair[];
  loserId: string | null;
  you: {
    id: string;
    name: string;
    hand: Card[];
    isHost: boolean;
    lobbyReady: boolean;
    finishOrder: number | null;
  } | null;
};

type Result = KrRoom | { error: string };

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pushLog(log: string[], ...lines: string[]): string[] {
  return [...lines, ...log].slice(0, 40);
}

export function createKrDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) cards.push({ id: `${suit}-${rank}`, suit, rank });
  }
  cards.push({ id: KALU_RAJINA_ID, oldMaid: true });
  return cards;
}

/** Remove every pair of equal rank. Returns the remaining hand and the pairs taken out. */
export function discardPairs(hand: Card[]): { hand: Card[]; pairs: Card[][] } {
  const byRank = new Map<Rank, Card[]>();
  for (const card of hand) {
    if (!card.rank) continue;
    byRank.set(card.rank, [...(byRank.get(card.rank) ?? []), card]);
  }
  const removed = new Set<string>();
  const pairs: Card[][] = [];
  for (const cards of byRank.values()) {
    for (let i = 0; i + 1 < cards.length; i += 2) {
      pairs.push([cards[i], cards[i + 1]]);
      removed.add(cards[i].id);
      removed.add(cards[i + 1].id);
    }
  }
  return { hand: hand.filter((card) => !removed.has(card.id)), pairs };
}

function findPlayer(room: KrRoom, id: string): KrPlayer | undefined {
  return room.players.find((p) => p.id === id);
}

function inPlay(p: KrPlayer): boolean {
  return p.finishOrder === null && p.hand.length > 0;
}

/** Next seat clockwise from `fromId` that still holds cards. */
function nextInPlay(room: KrRoom, fromId: string): string | null {
  const seats = room.players;
  const start = Math.max(0, seats.findIndex((p) => p.id === fromId));
  for (let step = 1; step <= seats.length; step++) {
    const candidate = seats[(start + step) % seats.length];
    if (candidate.id !== fromId && inPlay(candidate)) return candidate.id;
  }
  return null;
}

export function drawTargetId(room: KrRoom): string | null {
  if (room.phase !== "playing" || !room.currentTurnId) return null;
  return nextInPlay(room, room.currentTurnId);
}

export function createKrRoom(code: string, host: { id: string; name: string }): KrRoom {
  return {
    code,
    hostId: host.id,
    phase: "lobby",
    players: [
      {
        id: host.id,
        name: host.name,
        hand: [],
        finishOrder: null,
        connected: true,
        isHost: true,
        lobbyReady: true,
        pairs: 0,
      },
    ],
    currentTurnId: null,
    turnDeadlineAt: null,
    round: 0,
    log: [`${host.name} created the room`],
    announcement: null,
    lastDraw: null,
    recentPairs: [],
  };
}

export function addKrPlayer(room: KrRoom, player: { id: string; name: string }): Result {
  const existing = findPlayer(room, player.id);
  if (existing) {
    return {
      ...room,
      players: room.players.map((p) =>
        p.id === player.id ? { ...p, name: player.name, connected: true } : p,
      ),
    };
  }
  if (room.phase !== "lobby") {
    return { error: "The game has already started. You cannot join this room now." };
  }
  if (room.players.length >= KR_MAX_PLAYERS) return { error: "This room is full." };
  return {
    ...room,
    players: [
      ...room.players,
      {
        id: player.id,
        name: player.name,
        hand: [],
        finishOrder: null,
        connected: true,
        isHost: false,
        lobbyReady: false,
        pairs: 0,
      },
    ],
    log: pushLog(room.log, `${player.name} joined`),
  };
}

export function markKrDisconnected(room: KrRoom, playerId: string): KrRoom {
  return {
    ...room,
    players: room.players.map((p) =>
      p.id === playerId
        ? { ...p, connected: false, ...(room.phase === "lobby" ? { lobbyReady: false } : {}) }
        : p,
    ),
  };
}

/** Lobby: remove the seat. In a match: keep the cards in play and auto-draw for them. */
export function removeKrPlayer(room: KrRoom, playerId: string): KrRoom | null {
  if (room.phase !== "lobby") return markKrDisconnected(room, playerId);
  const players = room.players.filter((p) => p.id !== playerId);
  if (players.length === 0) return null;
  let hostId = room.hostId;
  if (playerId === room.hostId) {
    hostId = players[0].id;
    players[0] = { ...players[0], isHost: true, lobbyReady: true };
  }
  return { ...room, hostId, players };
}

export function setKrLobbyReady(room: KrRoom, playerId: string, ready: boolean): Result {
  if (room.phase !== "lobby") return { error: "Ready is only used in the lobby." };
  if (playerId === room.hostId) return { error: "The host is always ready." };
  if (!findPlayer(room, playerId)) return { error: "Player not found." };
  return {
    ...room,
    players: room.players.map((p) => (p.id === playerId ? { ...p, lobbyReady: ready } : p)),
  };
}

export function kickKrPlayer(room: KrRoom, hostId: string, targetId: string): Result {
  if (room.phase !== "lobby") return { error: "You can only remove players before the game starts." };
  if (hostId !== room.hostId) return { error: "Only the host can remove a player." };
  if (targetId === hostId) return { error: "You cannot remove yourself." };
  const target = findPlayer(room, targetId);
  if (!target) return { error: "Player not found." };
  const next = removeKrPlayer(room, targetId);
  if (!next) return { error: "Could not remove that player." };
  return { ...next, log: pushLog(next.log, `${target.name} was removed by the host.`) };
}

/** Seat players out (in order) once they have no cards; end the match when one holder is left. */
function settleFinishers(room: KrRoom, candidateIds: string[]): KrRoom {
  let players = room.players;
  let finished = players.filter((p) => p.finishOrder !== null).length;
  const lines: string[] = [];
  for (const id of candidateIds) {
    const p = players.find((x) => x.id === id);
    if (!p || p.finishOrder !== null || p.hand.length > 0) continue;
    finished += 1;
    const order = finished;
    players = players.map((x) => (x.id === id ? { ...x, finishOrder: order } : x));
    lines.push(`${p.name} is out of cards — place ${order}.`);
  }

  const holders = players.filter((p) => p.finishOrder === null && p.hand.length > 0);
  let next: KrRoom = { ...room, players, log: pushLog(room.log, ...lines.reverse()) };
  if (holders.length > 1) return next;

  const loser = holders[0];
  if (loser) {
    next = {
      ...next,
      players: next.players.map((p) =>
        p.id === loser.id ? { ...p, finishOrder: next.players.length } : p,
      ),
    };
  }
  const loserName = loser?.name ?? "Nobody";
  return {
    ...next,
    phase: "finished",
    currentTurnId: null,
    turnDeadlineAt: null,
    announcement: `${loserName} is left holding the කළු රැජින!`,
    log: pushLog(next.log, `${loserName} is left holding the කළු රැජින.`),
  };
}

export function startKrMatch(room: KrRoom, requesterId: string): Result {
  if (requesterId !== room.hostId) return { error: "Only the host can start the game." };
  if (room.phase === "playing") return { error: "The game is already running." };
  const seated = room.players.filter((p) => p.connected);
  if (seated.length < KR_MIN_PLAYERS) {
    return { error: `At least ${KR_MIN_PLAYERS} players are required.` };
  }
  if (room.phase === "lobby" && seated.some((p) => p.id !== room.hostId && !p.lobbyReady)) {
    return { error: "Everyone must be ready before you can start." };
  }

  const deck = shuffle(createKrDeck());
  const hands: Card[][] = seated.map(() => []);
  deck.forEach((card, i) => hands[i % seated.length].push(card));

  const recentPairs: KrPair[] = [];
  const players: KrPlayer[] = seated.map((p, i) => {
    const { hand, pairs } = discardPairs(hands[i]);
    for (const cards of pairs) recentPairs.push({ playerId: p.id, playerName: p.name, cards });
    return { ...p, hand: shuffle(hand), finishOrder: null, pairs: pairs.length };
  });

  const round = room.round + 1;
  const base: KrRoom = {
    ...room,
    phase: "playing",
    players,
    round,
    announcement: null,
    lastDraw: null,
    recentPairs: recentPairs.slice(-6).reverse(),
    turnDeadlineAt: null,
    currentTurnId: null,
    log: pushLog(room.log, `Round ${round} started. Matching pairs were discarded.`),
  };
  const settled = settleFinishers(base, players.map((p) => p.id));
  if (settled.phase === "finished") return settled;

  const host = findPlayer(settled, settled.hostId);
  const firstId = host && inPlay(host) ? host.id : nextInPlay(settled, settled.hostId);
  return { ...settled, currentTurnId: firstId };
}

export function stopKrMatch(room: KrRoom, requesterId: string): Result {
  if (requesterId !== room.hostId) return { error: "Only the host can stop the game." };
  if (room.phase === "lobby") return { error: "The game has not started." };
  const host = findPlayer(room, room.hostId);
  return {
    ...room,
    phase: "lobby",
    currentTurnId: null,
    turnDeadlineAt: null,
    lastDraw: null,
    recentPairs: [],
    announcement: room.phase === "playing" ? `${host?.name ?? "Host"} stopped the game.` : null,
    players: room.players.map((p) => ({
      ...p,
      hand: [],
      finishOrder: null,
      pairs: 0,
      isHost: p.id === room.hostId,
      lobbyReady: p.id === room.hostId,
    })),
    log: pushLog(room.log, "Back to the lobby."),
  };
}

export function drawCard(room: KrRoom, playerId: string, index: number, auto = false): Result {
  if (room.phase !== "playing") return { error: "The game is not running." };
  if (room.currentTurnId !== playerId) return { error: "It is not your turn." };
  const drawer = findPlayer(room, playerId);
  const targetId = drawTargetId(room);
  const target = targetId ? findPlayer(room, targetId) : undefined;
  if (!drawer || !target) return { error: "There is nobody to draw from." };
  if (!Number.isInteger(index) || index < 0 || index >= target.hand.length) {
    return { error: "Pick one of the cards." };
  }

  const card = target.hand[index];
  const targetHand = target.hand.filter((_, i) => i !== index);
  const match = card.rank ? drawer.hand.find((c) => c.rank === card.rank) : undefined;
  let drawerHand: Card[];
  let recentPairs = room.recentPairs;
  if (match) {
    drawerHand = drawer.hand.filter((c) => c.id !== match.id);
    recentPairs = [
      { playerId: drawer.id, playerName: drawer.name, cards: [match, card] },
      ...room.recentPairs,
    ].slice(0, 6);
  } else {
    // Random slot so nobody can track where the drawn card sits.
    const slot = Math.floor(Math.random() * (drawer.hand.length + 1));
    drawerHand = [...drawer.hand.slice(0, slot), card, ...drawer.hand.slice(slot)];
  }

  const drawn: KrRoom = {
    ...room,
    players: room.players.map((p) => {
      if (p.id === drawer.id) return { ...p, hand: drawerHand, pairs: p.pairs + (match ? 1 : 0) };
      if (p.id === target.id) return { ...p, hand: targetHand };
      return p;
    }),
    recentPairs,
    lastDraw: {
      seq: (room.lastDraw?.seq ?? 0) + 1,
      drawerId: drawer.id,
      drawerName: drawer.name,
      fromId: target.id,
      fromName: target.name,
      cardId: card.id,
      paired: Boolean(match),
      auto,
    },
    log: pushLog(
      room.log,
      `${drawer.name}${auto ? " (auto)" : ""} drew from ${target.name}${match ? ` and paired ${card.rank}s` : ""}.`,
    ),
  };

  const settled = settleFinishers(drawn, [target.id, drawer.id]);
  if (settled.phase === "finished") return settled;
  return { ...settled, currentTurnId: nextInPlay(settled, drawer.id) };
}

export function shuffleKrHand(room: KrRoom, playerId: string): Result {
  if (room.phase !== "playing") return { error: "The game is not running." };
  const p = findPlayer(room, playerId);
  if (!p || p.hand.length < 2) return { error: "Nothing to shuffle." };
  return {
    ...room,
    players: room.players.map((x) => (x.id === playerId ? { ...x, hand: shuffle(x.hand) } : x)),
  };
}

export function autoDrawOnTimeout(room: KrRoom, playerId: string): Result {
  const targetId = drawTargetId(room);
  const target = targetId ? findPlayer(room, targetId) : undefined;
  if (!target || target.hand.length === 0) return { error: "There is nobody to draw from." };
  return drawCard(room, playerId, Math.floor(Math.random() * target.hand.length), true);
}

export function syncKrTurnDeadline(prev: KrRoom | null, next: KrRoom, now = Date.now()): KrRoom {
  if (next.phase !== "playing" || !next.currentTurnId) {
    return next.turnDeadlineAt == null ? next : { ...next, turnDeadlineAt: null };
  }
  const current = findPlayer(next, next.currentTurnId);
  const wasConnected = prev?.players.find((p) => p.id === next.currentTurnId)?.connected;
  const changed =
    !prev ||
    prev.phase !== next.phase ||
    prev.currentTurnId !== next.currentTurnId ||
    wasConnected !== current?.connected;
  if (changed || next.turnDeadlineAt == null) {
    const duration = current?.connected === false ? KR_OFFLINE_TURN_MS : KR_TURN_MS;
    return { ...next, turnDeadlineAt: now + duration };
  }
  return next;
}

export function generateKrRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function toKrClientView(room: KrRoom, viewerId?: string): KrClientView {
  const you = viewerId ? findPlayer(room, viewerId) : undefined;
  const loser =
    room.phase === "finished"
      ? room.players.find((p) => p.finishOrder === room.players.length && p.hand.length > 0)
      : undefined;
  const lastDraw = room.lastDraw;
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    round: room.round,
    currentTurnId: room.currentTurnId,
    targetId: drawTargetId(room),
    turnEndsAt: room.turnDeadlineAt,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
      finishOrder: p.finishOrder,
      connected: p.connected,
      isHost: p.id === room.hostId,
      lobbyReady: Boolean(p.id === room.hostId || p.lobbyReady),
      pairs: p.pairs,
    })),
    log: room.log,
    announcement: room.announcement,
    lastDraw: lastDraw
      ? {
          seq: lastDraw.seq,
          drawerId: lastDraw.drawerId,
          drawerName: lastDraw.drawerName,
          fromId: lastDraw.fromId,
          fromName: lastDraw.fromName,
          paired: lastDraw.paired,
          auto: lastDraw.auto,
          cardId: lastDraw.drawerId === viewerId ? lastDraw.cardId : null,
        }
      : null,
    recentPairs: room.recentPairs,
    loserId: loser?.id ?? null,
    you: you
      ? {
          id: you.id,
          name: you.name,
          hand: you.hand,
          isHost: you.id === room.hostId,
          lobbyReady: Boolean(you.id === room.hostId || you.lobbyReady),
          finishOrder: you.finishOrder,
        }
      : null,
  };
}
