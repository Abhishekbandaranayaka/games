# Production deployment

This game must run as one persistent Node.js process because Socket.IO and the
active game rooms live in memory. Do not deploy it as a static site, and do not
start multiple replicas unless the room store and Socket.IO adapter are first
moved to a shared service such as Redis.

## Recommended server layout

- Ubuntu/Debian VPS with Docker and the Docker Compose plugin
- This app bound privately to `127.0.0.1:3000`
- Caddy or Nginx in front for the public domain, HTTPS and WebSockets
- A DNS `A` record pointing the game domain to the server's public IPv4 address

The smallest practical server is usually 1 vCPU and 1 GB RAM. Use current
Docker packages from your server provider or Docker's official repository.

## 1. Upload and start the app

Copy this project to the server, then run from the project directory:

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3000/api/health
```

The health response should be `{"status":"ok"}`. View logs with:

```bash
docker compose logs -f --tail=100 higanna
```

## 2. Add a domain and HTTPS

First create a DNS record such as `game.example.com` pointing to the server.
Allow inbound TCP ports 80 and 443 in the server/provider firewall.

### Caddy (simplest)

Install Caddy on the host and add this to `/etc/caddy/Caddyfile`:

```caddy
game.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Then validate and reload it:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains and renews the TLS certificate automatically. Its reverse proxy
supports WebSockets without extra directives.

### Nginx

Copy `deploy/nginx.conf.example` to
`/etc/nginx/sites-available/higanna`, replace `game.example.com`, enable the
site, and obtain a certificate (for example with Certbot):

```bash
sudo ln -s /etc/nginx/sites-available/higanna /etc/nginx/sites-enabled/higanna
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d game.example.com
```

## 3. Verify multiplayer operation

Open the HTTPS domain in two separate browsers/devices. Create a room on one,
open its shared invite link on the other, and confirm both players appear in the
same lobby. The Socket.IO path is `/socket.io/`; the included proxy examples
forward its WebSocket upgrade automatically.

## Updating

Upload or pull the new source, then rebuild the one service:

```bash
docker compose up -d --build
docker image prune -f
```

Rebuilding or restarting closes all active rooms because rooms are currently
stored in memory. Schedule updates when games are not in progress.

## Direct IP test without a reverse proxy

For a short test only, change the Compose port mapping to `3000:3000`, allow TCP
port 3000 in the firewall, and visit `http://SERVER_IP:3000`. Restore the
loopback-only mapping after the domain proxy is working.

## Non-Docker alternative

Install Node.js 22 and a process manager on the server, then run:

```bash
npm ci
npm run build
PORT=3000 HOST=127.0.0.1 npm start
```

Keep `npm start` supervised with systemd or a process manager. The reverse
proxy configuration is the same as above.
