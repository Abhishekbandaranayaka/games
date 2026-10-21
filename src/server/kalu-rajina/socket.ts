import type { Namespace, Server } from "socket.io";
import { createMatchReference } from "../economy-config";
import { authenticateSocket, type AuthedSocket } from "../socket-auth";
import {
  awardMatchRewards,
  captureMatchEntries,
  InsufficientCoinsError,
  releaseMatchEntries,
  reserveMatchEntries,
  type WalletSnapshot,
} from "../wallet";
import {
  getKrRoom,
  krCreate,
  krDraw,
  krJoin,
  krKick,
  krLeave,
  krMarkOffline,
  krReady,
  krShuffle,
  krStart,
  krStop,
  krViewFor,
  setKrRoomUpdateListener,
} from "./rooms";

export const KALU_RAJINA_NAMESPACE = "/kalu-rajina";

/** Players stay seated through short drops; after this their turns are auto-drawn quickly. */
const DISCONNECT_GRACE_MS = 60_000;

const socketCounts = new Map<string, number>();
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();
const startingRooms = new Set<string>();
const matchReferences = new Map<string, string>();
const settlingMatches = new Set<string>();

function playerChannel(code: string, playerId: string) {
  return `player:${code}:${playerId}`;
}

function presenceKey(code: string, playerId: string) {
  return `${code}:${playerId}`;
}

function roundKey(code: string, round: number) {
  return `${code}:${round}`;
}

function emitRoom(nsp: Namespace, code: string) {
  const room = getKrRoom(code);
  if (!room) {
    nsp.to(code).emit("state", { error: "The room was closed." });
    return;
  }
  for (const p of room.players) {
    nsp.to(playerChannel(code, p.id)).emit("state", krViewFor(code, p.id));
  }
  if (room.phase === "finished") settleFinishedRoom(nsp, code);
}

function emitWallets(nsp: Namespace, code: string, wallets: WalletSnapshot[]) {
  for (const wallet of wallets) {
    nsp.to(playerChannel(code, wallet.userId)).emit("wallet", {
      balance: wallet.balance.toString(),
      reservedBalance: wallet.reservedBalance.toString(),
      availableBalance: wallet.availableBalance.toString(),
    });
  }
}

async function settleMatchRewards(
  nsp: Namespace,
  code: string,
  key: string,
  referenceId: string,
  winnerIds: [string, string],
  refundIds: string[],
  attempt = 1,
) {
  if (settlingMatches.has(referenceId)) return;
  settlingMatches.add(referenceId);
  try {
    const wallets = await awardMatchRewards(referenceId, winnerIds[0], winnerIds[1], refundIds);
    emitWallets(nsp, code, wallets);
    if (matchReferences.get(key) === referenceId) matchReferences.delete(key);
  } catch (cause) {
    console.error(`Unable to settle Kalu Rajina rewards for ${referenceId}`, cause);
    if (attempt < 10) {
      setTimeout(
        () => void settleMatchRewards(nsp, code, key, referenceId, winnerIds, refundIds, attempt + 1),
        5_000,
      );
    }
  } finally {
    settlingMatches.delete(referenceId);
  }
}

/** 1st and 2nd out share the loser's entry; middle places are refunded; the loser gets nothing. */
function settleFinishedRoom(nsp: Namespace, code: string) {
  const room = getKrRoom(code);
  if (!room || room.phase !== "finished") return;
  const key = roundKey(code, room.round);
  const referenceId = matchReferences.get(key);
  if (!referenceId) return;
  const first = room.players.find((p) => p.finishOrder === 1);
  const second = room.players.find((p) => p.finishOrder === 2);
  if (!first || !second) return;
  const loserOrder = room.players.length;
  const refundIds = room.players
    .filter((p) => p.finishOrder != null && p.finishOrder > 2 && p.finishOrder < loserOrder)
    .map((p) => p.id);
  void settleMatchRewards(nsp, code, key, referenceId, [first.id, second.id], refundIds);
}

function clearOfflineTimer(key: string) {
  const timer = offlineTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    offlineTimers.delete(key);
  }
}

function trackSocketJoin(code: string, playerId: string) {
  const key = presenceKey(code, playerId);
  socketCounts.set(key, (socketCounts.get(key) ?? 0) + 1);
  clearOfflineTimer(key);
}

function trackSocketDisconnect(nsp: Namespace, code: string, playerId: string) {
  const key = presenceKey(code, playerId);
  const next = Math.max(0, (socketCounts.get(key) ?? 1) - 1);
  if (next > 0) {
    socketCounts.set(key, next);
    return;
  }
  socketCounts.delete(key);
  clearOfflineTimer(key);
  offlineTimers.set(
    key,
    setTimeout(() => {
      offlineTimers.delete(key);
      if ((socketCounts.get(key) ?? 0) > 0) return;
      const result = krMarkOffline(code, playerId);
      if (!("error" in result)) emitRoom(nsp, code);
    }, DISCONNECT_GRACE_MS),
  );
}

