# RealtimeChat – Kiến trúc & Hướng dẫn toàn diện

## 1. Kiến trúc tổng quan
- **Client (React + Vite + Tailwind)**: SPA responsive với SignalR client, WebRTC call panel, pastel theme, hỗ trợ dark mode và drawer di động.
- **API (ASP.NET Core 8)**: REST + SignalR hub, JWT auth, EF Core truy cập PostgreSQL, auto migrations trong `Program.cs`.
- **Realtime**: SignalR dùng WebSocket (fallback SSE/Long Poll). Hub `/hubs/chat` gửi sự kiện message/reaction/mention/typing/call.
- **CSDL (PostgreSQL)**: Quan hệ giữa Users, Conversations, ConversationMembers, Messages, Reactions, Mentions.
- **File storage**: Mặc định lưu tại `wwwroot/uploads`, client proxy qua `/uploads`. Có thể thay thế bằng S3/Blob thông qua `IFileStorage`.
- **Infra**: Dockerfiles cho API & Client, `docker-compose.yml`, reverse proxy nginx (client/nginx.conf) xử lý `/api`, `/hubs`, `/uploads`.

### Luồng dữ liệu chính
1. **Auth**: Client đăng nhập → `/api/auth/login` trả JWT → lưu localStorage → axios interceptor gắn `Authorization` header, SignalR gắn query `access_token`.
2. **Danh sách phòng**: Client gọi `/api/conversations` + `/api/conversations/discover`, cache vào state + drawer.
3. **Tin nhắn realtime**: 
   - Lịch sử: `/api/messages/{conversationId}` (paging).
   - Tin mới: hub `message` → cập nhật danh sách, tăng badge chưa đọc nếu không mở phòng.
   - Reactions/typing: hub `reaction`, `typing` cập nhật state cục bộ.
4. **Mention**: API parse nội dung, lưu `Mention` → hub `mention` + REST `GET /api/messages/mentions`.
5. **WebRTC**: Call start → hub broadcast, client đảm bảo `MediaStream`, đàm phán offer/answer/ICE cũng qua hub.

## 2. Mô hình dữ liệu
- **User**: `Id`, `Username`, `DisplayName`, `AvatarUrl`, `LastSeenAt`, hash mật khẩu.
- **Conversation**: `Id`, `Name`, `Type` (Direct=0, Group=1, Channel=2), `CreatedAt`.
- **ConversationMember**: PK composite `(ConversationId, UserId)`, `Role` (Owner/Admin/Member), `JoinedAt`.
- **Message**: `Id`, `ConversationId`, `SenderId`, `Type`, `Content`, `ParentMessageId`, `Metadata (JSON)`, `CreatedAt`, `EphemeralExpiresAt`.
- **Reaction**: `(MessageId, UserId, Emoji)` → đếm trên API.
- **Mention**: `MessageId`, `UserId`, `IsRead`, `CreatedAt`.

## 3. Luồng realtime chi tiết
| Sự kiện | Client gửi | Server xử lý | Client nhận |
|---------|------------|--------------|-------------|
| `SendMessage` | `Hub.SendMessage(payload)` | Lưu DB, detect mention/ephemeral, phát `message` | Append tin nhắn, huy hiệu chưa đọc |
| `Typing` | `Hub.Typing(conversationId, true/false)` | Broadcast `typing` cho member khác | Hiện thông báo “Đang nhập…” |
| `Read` | `Hub.Read(conversationId, messageId)` | Cập nhật trạng thái đọc | Broadcast `messageRead` (nếu cần) |
| `SendOffer/Answer/Candidate` | WebRTC flow | Chuyển tiếp tới peer đích | Thiết lập RTCPeerConnection |
| Reaction REST/Hub | `POST /api/messages/{id}/reactions` | Lưu/huỷ reaction | Hub phát `reaction` |

SignalR cấu hình truy vấn `access_token` trong `Program.cs` để hỗ trợ WebSocket + JWT.

