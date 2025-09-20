RealtimeChat – Realtime Collaboration Stack (ASP.NET Core + React)
=================================================================

RealtimeChat is a full-stack chat and collaboration reference built on ASP.NET Core 8 and React (Vite). It showcases a production-style architecture with SignalR realtime messaging, WebRTC call signaling, file uploads, responsive mobile UI, and Docker-based deployment.

Highlights
---------
- **Backend**: ASP.NET Core 8, SignalR, EF Core/PostgreSQL, JWT auth, automatic migrations and room-code service.
- **Frontend**: React + Vite + Tailwind, optimized for mobile/desktop with pastel theming, WebRTC call panel, mention highlighting, toast/typing indicators.
- **Realtime**: SignalR hub for messages, reactions, presence, call signaling; optional WebRTC for 1–1/group video.
- **Storage**: PostgreSQL schema with migrations; local file storage (uploads proxied via client). Easy to swap to S3/Blob.
- **Deployment**: Dockerfiles for API & client, nginx reverse proxy, docs for bare-metal + ngrok previews.

Quick Start (Docker Compose)
----------------------------
1. Install Docker Desktop (or Docker Engine + Compose v2).
2. From the repository root run:
   ```bash
   docker compose up -d --build
   ```
3. Services (default ports):
   - API: <http://localhost:8080>
   - Client: <http://localhost:3000>
   - PostgreSQL: localhost:5432 (user/pass `postgres`/`postgres`).
4. Logs & lifecycle:
   ```bash
   docker compose logs -f api
   docker compose restart client
   docker compose down
   ```
5. First boot auto-applies EF Core migrations and seeds required tables.

Local Development (no Docker)
----------------------------
### Requirements
- .NET SDK 8.0+
- Node.js 18+
- PostgreSQL 14+ running on localhost (or point the connection string to another instance).

### API
```bash
cd server/RealtimeChat.Api
# optional: set ASPNETCORE_ENVIRONMENT=Development
# update appsettings.Development.json or use environment variables (see below)
dotnet watch run --urls http://127.0.0.1:5049
```

### Client
```bash
cd client
npm install
npm run dev
# Vite dev server -> http://localhost:3000
```
Create `client/.env.development` if you want to override the backend:
```
VITE_API_URL=http://127.0.0.1:5049
VITE_GIPHY_KEY=your_optional_giphy_key
```

Database Helpers
----------------
When running outside Docker you can use the PowerShell helper:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-db.ps1 -Host localhost -Port 5432 \
  -AdminUser postgres -AdminPassword postgres -DbName realtimechat \
  -AppUser realtimechat -AppPassword realtimechat -WriteAppSettings:$true
```
The script creates the login/database and optionally writes `appsettings.Development.json` with the connection string.

Configuration Cheat Sheet
-------------------------
API (`server/RealtimeChat.Api/appsettings*.json` or environment variables):
- `ConnectionStrings:Default` – PostgreSQL connection.
- `JWT:Key` (>=32 chars), `JWT:Issuer` – JWT signing + issuer.
- `CORS:Origins` or `CORS__Origin` – allowed origins for SPA/WebSocket.
- `ROOM:Secret` – seed for deterministic room-code generation (defaults to `JWT:Key`).
- `ASPNETCORE_URLS` – e.g. `http://+:8080` or `https://+:8443` for TLS.

Client (`client/.env.*`):
- `VITE_API_URL` – base URL used by axios/SignalR.
- `VITE_GIPHY_KEY` – optional integration for GIF picker.

Ngrok Preview (Ubuntu/Linux)
----------------------------
1. Install ngrok (`sudo snap install ngrok` or APT repo from ngrok docs).
2. Authenticate: `ngrok config add-authtoken <token>`.
3. Create `~/.config/ngrok/realtimechat.yml`:
   ```yaml
   version: "2"
   authtoken: <token>
   tunnels:
     web:
       proto: http
       addr: 3000
     api:
       proto: http
       addr: 8080
   ```
4. Start local services (`docker compose up` or dev servers) and run `ngrok start --all --config ~/.config/ngrok/realtimechat.yml`.
5. Update `client/.env.development` with the generated API URL (e.g. `https://xxxx.ngrok-free.app`) then restart `npm run dev`.

Testing & Quality
-----------------
- API unit/integration tests (if present) → `dotnet test server/RealtimeChat.Api`.
- Frontend checks → `npm run lint` / `npm run build`.
- CI via GitHub Actions (`.github/workflows/ci.yml`) builds both projects and runs tests.

Deployment Notes
----------------
- **Docker**: build and push images (`docker build -t your/api server`, etc.) or ship the provided compose file to a VM.
- **Reverse proxy**: terminate TLS at nginx/Caddy/Traefik; proxy `/api`, `/hubs`, `/uploads` to API; serve the static client bundle.
- **Files**: Uploaded content lives in `server/RealtimeChat.Api/wwwroot/uploads`. Mount a persistent volume or redirect to cloud storage in production.
- **Scaling SignalR**: add Redis backplane (`Microsoft.AspNetCore.SignalR.StackExchangeRedis`) or use a managed service (Azure SignalR) when running multiple API instances.
- ** TURN/WebRTC**: Provide public TURN credentials (coturn) for reliable calling across NAT/firewalls.

Documentation Map
-----------------
- `docs/Guide.md` – architecture deep dive, realtime flows, lab exercises, production checklist.
- `docs/API.md` – REST + SignalR contract reference with payloads.
- `scripts/` – helper utilities (database bootstrap, etc.).

Have fun exploring and customising! Contributions, issue reports, and feature ideas are always welcome.
