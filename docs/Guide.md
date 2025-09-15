# RealtimeChat – Hướng dẫn chi tiết

## Lý thuyết
- SignalR: Kết nối realtime (WebSocket), group theo `conversationId`, sự kiện `message`, `typing`, `read`, signaling WebRTC (`offer/answer/candidate`).
- JWT: Xác thực bằng Bearer token. API và SignalR Hub cùng dùng token.
- EF Core: ORM cho PostgreSQL. Migrations áp dụng tự động trong `Program.cs` (`Database.Migrate()`).
- WebRTC: 1–1 call sử dụng signaling qua Hub để trao đổi SDP Offer/Answer và ICE Candidate. Cần STUN/TURN ở production.
- Mention: Phân tích nội dung tin nhắn để tìm `@username`/`@all`, tạo bản ghi `Mention` và gửi thông báo.
- Thread (reply): Tin nhắn có `ParentMessageId` để hiển thị theo thread.
- Ephemeral: Trường `EphemeralExpiresAt` để client hiển thị đếm ngược và ẩn sau khi hết hạn.
- Quyền hạn: `ConversationMember.Role` (Owner/Admin/Member) kiểm soát thêm/xóa thành viên và tác vụ quản trị.

## Thực hành (Labs)
1. Đăng ký/Đăng nhập và gọi `GET /api/users/me` để xác nhận JWT.
2. Tạo cuộc trò chuyện nhóm: `POST /api/conversations` với `{ name, type: 1, members: [userId...] }`.
3. Tham gia group trong client bằng `JoinConversation(conversationId)` và gửi tin nhắn realtime qua Hub `SendMessage`.
4. Upload ảnh/file: `POST /api/messages/upload` và xem preview trong UI.
5. Thread: Gửi `ParentMessageId` khi reply, hiển thị panel thread bên phải.
6. Mention: Thêm logic client parse `@username` và highlight; server lưu `Mentions`.
7. Ephemeral: Gửi `EphemeralSeconds`, client hiển thị đếm ngược và ẩn tin sau hạn.
8. Read receipts: Gọi Hub `Read(conversationId, messageId)` sau khi render, lắng nghe sự kiện `read`.
9. Typing indicator: Gọi Hub `Typing(conversationId, true/false)` khi nhập và dừng.
10. WebRTC 1–1: Tạo peer connection, gửi offer/answer/candidate qua Hub.

## Checklist Production
- HTTPS ở client và API; đặt `ASPNETCORE_URLS=https://+` và thêm cert hợp lệ.
- TURN server (coturn) để WebRTC hoạt động ổn định sau NAT/firewall.
- Scaling SignalR: Dùng Azure SignalR hoặc Redis backplane (`Microsoft.AspNetCore.SignalR.StackExchangeRedis`).
- Storage: Lưu file lên S3/GCS/Azure Blob thay vì local.
- Auth: Băm mật khẩu với salt và thư viện chuẩn (e.g., ASP.NET Identity hoặc BCrypt/Argon2).
- Rate limiting và input validation.
- Observability: Serilog + OpenTelemetry, health checks.
- CI/CD: Build multi-stage Docker images, chạy migrations trước khi deploy.
- Backups: Automated PG backups và retention.
- Security headers qua Nginx/Ingress; CSP, CORS chặt chẽ.

