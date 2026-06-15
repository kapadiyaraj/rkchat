require("dotenv").config();
const mongoose = require("mongoose");

console.log("MONGO URI:", process.env.MONGO_URI);

mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 10000,
})
.then(() => {
  console.log("✅ MongoDB Connected");
})
.catch((err) => {
  console.log("❌ MongoDB Error:", err);
});

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const User = require("./models/User");
const Message = require("./models/Message");

app.use(express.static(path.join(__dirname, "public")));

// phone -> { socketId, username, phone, online }
const users = {};
// socketId -> phone
const socketToPhone = {};

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // ── USER REGISTRATION ──
  socket.on("register", async ({ phone, username }) => {
    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({ phone, username });
    }

    users[phone] = {
      socketId: socket.id,
      username,
      phone,
      online: true,
    };

    socketToPhone[socket.id] = phone;
    socket.data.phone = phone;
    socket.data.username = username;

    socket.emit("registered", { success: true });
    
    socket.broadcast.emit("user-online", { phone });

    console.log(`Registered: ${username} (${phone})`);
  });

  // ── SEARCH CONTACT ──
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

  // ── LOAD MESSAGE HISTORY (FROM DATABASE) ──
  socket.on("load-messages", async ({ myPhone, otherPhone }) => {
    try {
      const messages = await Message.find({
        $or: [
          { fromPhone: myPhone, toPhone: otherPhone },
          { fromPhone: otherPhone, toPhone: myPhone }
        ]
      }).sort({ createdAt: 1 });

      socket.emit("message-history", messages);
    } catch (err) {
      console.error("Error loading messages:", err);
    }
  });

  // ── SEND & SAVE MESSAGE (WITH TAATKALIK DEBUGGING LOG) ──
  socket.on("send-message", async ({ toPhone, message }) => {
    console.log("MESSAGE RECEIVED:", message);

    const from = socket.data;
    const target = users[toPhone];

    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    try {
      await Message.create({
        fromPhone: from.phone,
        toPhone,
        message,
        timestamp,
      });

      const payload = {
        fromPhone: from.phone,
        fromName: from.username,
        message,
        timestamp,
      };

      if (target) {
        io.to(target.socketId).emit("receive-message", payload);
      }

      socket.emit("message-sent", {
        toPhone,
        message,
        timestamp,
      });
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  // ── TYPING INDICATOR ──
  socket.on("typing", ({ toPhone, isTyping }) => {
    const target = users[toPhone];
    if (target && target.online) {
      io.to(target.socketId).emit("typing", {
        fromPhone: socket.data.phone,
        isTyping,
      });
    }
  });

  // ── CALLING SIGNALING (WebRTC) ──
  socket.on("call-user", ({ toPhone, offer, callType }) => {
    const target = users[toPhone];
    if (target && target.online) {
      io.to(target.socketId).emit("incoming-call", {
        fromPhone: socket.data.phone,
        fromName: socket.data.username,
        offer,
        callType,
      });
    } else {
      socket.emit("call-failed", "User is not online.");
    }
  });

  socket.on("call-answer", ({ toPhone, answer }) => {
    const target = users[toPhone];
    if (target && target.online) {
      io.to(target.socketId).emit("call-answered", { answer });
    }
  });

  socket.on("ice-candidate", ({ toPhone, candidate }) => {
    const target = users[toPhone];
    if (target && target.online) {
      io.to(target.socketId).emit("ice-candidate", { candidate });
    }
  });

  socket.on("end-call", ({ toPhone }) => {
    const target = users[toPhone];
    if (target && target.online) {
      io.to(target.socketId).emit("call-ended");
    }
  });

  socket.on("reject-call", ({ toPhone }) => {
    const target = users[toPhone];
    if (target && target.online) {
      io.to(target.socketId).emit("call-rejected");
    }
  });

  // ── SAVE CONTACT TO MONGO (WITH TAATKALIK DEBUGGING LOG) ──
  socket.on("save-contact", async (data) => {
    console.log("SAVE CONTACT:", data);

    try {
      await User.updateOne(
        { phone: data.ownerPhone },
        {
          $addToSet: {
            contacts: {
              phone: data.contactPhone,
              username: data.contactName
            }
          }
        }
      );

      console.log("CONTACT SAVED");
      socket.emit("contact-saved");
    } catch (err) {
      console.log(err);
    }
  });

  // ── LOAD CONTACTS FROM MONGO ──
  socket.on("load-contacts", async ({ phone }) => {
    try {
      const user = await User.findOne({ phone });
      socket.emit("contacts-loaded", user?.contacts || []);
    } catch (err) {
      console.log("Load Contacts Error:", err);
    }
  });

  // ── DISCONNECT ──
  socket.on("disconnect", () => {
    const phone = socketToPhone[socket.id];
    if (phone && users[phone]) {
      users[phone].online = false;
      socket.broadcast.emit("user-offline", { phone });
    }
    delete socketToPhone[socket.id];
    console.log("Socket Disconnected:", socket.id);
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 FriendCall running at http://localhost:${PORT}`);
});