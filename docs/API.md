# RealtimeChat API Reference (v1)

Tất cả REST endpoint (trừ đăng ký/đăng nhập) yêu cầu JWT Bearer. Gửi `Authorization: Bearer <token>`. SignalR hub nhận token qua query `access_token`.

## Auth
### POST /api/auth/register
- Body: `{ "username": "string", "password": "string", "displayName": "string?" }`
- 200 → `{ token, id, username, displayName, avatarUrl }

### POST /api/auth/login
- Body: `{ "username": "string", "password": "string" }`
- 200 → `{ token, id, username, displayName, avatarUrl }

## Users
### GET /api/users
- 200 → `[ { id, username, displayName, avatarUrl, lastSeenAt } ]`

### GET /api/users/me
- 200 → `{ id, username, displayName, avatarUrl, lastSeenAt }

### PUT /api/users/me
- Body: `{ displayName?, username?, password?, avatarUrl? }
- 200 → `{ id, username, displayName, avatarUrl }

### POST /api/users/avatar
- multipart/form-data: `file`
- 200 → `{ avatarUrl }

## Conversations
### POST /api/conversations
- Body: `{ "name": "string", "type": 0|1|2, "members": [guid]? }`
- 200 → `{ id, name, type, code }

### GET /api/conversations
- 200 → `[ { conversationId, name, type, unreadCount? } ]`

### GET /api/conversations/discover
- 200 → `[ { id, name, type } ]`

### POST /api/conversations/{id}/join
- Body: `{ code: "string" }`
- 204

### POST /api/conversations/direct
- Body: `{ userId: guid }`
- 200 → `{ id, name, type }

### DELETE /api/conversations/{id}
- 204 (Owner/Admin)

### GET /api/conversations/{id}/members
- 200 → `[ { userId, username, displayName, avatarUrl, role, lastSeenAt } ]`

### POST /api/conversations/{id}/members
- Body: `guid` (userId)
- 204 (Owner/Admin)

### DELETE /api/conversations/{id}/members/{userId}
- 204 (Owner/Admin)

### POST /api/conversations/{id}/leave
- 204

### GET /api/conversations/{id}/code
- 200 → `{ code }

## Messages
### GET /api/messages/{conversationId}
- Query: `page=1&pageSize=50`
- 200 → `{ total, page, pageSize, items: [ MessageDto ] }

**MessageDto**
```
{
  id,
  conversationId,
  type,               // 0=Text,1=Image,2=File,3=Voice,4=System
  content,
  metadata,
  parentMessageId,
  senderId,
  senderUsername,
  senderDisplayName,
  senderAvatarUrl,
  createdAt,
  editedAt,
  ephemeralExpiresAt,
  reactions: [ { emoji, count } ]
}
```

### POST /api/messages
- Body: `{ conversationId, content, type, parentMessageId?, metadata? }
- 200 → `{ id, createdAt }

### POST /api/messages/upload
- multipart/form-data: `conversationId`, `file`
- 200 → `{ id, url, type }

### POST /api/messages/{conversationId}/read
- 204

### GET /api/messages/{conversationId}/search
- Query: `q`, `page`, `pageSize`
- 200 → `[ { id, content, type, senderId, senderUsername, senderDisplayName, createdAt, metadata } ]`

### POST /api/messages/{id}/reactions
- Body: JSON string `"emoji"`
- 204

### DELETE /api/messages/{id}/reactions/{emoji}
- 204

### GET /api/messages/mentions
- Query: `unreadOnly=true|false`, `page`, `pageSize`
- 200 → `[ { id, conversationId, messageId, senderId, senderDisplayName, content, createdAt, isRead } ]`

## Uploads & Static
- `/uploads/{filename}` – proxy từ client nginx → API `wwwroot/uploads`.

## SignalR Hub `/hubs/chat`
- **Kết nối**: `new HubConnectionBuilder().withUrl("/hubs/chat", { accessTokenFactory: () => localStorage.token })`.
- **Client method**:
  - `JoinConversation(Guid id)`
  - `LeaveConversation(Guid id)`
  - `Typing(Guid id, bool isTyping)`
  - `SendMessage(object payload)` – giống body REST
  - `Read(Guid conversationId, Guid? lastMessageId)`
  - `SendOffer/SendAnswer/SendIceCandidate` (WebRTC signaling)
- **Server events**:
  - `message` → `{ conversationId, messageDto }`
  - `typing` → `{ conversationId, userId, isTyping }`
  - `reaction` → `{ messageId, emoji, op }`
  - `mention` → `{ conversationId, messageId, senderId }`
  - `callStarted`, `callJoined`, `callEnded`, `offer`, `answer`, `candidate`

## Lỗi chung
- 400: payload không hợp lệ / thiếu field (kiểm tra message JSON).
- 401: không có/không đúng JWT.
- 403: không đủ quyền (v.d xoá phòng, thêm thành viên khi không phải admin/owner).
- 404: tài nguyên không tồn tại hoặc user không thuộc phòng.
- 429: nếu enable rate limiting.
- 500: lỗi server, kiểm tra log API.

## Tips triển khai
- Bật gzip/HTTP3 trên reverse proxy cho client bundle.
- Nếu tách domain client/API, nhớ cập nhật `CORS:Origins` và `VITE_API_URL`.
- Để scale SignalR: dùng Redis backplane (`StackExchangeRedis`) hoặc Azure SignalR Service.
- Thay thế file storage: implement `IFileStorage` và inject vào DI.