## 4. Bảo mật & cấu hình
- JWT key >= 32 ký tự, rotate định kỳ, có thể tách issuer/audience.
- CORS: đặt origin cụ thể cho SPA + mobile (VD: `http://localhost:3000`, `https://app.example.com`).
- X-Forwarded-* header: khi deploy sau reverse proxy cần `app.UseForwardedHeaders` (không bật sẵn, tùy môi trường).
- Rate limiting: ASP.NET Core 8 hỗ trợ built-in `AddRateLimiter`. Áp dụng cho auth/upload.
- Room code: deterministic 8 ký tự base32, đổi `ROOM:Secret` khi clone dự án.

## 5. Trải nghiệm client
- **Sidebar drawer**: hiển thị “☰” trên màn hình <768px, đóng lại khi chọn phòng mới.
- **Bubble**: Tin của mình (nền trắng viền pastel), tin người khác (nền sky). Mention highlight rõ (trên nền pastel).
- **Call panel**: Dock phía đáy, hiển thị tile local/remote, trạng thái “Đang kết nối…”.
- **Responsive**: Sử dụng Tailwind utility (md:) để điều chỉnh padding, grid call, header.

## 6. Hướng dẫn phát triển
1. `npm run dev` + `dotnet watch run` cho experience hot reload.
2. Lint/build:
   - Client: `npm run lint`, `npm run build`.
   - API: `dotnet format`, `dotnet test`.
3. Log realtime: `docker compose logs -f api` hoặc `dotnet watch run --` (hiện console).
4. Ngrok preview: xem README.
5. Swap storage: implement `IFileStorage` khác (S3, Azure Blob).
6. Thêm hub event: cập nhật `ChatHub`, client `createHubConnection`, state reducer.

## 7. Bài lab / checklist
### Lab gợi ý
1. **Auth flow**: Đăng ký → truy cập `/api/users/me` trong devtools, đảm bảo `Authorization` header.
2. **Group chat**: Tạo phòng + thêm thành viên; verify room code via `/api/conversations/{id}/code`.
3. **Mentions**: Gửi `@username` → xem huy hiệu mention (drawer + `/messages/mentions`).
4. **Reactions**: Thử `POST /api/messages/{id}/reactions` và xem cập nhật realtime.
5. **Upload**: Dùng drag/drop hoặc Postman với multipart; kiểm tra file trong `wwwroot/uploads`.
6. **WebRTC**: Mở 2 trình duyệt → thử gọi, theo dõi ICE log trong console.
7. **Ngrok**: Expose client+API, điều chỉnh `VITE_API_URL` và test trên điện thoại.

### Production checklist
- HTTPS end-to-end; proxy thêm HSTS, CSP, feature-policy.
- Deploy PostgreSQL managed (Azure PG, RDS) hoặc cấu hình streaming backup.
- TURN server (coturn) + STUN public (Google, Cloudflare) cho WebRTC.
- Scaling:
  - API nhiều instance + Redis backplane.
  - Client build `npm run build` → serve qua CDN hoặc nginx static.
- Logging & Observability: Serilog + OpenTelemetry exporter (OTLP), HealthChecks UI.
- Secrets management: dùng Azure KeyVault/AWS Secrets Manager hoặc mounted secrets.
- Background cleanup: Task xóa file epoxy ephemeral, mention read status.

## 8. Cấu trúc thư mục
```
client/        # React, Tailwind, Vite config
├─ public/
├─ src/
│  ├─ lib/     # API, hub helpers
│  ├─ pages/   # App.jsx, Auth.jsx, layout/components
│  └─ ...
server/RealtimeChat.Api/
├─ Controllers/   # Auth, Users, Conversations, Messages
├─ Data/          # AppDbContext, migrations
├─ Hubs/          # ChatHub
├─ Models/        # Entity, DTO
├─ Services/      # TokenService, FileStorage, RoomCodeService
└─ wwwroot/uploads
scripts/         # tiện ích DB
Dockerfile, docker-compose.yml, docs/
```

## 9. Tài liệu liên quan
- `README.md`: khởi động nhanh, ngrok, deploy.
- `docs/API.md`: chi tiết endpoint + payload mẫu.
- `client/src/lib/api.js`: axios wrapper.
- `server/RealtimeChat.Api/RealtimeChat.Api.http`: cặp request mẫu dùng REST Client / VS Code.

> Mẹo: Khi tùy biến giao diện, ưu tiên thêm utility Tailwind thay vì CSS thuần để giữ tính nhất quán giữa chế độ sáng/tối và mobile/desktop.
