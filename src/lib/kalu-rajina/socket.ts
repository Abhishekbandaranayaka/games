"use client";

import { io, type Socket } from "socket.io-client";
import { withBasePath } from "../basePath";

let socket: Socket | null = null;

/** Connection to the /kalu-rajina Socket.IO namespace (same server, same login cookie). */
export function getKrSocket(): Socket {
  if (!socket) {
    socket = io("/kalu-rajina", {
      autoConnect: true,
      path: withBasePath("/socket.io"),
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 60000,
    });
  }
  return socket;
}

export function disconnectKrSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}
