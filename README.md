# FriendCall v2 💬📞📹

WhatsApp-style app — message, voice call & video call friends by phone number.

## Features
- Register with your name + phone number (no OTP, demo-ready)
- Add friends by their phone number
- Real-time messaging with typing indicators
- **Voice call** (audio only) 🎙️
- **Video call** (peer-to-peer via WebRTC) 📹
- Unread message badges
- Contacts saved across refresh (sessionStorage)

---

## Run Locally

```bash
npm install
npm start
# Open http://localhost:3000
```

**To test:** Open two browser tabs → register with different phone numbers → add each other as contacts → chat & call!

---

## Deploy Free

### Railway (fastest)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Render.com
1. Push to GitHub
2. New Web Service → connect repo
3. Build: `npm install` | Start: `node server.js`

---

## How Calling Works

```
Voice/Video Call:
  User A  ──[offer via Socket.io]──►  Server  ──►  User B
  User A  ◄──[answer via Socket.io]──  Server  ◄──  User B
  User A  ◄══════[direct WebRTC stream]══════►  User B
```

The server only handles the initial handshake (signaling).
The actual audio/video goes directly between browsers (peer-to-peer).
