# WhatsApp Server

A multi-tenant WhatsApp HTTP server built with [Next.js](https://nextjs.org) and [whatsapp-web.js](https://wwebjs.dev). Each tenant ("app") gets its own isolated WhatsApp client that can be authenticated, receive messages, and send messages via a simple REST/SSE API.

## How it works

- Each `app_id` maps to a separate Puppeteer-driven WhatsApp Web session.
- Sessions persist across restarts using `LocalAuth` (stored in `.wwebjs_auth/`).
- A read-write lock per `app_id` prevents race conditions when multiple requests try to create the same client simultaneously.
- The server listens for `SIGTERM`/`SIGINT` and destroys all Puppeteer browsers cleanly before exiting.

## API

All routes are prefixed with `/api/[app]` where `[app]` is your tenant identifier.

### `GET /api/[app]/init`

Server-Sent Events stream. Opens (or reuses) the WhatsApp client for `[app]` and streams QR codes and connection state until the client is `CONNECTED`.

**Event payload**

```json
{ "state": "SCAN_QR_CODE", "qr": "<raw-qr-string>", "date": "<iso-timestamp>" }
```

Once connected:

```json
{ "state": "CONNECTED" }
```

---

### `GET /api/[app]/listen`

Server-Sent Events stream. Emits the current connection state on open, then streams every incoming WhatsApp message in real time.

**Event payload**

```json
{ "state": "CONNECTED" }
```

```json
{ "message": { "from": "1234567890@c.us", "body": "Hello!" } }
```

---

### `POST /api/[app]/send/[target]`

Send a text message to a phone number. `[target]` is the phone number in international format without `+` (e.g. `447911123456`).

**Request body**

```json
{ "message": "Hello from the API!" }
```

**Responses**

| Status | Meaning |
|--------|---------|
| `200` | Message sent successfully |
| `400` | Missing or invalid `message` field |
| `503` | Client is not connected yet — authenticate first via `/init` |
| `500` | Puppeteer / send error |

## UI

| Path | Description |
|------|-------------|
| `/app/[app_id]/init` | QR-code page — scan with WhatsApp to authenticate |
| `/app/[app_id]/listen` | Live message feed for a connected app |

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:3000/app/<your-app-id>/init` in a browser and scan the QR code with WhatsApp on your phone. Once connected, the session is saved locally and survives restarts.

To start the production server:

```bash
npm run build
npm start
```

## Puppeteer

The server runs a headless Chromium browser per tenant. On a fresh machine you need to install the browser once:

```bash
npm run puppeteer:install
```

If you see sandbox errors in a container environment the launch args `--no-sandbox --disable-setuid-sandbox` are already set in [lib/wa-client.ts](lib/wa-client.ts).

## Development container

A `.devcontainer` configuration is included for VS Code / GitHub Codespaces. It installs Node 22, the GitHub CLI, then runs `.devcontainer/init.sh` on creation.

## Tech stack

- [Next.js 16](https://nextjs.org) — framework (App Router)
- [whatsapp-web.js](https://wwebjs.dev) — WhatsApp Web automation
- [Puppeteer](https://pptr.dev) — headless browser
- [rwlock](https://www.npmjs.com/package/rwlock) — per-client read-write locking
- [qrcode](https://www.npmjs.com/package/qrcode) — QR image rendering in the browser
