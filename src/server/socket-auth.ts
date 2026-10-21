import type { Socket } from "socket.io";
import { auth } from "./auth";

export type AuthedSocket = Socket & {
  playerId?: string;
  roomCode?: string;
  playerName?: string;
};

function requestHeaders(socket: Socket): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(socket.handshake.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  return headers;
}

/** Socket.IO middleware: attach the signed-in Sellam user, or reject with UNAUTHORIZED. */
export async function authenticateSocket(rawSocket: Socket, next: (err?: Error) => void) {
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
    const socket = rawSocket as AuthedSocket;
    socket.playerId = session.user.id;
    socket.playerName = session.user.name;
    next();
  } catch (cause) {
    console.error("Socket authentication failed", cause);
    next(new Error("Authentication is temporarily unavailable."));
  }
}
