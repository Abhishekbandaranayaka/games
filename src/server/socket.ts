import type { Server, Socket } from "socket.io";
import { auth } from "./auth";
import {
  getRoom,
  ensureTurnClock,
  hostCreate,
  joinRoom,
  kickFromLobby,
  leaveRoom,
  markOffline,
  pass,
  play,
  endRound,
  setLobbyReady,
  setRoomUpdateListener,
  startGame,
  stopGame,
  tribute,
} from "./rooms";
import { toClientView } from "../lib/engine";
import type { JokerDeclaration } from "../lib/types";
import { isSafeReactionId, isValidReaction, sanitizeComment, REACTION_COOLDOWN_MS } from "../lib/reactions";
import { createMatchReference } from "./economy-config";
import {
  awardMatchRewards,
  captureMatchEntries,
  InsufficientCoinsError,
  releaseMatchEntries,
  reserveMatchEntries,
  type WalletSnapshot,
} from "./wallet";

type PlayerSocket = Socket & {
  playerId?: string;
  roomCode?: string;
  playerName?: string;
};

/** Keep players in the game while the app is backgrounded; only go offline after a long absence. */
const DISCONNECT_GRACE_MS = 30 * 60 * 1000;

function emitRoom(io: Server, code: string) {
  const room = ensureTurnClock(code) ?? getRoom(code);
  if (!room) {
    io.to(code).emit("state", { error: "The room was closed." });
    return;
  }
  for (const p of room.players) {
    io.to(playerChannel(code, p.id)).emit("state", toClientView(room, p.id));
  }
  if (room.phase === "finished") void settleFinishedRoom(io, code);
}

function presenceKey(code: string, playerId: string) {
  return `${code}:${playerId}`;
}

const socketCounts = new Map<string, number>();
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastReactionAt = new Map<string, number>();
const startingRooms = new Set<string>();
const matchReferences = new Map<string, string>();
const settlingMatches = new Set<string>();

function roundKey(code: string, round: number) {
  return `${code}:${round}`;
}

function emitWallets(io: Server, code: string, wallets: WalletSnapshot[]) {
  for (const wallet of wallets) {
    io.to(playerChannel(code, wallet.userId)).emit("wallet", {
      balance: wallet.balance.toString(),
      reservedBalance: wallet.reservedBalance.toString(),
      availableBalance: wallet.availableBalance.toString(),
    });
  }
}

async function settleMatchRewards(
  io: Server,
  code: string,
  key: string,
  referenceId: string,
  kingId: string,
  queenId: string,
  attempt = 1,
) {
  if (settlingMatches.has(referenceId)) return;
  settlingMatches.add(referenceId);
  try {
    const wallets = await awardMatchRewards(referenceId, kingId, queenId);
    emitWallets(io, code, wallets);
    if (matchReferences.get(key) === referenceId) matchReferences.delete(key);
  } catch (cause) {
    console.error(`Unable to settle rewards for ${referenceId}`, cause);
    if (attempt < 10) {
      setTimeout(
        () =>
          void settleMatchRewards(
            io,
            code,
            key,
            referenceId,
            kingId,
            queenId,
            attempt + 1,
          ),
        5_000,
      );
    }
  } finally {
    settlingMatches.delete(referenceId);
  }
}

