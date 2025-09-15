RealtimeChat API Reference (v1)

Auth
- POST /api/auth/register
  - Body: { username, password, displayName? }
  - 200: { token, id, username, displayName, avatarUrl }
- POST /api/auth/login
  - Body: { username, password }
  - 200: { token, id, username, displayName, avatarUrl }

Users
- GET /api/users (auth)
  - 200: [ { id, username, displayName, avatarUrl } ]
- GET /api/users/me (auth)
  - 200: { id, username, displayName, avatarUrl }

Conversations
- POST /api/conversations (auth)
  - Body: { name, type, members?[] }
  - 200: { id, name, type, code }
- GET /api/conversations (auth)
  - 200: [ { conversationId, name, type } ]
- GET /api/conversations/discover (auth)
  - 200: [ { id, name, type } ]
- POST /api/conversations/{id}/join (auth)
  - Body: { code }
  - 204
- POST /api/conversations/direct (auth)
  - Body: { userId }
  - 200: { id, name, type }
- DELETE /api/conversations/{id} (auth, owner/admin)
  - 204
- GET /api/conversations/{id}/members (auth)
  - 200: [ { userId, username, displayName, avatarUrl } ]
- GET /api/conversations/{id}/code (auth)
  - 200: { code }

Messages
- GET /api/messages/{conversationId}?page=1&pageSize=50 (auth)
  - 200: { total, page, pageSize, items: [ { id, content, type, senderId, senderUsername, senderDisplayName, senderAvatarUrl, createdAt, editedAt, parentMessageId, ephemeralExpiresAt, isPinned, metadata, reactions: [ { emoji, count } ] } ] }
- POST /api/messages (auth)
  - Body: { conversationId, content, type, parentMessageId?, metadata? }
  - 200: { id, createdAt }
- POST /api/messages/upload (auth, multipart/form-data)
  - Fields: conversationId, file
  - 200: { id, url }
- POST /api/messages/{conversationId}/read (auth)
  - 204
- GET /api/messages/{conversationId}/search?q=... (auth)
  - 200: [ { id, content, type, sender*, createdAt, metadata } ]
- POST /api/messages/{id}/reactions (auth)
  - Body: "emoji"
  - 204
- DELETE /api/messages/{id}/reactions/{emoji} (auth)
  - 204
- GET /api/messages/mentions?unreadOnly=true&page=1&pageSize=50 (auth)
  - 200: [ { id, conversationId, senderId, sender*, content, type, createdAt, metadata } ]

SignalR
- Endpoint: /hubs/chat (JWT via query `access_token`)
- Client methods: JoinConversation(id), LeaveConversation(id), Typing(id, isTyping), SendMessage(...), Read(...)
- Server events: message, typing, reaction, mention

Types
- MessageType: Text(0), Image(1), File(2), Voice(3), System(4)

Notes
- JWT: use `Authorization: Bearer <token>` for REST; for SignalR pass via query string.
- Room Code: 8-char base32 string derived from server secret; required for joining by id.