function bindSocketToRoom(nsp: Namespace, socket: AuthedSocket, code: string) {
  if (!socket.playerId) return;
  if (socket.roomCode === code) {
    clearOfflineTimer(presenceKey(code, socket.playerId));
    return;
  }
  if (socket.roomCode) {
    trackSocketDisconnect(nsp, socket.roomCode, socket.playerId);
    void socket.leave(socket.roomCode);
    void socket.leave(playerChannel(socket.roomCode, socket.playerId));
  }
  socket.roomCode = code;
  void socket.join(code);
  void socket.join(playerChannel(code, socket.playerId));
  trackSocketJoin(code, socket.playerId);
}

export function attachKaluRajinaSocket(io: Server) {
  const nsp = io.of(KALU_RAJINA_NAMESPACE);
  setKrRoomUpdateListener((code) => emitRoom(nsp, code));
  nsp.use(authenticateSocket);

  nsp.on("connection", (socket: AuthedSocket) => {
    function reply(result: { code: string } | { error: string }) {
      if ("error" in result) socket.emit("toast", result.error);
      else emitRoom(nsp, result.code);
    }

    socket.on("create", () => {
      const { playerId, playerName } = socket;
      if (!playerId || !playerName) return;
      if (socket.roomCode && getKrRoom(socket.roomCode)) {
        emitRoom(nsp, socket.roomCode);
        return;
      }
      const code = krCreate(playerId, playerName);
      bindSocketToRoom(nsp, socket, code);
      emitRoom(nsp, code);
    });

    socket.on("join", ({ code }: { code?: string } = {}) => {
      const { playerId, playerName } = socket;
      if (!playerId || !playerName || !code?.trim()) {
        socket.emit("state", { error: "Enter a room code." });
        return;
      }
      const result = krJoin(code.trim().toUpperCase(), playerId, playerName);
      if ("error" in result) {
        socket.emit("state", result);
        return;
      }
      bindSocketToRoom(nsp, socket, result.code);
      emitRoom(nsp, result.code);
    });

    socket.on("leave", () => {
      const { roomCode, playerId } = socket;
      if (!roomCode || !playerId) return;
      const key = presenceKey(roomCode, playerId);
      clearOfflineTimer(key);
      socketCounts.delete(key);
      socket.roomCode = undefined;
      void socket.leave(roomCode);
      void socket.leave(playerChannel(roomCode, playerId));
      krLeave(roomCode, playerId);
      emitRoom(nsp, roomCode);
    });

    socket.on("start", async () => {
      const { roomCode: code, playerId } = socket;
      if (!code || !playerId) return;
      if (startingRooms.has(code)) {
        socket.emit("toast", "The match is already starting.");
        return;
      }
      startingRooms.add(code);
      try {
        const result = krStart(code, playerId);
        if ("error" in result) {
          socket.emit("toast", result.error);
          return;
        }
        const room = getKrRoom(code);
        if (!room) throw new Error("The room was closed while starting.");
        const referenceId = createMatchReference(`kalu-rajina:${code}`, room.round);
        try {
          await reserveMatchEntries(room.players.map((p) => p.id), referenceId);
          const wallets = await captureMatchEntries(referenceId);
          matchReferences.set(roundKey(code, room.round), referenceId);
          emitWallets(nsp, code, wallets);
          emitRoom(nsp, code);
        } catch (cause) {
          await releaseMatchEntries(referenceId);
          krStop(code, playerId);
          if (cause instanceof InsufficientCoinsError) {
            nsp
              .to(playerChannel(code, cause.userId))
              .emit("toast", `You need ${cause.required.toString()} available coins to play.`);
            if (cause.userId !== playerId) socket.emit("toast", cause.message);
          } else {
            console.error(`Unable to charge Kalu Rajina match ${referenceId}`, cause);
            socket.emit("toast", "The match could not be charged. No coins were taken.");
          }
          emitRoom(nsp, code);
        }
      } finally {
        startingRooms.delete(code);
      }
    });

    socket.on("lobbyReady", ({ ready }: { ready?: boolean } = {}) => {
      if (!socket.roomCode || !socket.playerId) return;
      reply(krReady(socket.roomCode, socket.playerId, Boolean(ready)));
    });

    socket.on("kick", ({ playerId: targetId }: { playerId?: string } = {}) => {
      const { roomCode: code, playerId } = socket;
      if (!code || !playerId || !targetId) return;
      const result = krKick(code, playerId, targetId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      nsp.to(playerChannel(code, targetId)).emit("kicked", "The host removed you from the room.");
      void nsp.in(playerChannel(code, targetId)).socketsLeave(code);
      emitRoom(nsp, code);
    });

    socket.on("stop", () => {
      const { roomCode: code, playerId } = socket;
      if (!code || !playerId) return;
      const round = getKrRoom(code)?.round;
      const result = krStop(code, playerId);
      if (!("error" in result) && round != null) matchReferences.delete(roundKey(code, round));
      reply(result);
    });

    socket.on("draw", ({ index }: { index?: number } = {}) => {
      if (!socket.roomCode || !socket.playerId || typeof index !== "number") return;
      reply(krDraw(socket.roomCode, socket.playerId, index));
    });

    socket.on("shuffle", () => {
      if (!socket.roomCode || !socket.playerId) return;
      reply(krShuffle(socket.roomCode, socket.playerId));
    });

    socket.on("disconnect", () => {
      if (!socket.roomCode || !socket.playerId) return;
      trackSocketDisconnect(nsp, socket.roomCode, socket.playerId);
    });
  });
}
