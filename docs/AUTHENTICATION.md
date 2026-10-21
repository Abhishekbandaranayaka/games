# Higanna authentication

Phase 2 uses Better Auth with the Prisma/MySQL adapter. Players sign up with
an email address, a password, and a username. The username is stored as the
public player name. Password credentials use Better Auth's password hashing flow.

## Required environment variables

```env
DATABASE_URL="mysql://higanna_app:password@127.0.0.1:3306/higanna"
BETTER_AUTH_SECRET="long-random-secret"
BETTER_AUTH_URL="http://45.79.125.85/play/api/auth"
```

Generate the authentication secret on the target server:

```bash
openssl rand -base64 48
```

Keep both secrets only in the server `.env` file with mode `600`. The auth URL
must be the complete externally visible Better Auth API path. Change it to the
HTTPS domain when TLS is enabled.

## Security configuration

- Passwords are 10 to 128 characters and are hashed by Better Auth.
- Usernames are 3 to 20 letters, numbers, or underscores. The server rejects a
  username that is already taken, including a different mix of capital letters.
- Sessions expire after 30 days and refresh at most once per day.
- Authentication rate limiting is enabled in every environment.
- Cookies are HTTP-only. Secure cookies turn on automatically when
  `BETTER_AUTH_URL` begins with `https://`.
- Nginx supplies the client address through `X-Real-IP`.

The current IP-based HTTP deployment is acceptable only as a development
environment. Use a domain and HTTPS before accepting real public accounts.

## Socket.IO identity (Phase 3)

- Every Socket.IO handshake is authenticated from the HTTP-only Better Auth
  session cookie before the connection is accepted.
- Player IDs and names come from the authenticated database user. Create,
  join, leave, ready and stop events do not accept identity from the browser.
- Reconnection uses the same user ID, rejoins the existing seat, and does not
  double-count presence when the browser focuses repeatedly.
- Personal Socket.IO channels are scoped by both room code and user ID so a
  second room cannot receive another room's private hand state.
- Production socket requests must have the same origin host as the request
  forwarded by Nginx.
- Signing out explicitly closes the existing authenticated socket.

## Deployment verification

After installing, building, migrating, and restarting the app:

1. `GET /play/api/auth/get-session` returns `null` before login.
2. Signup creates one `user`, one credential `account`, and one `session` row.
3. The username chosen at signup appears on the home screen. A second signup
   with that same username is rejected.
4. Sign out invalidates the session and returns to the account screen.
5. Direct room URLs show the account screen until authentication succeeds.
6. A Socket.IO connection without the session cookie is rejected with
   `UNAUTHORIZED`.
7. Refreshing a joined room reconnects the same database user to the same seat.
