ч# TG-WA-Backend API Documentation
Version: 1.0.0

A unified backend API for managing Telegram and WhatsApp communications. This system provides a single interface to handle multi-platform accounts, synchronize message history, and manage real-time interactions via WebSockets.

---

## 1. General Information

### Base URL
`http://localhost:3000/api`

### Content Type
All requests and responses use `application/json` unless otherwise specified (e.g., media uploads).

### Authentication
The API uses JWT (JSON Web Token) for authentication. All protected routes require an `Authorization` header in the following format:
`Authorization: Bearer <your_access_token>`

---

## 2. Authentication API

### Register User
Create a new user account.
- **Endpoint:** `POST /auth/register`
- **Body:**
| Field | Type | Description |
| :--- | :--- | :--- |
| `username` | string | 3-30 characters |
| `email` | string | Valid email address |
| `password` | string | Minimum 8 characters |

### Login
Authenticate and receive access tokens.
- **Endpoint:** `POST /auth/login`
- **Body:** `{ "username": "...", "password": "..." }`
- **Response:**
```json
{
  "success": true,
  "user": { "id": "...", "username": "...", "email": "..." },
  "token": "JWT_ACCESS_TOKEN",
  "refreshToken": "JWT_REFRESH_TOKEN"
}
```

### Refresh Token
Obtain a new access token using a refresh token.
- **Endpoint:** `POST /auth/refresh`
- **Body:** `{ "refreshToken": "..." }`

### Logout
Invalidate the current session.
- **Endpoint:** `POST /auth/logout`
- **Security:** Requires Bearer Token

### Get Current User Profile
- **Endpoint:** `GET /auth/me`
- **Security:** Requires Bearer Token

---

## 3. Accounts Management

### List All Accounts
Retrieve accounts linked to the authenticated user.
- **Endpoint:** `GET /api/accounts`
- **Query Parameters:**
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `platform` | string | Optional: `telegram` or `whatsapp` |

### Add Telegram Bot
Register a Telegram Bot account.
- **Endpoint:** `POST /api/accounts/telegram/bot`
- **Body:**
| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | string | Display name for the account |
| `botToken` | string | The token from @BotFather |

### Add WhatsApp Account
Initiate WhatsApp account registration. Note: This starts the client initialization. You must listen to the `whatsapp:qr` WebSocket event to complete authentication.
- **Endpoint:** `POST /api/accounts/whatsapp`
- **Body:** `{ "name": "Account Name" }`

### Check WhatsApp Status
Get the current connection and authentication status of a WhatsApp account.
- **Endpoint:** `GET /api/accounts/whatsapp/:accountId/auth-status`
- **Response:**
```json
{
  "success": true,
  "status": "pending | authenticated | disconnected",
  "qrCode": "base64_image_data (if pending)"
}
```

### Delete Account
Remove an account and stop all background services (polling/connections) for it.
- **Endpoint:** `DELETE /api/accounts/:accountId`

---

## 4. Dialogs (Chats)

### Get Dialogs
List chats for a specific account, ordered by last activity.
- **Endpoint:** `GET /api/accounts/:accountId/dialogs`

### Sync Dialogs
Manually trigger a synchronization of the dialog list from the platform.
- **Endpoint:** `POST /api/accounts/:accountId/dialogs/sync`

### Sync Chat History
Trigger a deep synchronization of historical messages for a specific dialog.
- **Endpoint:** `POST /api/accounts/:accountId/dialogs/:dialogId/sync-history`
- **Note:** This is an asynchronous background task. Progress is reported via WebSocket.

---

## 5. Messages

### Get Messages
Retrieve message history for a dialog with pagination.
- **Endpoint:** `GET /api/dialogs/:dialogId/messages`
- **Query Parameters:**
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `limit` | number | 100 | Number of messages to return |
| `offset` | number | 0 | Pagination offset |

### Send Text Message
- **Endpoint:** `POST /api/dialogs/:dialogId/messages`
- **Body:** `{ "text": "Your message here" }`

### Send Media Message
Upload and send a file (Image, Video, Document).
- **Endpoint:** `POST /api/dialogs/:dialogId/messages/media`
- **Content-Type:** `multipart/form-data`
- **Body:**
| Field | Type | Description |
| :--- | :--- | :--- |
| `file` | file | The binary file |
| `caption` | string | Optional caption |

### Mark as Read
Acknowledge receipt of messages.
- **Endpoint:** `POST /api/dialogs/:dialogId/messages/mark-read`
- **Body:** `{ "messageIds": ["id1", "id2"] }`

---

## 6. WebSocket API

Real-time updates are provided via `socket.io`.

### Connection & Authentication
Clients must authenticate immediately after connecting.
```javascript
const socket = io('YOUR_BASE_URL');
socket.emit('authenticate', { token: 'YOUR_JWT_TOKEN' });
```

### Inbound Events (Server -> Client)

| Event Name | Payload Description |
| :--- | :--- |
| `message:new` | Triggered when a new message is received. Contains full message object. |
| `message:updated` | Triggered when a message is edited, deleted, or its status changes. |
| `message:status` | Updates on message delivery/read status. |
| `whatsapp:qr` | Provides the QR code string for WhatsApp authentication. |
| `whatsapp:authenticated` | Confirms successful WhatsApp login. |
| `whatsapp:disconnected` | Notification when an account loses connection. |
| `chat:typing` | Real-time typing indicators. |
| `chat:history_sync_progress` | Progress updates for deep history synchronization. |
| `dialog:updated` | Updates to dialog metadata (e.g., unread count, last message). |

---

## 7. Data Structures

### Account Object
```json
{
  "_id": "...",
  "platform": "telegram | whatsapp",
  "name": "...",
  "whatsappAuthStatus": "authenticated",
  "isActive": true,
  "lastSyncAt": "ISODate"
}
```

### Dialog Object
```json
{
  "_id": "...",
  "accountId": "...",
  "platform": "...",
  "externalChatId": "...",
  "name": "...",
  "unreadCount": 0,
  "lastMessage": {
    "text": "...",
    "timestamp": "ISODate",
    "fromMe": false
  }
}
```

### Message Object
```json
{
  "_id": "...",
  "dialogId": "...",
  "text": "...",
  "messageType": "text | photo | video | document | audio",
  "fromMe": true,
  "status": "sent | delivered | read",
  "sentAt": "ISODate",
  "media": {
    "url": "...",
    "mimeType": "...",
    "fileName": "..."
  }
}
```

---

## 8. Error Codes

The API returns standard HTTP status codes:
- `200/201`: Success
- `400`: Bad Request (Validation failed)
- `401`: Unauthorized (Invalid or missing token)
- `403`: Forbidden (Insufficient permissions)
- `404`: Not Found (Resource does not exist)
- `500`: Internal Server Error

**Error Response Body:**
```json
{
  "success": false,
  "error": "Short description of the error",
  "details": "Extended debugging information (optional)"
}
```
