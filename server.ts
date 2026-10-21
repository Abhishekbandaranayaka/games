import { createServer, type IncomingMessage } from "http";
import { networkInterfaces } from "os";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { attachKaluRajinaSocket } from "./src/server/kalu-rajina/socket";
import { attachGameSocket } from "./src/server/socket";

const dev = process.env.NODE_ENV !== "production";
// Use HOST instead of HOSTNAME: container runtimes commonly reserve HOSTNAME
// for the container ID, which is not a suitable listen address.
const listenHost = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
// Bind Next to all interfaces so HMR websockets work over LAN IP.
const hostname = "0.0.0.0";

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value?.split(",")[0]?.trim();
}

function socketRequestAllowed(request: IncomingMessage): boolean {
  const origin = firstHeader(request.headers.origin);
  if (!origin || dev) return true;
  const host =
    firstHeader(request.headers["x-forwarded-host"]) || firstHeader(request.headers.host);
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function lanAddress(): string | null {
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family !== "IPv4" || net.internal) continue;
      if (
        net.address.startsWith("192.168.") ||
        net.address.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(net.address)
      ) {
        return net.address;
      }
    }
  }
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url || "", true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: `${basePath}/socket.io`,
    cors: {
      origin: true,
      credentials: true,
    },
    allowRequest(request, callback) {
      callback(null, socketRequestAllowed(request));
    },
  });
  attachGameSocket(io);
  attachKaluRajinaSocket(io);

  httpServer.listen(port, listenHost, () => {
    const lan = lanAddress();
    console.log(`Sellam ready on http://localhost:${port}`);
    if (lan) console.log(`Share on LAN: http://${lan}:${port}`);
  });
});
