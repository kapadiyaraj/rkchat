const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// phone -> { socketId, username, phone }
const users = {};

// socketId -> phone
const socketToPhone = {};

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // Register with phone number + name
  socket.on("register", ({ phone, username }) => {
    users[phone] = { socketId: socket.id, username, phone, online: true };
    socketToPhone[socket.id] = phone;
    socket.data.phone = phone;
    socket.data.username = username;
    socket.emit("registered", { success: true });
    console.log(`Registered: ${username} (${phone})`);
  });

  // Look up a contact by phone number
  socket.on("find-contact", ({ phone }) => {
    const contact = users[phone];
    if (contact && contact.phone !== socket.data.phone) {
      socket.emit("contact-found", {
        phone: contact.phone,
        username: contact.username,
        online: contact.online,
      });
    } else if (contact && contact.phone === socket.data.phone) {
      socket.emit("contact-error", "That's your own number!");
    } else {
      socket.emit("contact-error", "No user found with that number.");
    }
  });

  // Send chat message to a phone number
  socket.on("send-message", ({ toPhone, message }) => {
    const from = socket.data;
    const target = users[toPhone];
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const payload = {
      fromPhone: from.phone,
      fromName: from.username,
      message,
      timestamp,
    };
    // Send to recipient if online
    if (target) {
      io.to(target.socketId).emit("receive-message", payload);
    }
    // Echo back to sender so it appears in their chat
    socket.emit("message-sent", { toPhone, message, timestamp });
  });

  // Typing indicator
  socket.on("typing", ({ toPhone, isTyping }) => {
    const target = users[toPhone];
    if (target) {
      io.to(target.socketId).emit("typing", {
        fromPhone: socket.data.phone,
        isTyping,
      });
    }
  });

  // ── WebRTC SIGNALING ──

  socket.on("call-user", ({ toPhone, offer, callType }) => {
    const target = users[toPhone];
    if (target) {
      io.to(target.socketId).emit("incoming-call", {
        fromPhone: socket.data.phone,
        fromName: socket.data.username,
        offer,
        callType, // "video" | "audio"
      });
    } else {
      socket.emit("call-failed", "User is not online.");
    }
  });

  socket.on("call-answer", ({ toPhone, answer }) => {
    const target = users[toPhone];
    if (target) io.to(target.socketId).emit("call-answered", { answer });
  });

  socket.on("ice-candidate", ({ toPhone, candidate }) => {
    const target = users[toPhone];
    if (target) io.to(target.socketId).emit("ice-candidate", { candidate });
  });

  socket.on("end-call", ({ toPhone }) => {
    const target = users[toPhone];
    if (target) io.to(target.socketId).emit("call-ended");
  });

  socket.on("reject-call", ({ toPhone }) => {
    const target = users[toPhone];
    if (target) io.to(target.socketId).emit("call-rejected");
  });

  socket.on("disconnect", () => {
    const phone = socketToPhone[socket.id];
    if (phone && users[phone]) {
      users[phone].online = false;
    }
    delete socketToPhone[socket.id];
    console.log("Disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 FriendCall running at http://localhost:${PORT}\n`);
});