function settleFinishedRoom(io: Server, code: string) {
  const room = getRoom(code);
  if (!room || room.phase !== "finished") return;
  const key = roundKey(code, room.round);
  const referenceId = matchReferences.get(key);
  if (!referenceId) return;
  const king = room.players.find((player) => player.finishOrder === 1);
  const queen = room.players.find((player) => player.finishOrder === 2);
  if (!king || !queen) return;
  void settleMatchRewards(io, code, key, referenceId, king.id, queen.id);
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

function trackSocketDisconnect(io: Server, code: string, playerId: string) {
  const key = presenceKey(code, playerId);
  const next = Math.max(0, (socketCounts.get(key) ?? 1) - 1);
  if (next === 0) {
    socketCounts.delete(key);
    clearOfflineTimer(key);
    const timer = setTimeout(() => {
      offlineTimers.delete(key);
      if ((socketCounts.get(key) ?? 0) > 0) return;
      markOffline(code, playerId);
      const room = getRoom(code);
      if (room) emitRoom(io, code);
    }, DISCONNECT_GRACE_MS);
    offlineTimers.set(key, timer);
  } else {
    socketCounts.set(key, next);
  }
}

function requestHeaders(socket: Socket): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(socket.handshake.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  return headers;
}

function playerChannel(code: string, playerId: string) {
  return `player:${code}:${playerId}`;
}

function bindSocketToRoom(io: Server, socket: PlayerSocket, code: string) {
  if (!socket.playerId) return;
  if (socket.roomCode === code) {
    clearOfflineTimer(presenceKey(code, socket.playerId));
    return;
  }
  if (socket.roomCode) {
    trackSocketDisconnect(io, socket.roomCode, socket.playerId);
    void socket.leave(socket.roomCode);
    void socket.leave(playerChannel(socket.roomCode, socket.playerId));
  }
  socket.roomCode = code;
  void socket.join(code);
  void socket.join(playerChannel(code, socket.playerId));
  trackSocketJoin(code, socket.playerId);
}

export function attachGameSocket(io: Server) {
  setRoomUpdateListener((code) => emitRoom(io, code));

  io.use(async (rawSocket, next) => {
    try {
      const session = await auth.api.getSession({ headers: requestHeaders(rawSocket) });
      if (!session) {
        const error = new Error("Authentication required.") as Error & {
          data?: { code: string };
        };
        error.data = { code: "UNAUTHORIZED" };
        next(error);
        return;
      }
      const socket = rawSocket as PlayerSocket;
      socket.playerId = session.user.id;
      socket.playerName = session.user.name;
      next();
    } catch (cause) {
      console.error("Socket authentication failed", cause);
      next(new Error("Authentication is temporarily unavailable."));
    }
  });

  io.on("connection", (socket: PlayerSocket) => {
    socket.on("create", () => {
      const playerId = socket.playerId;
      const name = socket.playerName;
      if (!playerId || !name) return;
      if (socket.roomCode && getRoom(socket.roomCode)) {
        bindSocketToRoom(io, socket, socket.roomCode);
        emitRoom(io, socket.roomCode);
        return;
      }
      const view = hostCreate(playerId, name);
      bindSocketToRoom(io, socket, view.code);
      emitRoom(io, view.code);
    });

    socket.on(
      "join",
      ({ code }: { code?: string }) => {
        const playerId = socket.playerId;
        const name = socket.playerName;
        if (!playerId || !name || !code?.trim()) {
          socket.emit("state", { error: "Enter a room code." });
          return;
        }
        const result = joinRoom(code.trim().toUpperCase(), playerId, name);
        if ("error" in result) {
          socket.emit("state", result);
          return;
        }
        bindSocketToRoom(io, socket, result.code);
        emitRoom(io, result.code);
      },
    );

    socket.on("leave", () => {
      const roomCode = socket.roomCode;
      const id = socket.playerId;
      if (!roomCode || !id) return;
      const key = presenceKey(roomCode, id);
      clearOfflineTimer(key);
      socketCounts.delete(key);
      socket.roomCode = undefined;
      void socket.leave(roomCode);
      void socket.leave(playerChannel(roomCode, id));
      leaveRoom(roomCode, id);
      const room = getRoom(roomCode);
      if (room) emitRoom(io, roomCode);
      else io.to(roomCode).emit("state", { error: "The room was closed." });
    });

    socket.on("start", async () => {
      if (!socket.roomCode || !socket.playerId) return;
      const code = socket.roomCode;
      if (startingRooms.has(code)) {
        socket.emit("toast", "The match is already starting.");
        return;
      }
      startingRooms.add(code);
      let referenceId: string | null = null;
      try {
        const result = startGame(code, socket.playerId);
        if ("error" in result) {
          socket.emit("toast", result.error);
          return;
        }
        const room = getRoom(code);
        if (!room) throw new Error("The room was closed while starting.");
        referenceId = createMatchReference(code, room.round);
        const playerIds = room.players.map((player) => player.id);

        try {
          await reserveMatchEntries(playerIds, referenceId);
          const wallets = await captureMatchEntries(referenceId);
          matchReferences.set(roundKey(code, room.round), referenceId);
          emitWallets(io, code, wallets);
          emitRoom(io, result.code);
        } catch (cause) {
          await releaseMatchEntries(referenceId);
          stopGame(code, socket.playerId);
          if (cause instanceof InsufficientCoinsError) {
            io.to(playerChannel(code, cause.userId)).emit(
              "toast",
              `You need ${cause.required.toString()} available coins to play.`,
            );
            if (cause.userId !== socket.playerId) {
              socket.emit("toast", cause.message);
            }
          } else {
            console.error(`Unable to charge match ${referenceId}`, cause);
            socket.emit("toast", "The match could not be charged. No coins were taken.");
          }
          emitRoom(io, code);
        }
      } finally {
        startingRooms.delete(code);
      }
    });

    socket.on("lobbyReady", ({ ready }: { ready?: boolean }) => {
        const roomCode = socket.roomCode;
        const id = socket.playerId;
        if (!roomCode || !id) {
          socket.emit("toast", "Not connected to a room.");
          return;
        }
        const result = setLobbyReady(roomCode, id, Boolean(ready));
        if ("error" in result) {
          socket.emit("toast", result.error);
          return;
        }
        emitRoom(io, result.code);
    });

    socket.on("kick", ({ playerId: targetId }: { playerId?: string }) => {
      if (!socket.roomCode || !socket.playerId || !targetId) return;
      const code = socket.roomCode;
      const result = kickFromLobby(code, socket.playerId, targetId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      io.to(playerChannel(code, targetId)).emit("kicked", "The host removed you from the room.");
      void io.in(playerChannel(code, targetId)).socketsLeave(code);
      emitRoom(io, result.code);
    });

    socket.on("stop", () => {
      const code = socket.roomCode;
      const playerId = socket.playerId;
      if (!code || !playerId) {
        socket.emit("toast", "Not connected to a room.");
        return;
      }
      const result = stopGame(code, playerId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      const room = getRoom(code);
      if (room) matchReferences.delete(roundKey(code, room.round));
      emitRoom(io, result.code);
    });

    socket.on(
      "play",
      ({
        cardIds,
        jokerAs,
      }: {
        cardIds: string[];
        jokerAs?: Record<string, { rank: string; suit: string }>;
      }) => {
        if (!socket.roomCode || !socket.playerId) return;
        let jokerDeclarations: Record<string, JokerDeclaration> = {};
        if (jokerAs) {
          jokerDeclarations = Object.fromEntries(
            Object.entries(jokerAs).map(([id, value]) => [
              id,
              {
                rank: value.rank as
                  | "3"
                  | "4"
                  | "5"
                  | "6"
                  | "7"
                  | "8"
                  | "9"
                  | "10"
                  | "J"
                  | "Q"
                  | "K"
                  | "A"
                  | "2",
                suit: value.suit as "spades" | "hearts" | "clubs" | "diamonds",
              },
            ]),
          );
        }
        const result = play(socket.roomCode, socket.playerId, cardIds, jokerDeclarations);
        if ("error" in result) {
          socket.emit("toast", result.error);
          return;
        }
        emitRoom(io, result.code);
      },
    );

    socket.on("pass", () => {
      if (!socket.roomCode || !socket.playerId) return;
      const result = pass(socket.roomCode, socket.playerId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      emitRoom(io, result.code);
    });

    socket.on("endRound", () => {
      if (!socket.roomCode || !socket.playerId) return;
      const result = endRound(socket.roomCode, socket.playerId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      emitRoom(io, result.code);
    });

    socket.on("tribute", ({ cardId }: { cardId: string }) => {
      if (!socket.roomCode || !socket.playerId) return;
      const result = tribute(socket.roomCode, socket.playerId, cardId);
      if ("error" in result) {
        socket.emit("toast", result.error);
        return;
      }
      emitRoom(io, result.code);
    });

    socket.on(
      "reaction",
      ({ kind, value, id }: { kind?: string; value?: string; id?: string }) => {
        if (!socket.roomCode || !socket.playerId) return;
        if (!isValidReaction(kind, value)) return;
        const key = presenceKey(socket.roomCode, socket.playerId);
        const now = Date.now();
        if (now - (lastReactionAt.get(key) ?? 0) < REACTION_COOLDOWN_MS) return;
        lastReactionAt.set(key, now);
        const room = getRoom(socket.roomCode);
        const player = room?.players.find((p) => p.id === socket.playerId);
        const playerName = player?.name || socket.playerName || "Player";
        const reactionId = isSafeReactionId(id)
          ? id
          : `r-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const cleanedValue = kind === "comment" ? sanitizeComment(value) : value;
        if (!cleanedValue) return;
        io.to(socket.roomCode).emit("reaction", {
          id: reactionId,
          playerId: socket.playerId,
          playerName,
          kind,
          value: cleanedValue,
        });
      },
    );

    socket.on("disconnect", () => {
      if (!socket.roomCode || !socket.playerId) return;
      trackSocketDisconnect(io, socket.roomCode, socket.playerId);
    });
  });
}
