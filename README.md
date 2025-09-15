RealtimeChat – Full‑Stack Realtime Chat (ASP.NET Core + React)

Overview
- Backend: ASP.NET Core 8, SignalR, EF Core (PostgreSQL), JWT
- Frontend: React (Vite) + Tailwind, SignalR client, WebRTC signaling
- Infra: Dockerfiles, docker-compose, Nginx proxy for API and WebSockets

Key Features
- Auth (JWT), user profiles with avatars
- Conversations with private join code, direct messages (1-1)
- Mentions (@user, @all/@here) + unread mention notifications
- Reactions (emoji), typing indicators, read tracking
- File/image upload (multi-select + drag-and-drop)
- Reply threading (parent message), search messages, infinite scroll history
- Realtime updates via SignalR (messages, reactions, typing)

Quick Start (Docker)
- Prereqs: Docker Desktop
- Run: `docker compose up -d --build`
- Services:
  - API: http://localhost:8080
  - Client: http://localhost:3000

Default Proxy
- From client:
  - `/api` → API REST
  - `/hubs` → SignalR Hub
  - `/uploads` → Static uploaded files from API

Local Development
- Backend: `cd server/RealtimeChat.Api && dotnet run`
- Frontend: `cd client && npm i && npm run dev`

Local (No Docker/WSL)
- Prereqs: .NET SDK 8, Node.js 18+, PostgreSQL 14+ running on `localhost:5432`.
- Client proxy: `client/.env.development` sets `VITE_API_URL=http://localhost:5049`.
- API DB: set `ConnectionStrings:Default` in `server/RealtimeChat.Api/appsettings.Development.json` or use default
  `Host=localhost;Port=5432;Database=realtimechat;Username=postgres;Password=postgres`.
- Run:
  - API: `cd server/RealtimeChat.Api && dotnet run`
  - Client: `cd client && npm i && npm run dev`

Create Database (no Docker)
- Ensure PostgreSQL client is installed (psql): on Windows you can use `winget install -e --id PostgreSQL.PostgreSQL`.
- Then run the helper script to create role + database and write the connection string:
  - `powershell -ExecutionPolicy Bypass -File scripts/setup-db.ps1`
- Options (defaults in parentheses):
  - `-Host (localhost) -Port (5432)`
  - `-AdminUser (postgres) -AdminPassword (postgres)`
  - `-DbName (realtimechat) -AppUser (realtimechat) -AppPassword (realtimechat)`
  - `-WriteAppSettings:$true` to write `appsettings.Development.json`

Notes
- On first boot, API applies EF Core migrations automatically.
- File uploads stored under API `wwwroot/uploads` and proxied via client Nginx.

Environment (Dev)
- API `server/RealtimeChat.Api/appsettings.Development.json`
  - `ConnectionStrings:Default` → PostgreSQL connection
  - `JWT:Key` → at least 32 chars (HMAC-SHA256)
  - `JWT:Issuer` → token issuer
  - `CORS:Origins` → e.g. `["http://localhost:3000","http://127.0.0.1:3000"]`
  - `ROOM:Secret` → secret for generating room codes (defaults to `JWT:Key`)
- Client `client/.env.local`
  - `VITE_API_URL=http://127.0.0.1:5049`
  - `VITE_GIPHY_KEY=YOUR_GIPHY_API_KEY` (optional)

Run Locally (no Docker/WSL)
- API: `cd server/RealtimeChat.Api && dotnet run --urls http://127.0.0.1:5049`
- Client: `cd client && npm run dev` → open `http://localhost:3000`

API Surface (Quick)
- Auth: `POST /api/auth/register`, `POST /api/auth/login`
- Users: `GET /api/users`, `GET /api/users/me`
- Conversations:
  - `POST /api/conversations` (returns Code), `GET /api/conversations`
  - `GET /api/conversations/discover`, `POST /api/conversations/{id}/join { code }`
  - `POST /api/conversations/direct { userId }`, `DELETE /api/conversations/{id}`
  - `GET /api/conversations/{id}/members`, `GET /api/conversations/{id}/code`
- Messages:
  - `GET /api/messages/{conversationId}` (paged history)
  - `POST /api/messages { ConversationId, Content, Type, ParentMessageId?, Metadata? }`
  - `POST /api/messages/upload` (multipart/form-data: conversationId, file)
  - `POST /api/messages/{conversationId}/read` (mark all read)
  - `GET /api/messages/{conversationId}/search?q=...`
  - `POST /api/messages/{id}/reactions`, `DELETE /api/messages/{id}/reactions/{emoji}`
  - `GET /api/messages/mentions?unreadOnly=true`

SignalR
- Endpoint: `/hubs/chat`
- Events from server: `message`, `typing`, `reaction`, `mention`
- Client commands (Hub): `JoinConversation`, `LeaveConversation`, `Typing`, `SendMessage`, `Read`

Documentation
- See `docs/Guide.md` for theory, labs, and production checklist.
- See `docs/API.md` for endpoint details and payloads.

GitHub – Initialize and Push
- Create a repo on GitHub (empty, without README/License to avoid conflicts)
- In project root:
  - `git init`
  - `git add .`
  - `git commit -m "chore: initial import RealtimeChat"`
  - `git branch -M main`
  - `git remote add origin https://github.com/<your-user>/<your-repo>.git`
  - `git push -u origin main`

CI (GitHub Actions)
- A ready-made workflow is provided at `.github/workflows/ci.yml` that builds the API and client.
