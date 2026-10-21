import {
  addKrPlayer,
  autoDrawOnTimeout,
  createKrRoom,
  drawCard,
  generateKrRoomCode,
  kickKrPlayer,
  markKrDisconnected,
  removeKrPlayer,
  setKrLobbyReady,
  shuffleKrHand,
  startKrMatch,
  stopKrMatch,
  syncKrTurnDeadline,
  toKrClientView,
  type KrClientView,
  type KrRoom,
} from "../../lib/kalu-rajina/engine";

const rooms = new Map<string, KrRoom>();
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

type MutateResult = { code: string } | { error: string };

let onRoomUpdated: ((code: string) => void) | null = null;

/** Socket layer registers this so turn timeouts rebroadcast state. */
export function setKrRoomUpdateListener(fn: ((code: string) => void) | null) {
  onRoomUpdated = fn;
}

function uniqueCode(): string {
  for (let i = 0; i < 20; i++) {
    const code = generateKrRoomCode();
    if (!rooms.has(code)) return code;
  }
  return generateKrRoomCode() + generateKrRoomCode().slice(0, 2);
}

function clearTurnTimer(code: string) {
  const timer = turnTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(code);
  }
}

function scheduleTurnTimeout(code: string, room: KrRoom) {
  clearTurnTimer(code);
  if (!room.turnDeadlineAt || !room.currentTurnId) return;
  const expectedPlayer = room.currentTurnId;
  const expectedDeadline = room.turnDeadlineAt;
  const timer = setTimeout(() => {
    turnTimers.delete(code);
    const live = rooms.get(code);
    if (!live) return;
    if (live.currentTurnId !== expectedPlayer || live.turnDeadlineAt !== expectedDeadline) return;
    const result = mutate(code, (r) => autoDrawOnTimeout(r, expectedPlayer));
    if (!("error" in result)) onRoomUpdated?.(code);
  }, Math.max(0, room.turnDeadlineAt - Date.now()));
  turnTimers.set(code, timer);
}

function store(code: string, prev: KrRoom | null, next: KrRoom): KrRoom {
  const withClock = syncKrTurnDeadline(prev, next);
  rooms.set(code, withClock);
  scheduleTurnTimeout(code, withClock);
  return withClock;
}

function mutate(code: string, fn: (room: KrRoom) => KrRoom | { error: string }): MutateResult {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found." };
  const next = fn(room);
  if ("error" in next) return next;
  store(code, room, next);
  return { code };
}

export function getKrRoom(code: string): KrRoom | undefined {
  return rooms.get(code);
}

export function krViewFor(code: string, playerId?: string): KrClientView | null {
  const room = rooms.get(code);
  return room ? toKrClientView(room, playerId) : null;
}

export function krCreate(playerId: string, name: string): string {
  const code = uniqueCode();
  store(code, null, createKrRoom(code, { id: playerId, name: name.trim() || "Host" }));
  return code;
}

export function krJoin(code: string, playerId: string, name: string): MutateResult {
  if (!rooms.has(code)) return { error: "This room doesn’t exist. Check the code and try again." };
  return mutate(code, (room) => addKrPlayer(room, { id: playerId, name: name.trim() || "Player" }));
}

export function krLeave(code: string, playerId: string) {
  const room = rooms.get(code);
  if (!room) return;
  const next = removeKrPlayer(room, playerId);
  if (!next) {
    clearTurnTimer(code);
    rooms.delete(code);
    return;
  }
  store(code, room, next);
}

export function krMarkOffline(code: string, playerId: string) {
  return mutate(code, (room) => markKrDisconnected(room, playerId));
}

export const krStart = (code: string, playerId: string) =>
  mutate(code, (room) => startKrMatch(room, playerId));
export const krStop = (code: string, playerId: string) =>
  mutate(code, (room) => stopKrMatch(room, playerId));
export const krReady = (code: string, playerId: string, ready: boolean) =>
  mutate(code, (room) => setKrLobbyReady(room, playerId, ready));
export const krKick = (code: string, hostId: string, targetId: string) =>
  mutate(code, (room) => kickKrPlayer(room, hostId, targetId));
export const krDraw = (code: string, playerId: string, index: number) =>
  mutate(code, (room) => drawCard(room, playerId, index));
export const krShuffle = (code: string, playerId: string) =>
  mutate(code, (room) => shuffleKrHand(room, playerId));
