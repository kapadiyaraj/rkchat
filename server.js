require("dotenv").config();

const mongoose = require("mongoose");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("./models/User");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);

const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ======================================================
// DATABASE
// ======================================================

mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  })
  .then(() => {
    console.log("✅ MongoDB Connected");
  })
  .catch((err) => {
    console.error("❌ MongoDB Error:", err.message);
  });

// ======================================================
// JWT
// ======================================================

function createToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      phone: user.phone,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );
}

// ======================================================
// REGISTER
// Name = profile name
// Phone + password = authentication
// ======================================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();

    const phone = String(req.body.phone || "")
      .replace(/\D/g, "");

    const password = String(req.body.password || "");

    if (!username || !phone || !password) {
      return res.status(400).json({
        message:
          "Name, mobile number and password are required.",
      });
    }

    if (phone.length !== 10) {
      return res.status(400).json({
        message: "Enter a valid 10-digit mobile number.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message:
          "Password must be at least 6 characters.",
      });
    }

    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return res.status(409).json({
        message:
          "This mobile number is already registered. Please login.",
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      12
    );

    const user = await User.create({
      username,
      phone,
      password: hashedPassword,
    });

    const token = createToken(user);

    return res.status(201).json({
      token,

      user: {
        username: user.username,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);

    return res.status(500).json({
      message: "Registration failed.",
    });
  }
});

// ======================================================
// LOGIN
// ======================================================

app.post("/api/auth/login", async (req, res) => {
  try {
    const phone = String(req.body.phone || "")
      .replace(/\D/g, "");

    const password = String(req.body.password || "");

    if (!phone || !password) {
      return res.status(400).json({
        message:
          "Mobile number and password are required.",
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(401).json({
        message:
          "Invalid mobile number or password.",
      });
    }

    // Old database user may not have password
    if (!user.password) {
      return res.status(401).json({
        message:
          "This old account has no password. Please create a new account.",
      });
    }

    const passwordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordCorrect) {
      return res.status(401).json({
        message:
          "Invalid mobile number or password.",
      });
    }

    const token = createToken(user);

    return res.json({
      token,

      user: {
        username: user.username,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);

    return res.status(500).json({
      message: "Login failed.",
    });
  }
});

// ======================================================
// VERIFY SAVED JWT
// ======================================================

app.get("/api/auth/me", async (req, res) => {
  try {
    const authorization =
      req.headers.authorization;

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    const token =
      authorization.substring(7);

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        message: "User not found.",
      });
    }

    return res.json({
      user: {
        username: user.username,
        phone: user.phone,
      },
    });
  } catch (err) {
    return res.status(401).json({
      message:
        "Session expired or token is invalid.",
    });
  }
});

// ======================================================
// ONLINE USERS
// phone -> { socketId, username, phone, online }
// ======================================================

const users = {};

// socketId -> phone
const socketToPhone = {};

// ======================================================
// SOCKET JWT AUTHENTICATION
// ======================================================

io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token;

    if (!token) {
      return next(
        new Error("Authentication required")
      );
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    socket.user = decoded;

    next();
  } catch (err) {
    next(
      new Error("Invalid authentication")
    );
  }
});

// ======================================================
// SOCKET CONNECTION
// ======================================================

io.on("connection", async (socket) => {
  let currentUser;

  try {
    currentUser = await User.findById(
      socket.user.id
    );

    if (!currentUser) {
      socket.disconnect(true);
      return;
    }
  } catch (err) {
    console.error("Socket user error:", err);
    socket.disconnect(true);
    return;
  }

  const phone = currentUser.phone;
  const username = currentUser.username;

  users[phone] = {
    socketId: socket.id,
    username,
    phone,
    online: true,
  };

  socketToPhone[socket.id] = phone;

  socket.data.phone = phone;
  socket.data.username = username;

  console.log(
    `🟢 Online: ${username} (${phone})`
  );

  // Tell everyone else
  socket.broadcast.emit("user-online", {
    phone,
  });

  // ====================================================
  // LOAD CONTACTS
  // ====================================================

  socket.on("load-contacts", async () => {
    try {
      const user = await User.findOne({
        phone: socket.data.phone,
      });

      const result = [];

      for (const contact of user?.contacts || []) {
        const dbUser = await User.findOne({
          phone: contact.phone,
        }).select(
          "username phone lastSeen"
        );

        if (!dbUser) continue;

        result.push({
          phone: dbUser.phone,
          username: dbUser.username,

          online: Boolean(
            users[dbUser.phone]
          ),

          lastSeen:
            dbUser.lastSeen || null,
        });
      }

      socket.emit(
        "contacts-loaded",
        result
      );
    } catch (err) {
      console.error(
        "LOAD CONTACTS ERROR:",
        err
      );
    }
  });


  // ─────────────────────────────────────────────
// CLEAR CHAT
// Deletes conversation for BOTH users
// ─────────────────────────────────────────────

socket.on("clear-chat", async ({ otherPhone }) => {
  try {
    const myPhone = socket.data.phone;

    // User must be logged in / registered on socket
    if (!myPhone) {
      socket.emit("clear-chat-error", "You are not authenticated.");
      return;
    }

    if (!otherPhone) {
      socket.emit("clear-chat-error", "Invalid contact.");
      return;
    }

    if (myPhone === otherPhone) {
      socket.emit("clear-chat-error", "Invalid conversation.");
      return;
    }

    // Delete BOTH directions:
    // Me -> Friend
    // Friend -> Me

    const result = await Message.deleteMany({
      $or: [
        {
          fromPhone: myPhone,
          toPhone: otherPhone,
        },
        {
          fromPhone: otherPhone,
          toPhone: myPhone,
        },
      ],
    });

    console.log(
      `Chat cleared: ${myPhone} <-> ${otherPhone}. Deleted: ${result.deletedCount}`
    );

    // Tell current user
    socket.emit("chat-cleared", {
      otherPhone,
    });

    // Tell other user if online
    const target = users[otherPhone];

    if (target && target.online) {
      io.to(target.socketId).emit("chat-cleared", {
        otherPhone: myPhone,
      });
    }

  } catch (err) {

    console.error("Clear Chat Error:", err);

    socket.emit(
      "clear-chat-error",
      "Unable to clear chat. Please try again."
    );
  }
});

  // ====================================================
  // FIND CONTACT
  // Search registered users even if offline
  // ====================================================

  socket.on(
    "find-contact",
    async ({ phone }) => {
      try {
        const searchPhone = String(
          phone || ""
        ).replace(/\D/g, "");

        if (
          searchPhone === socket.data.phone
        ) {
          return socket.emit(
            "contact-error",
            "That's your own number!"
          );
        }

        const foundUser =
          await User.findOne({
            phone: searchPhone,
          }).select(
            "username phone lastSeen"
          );

        if (!foundUser) {
          return socket.emit(
            "contact-error",
            "No user found with that number."
          );
        }

        socket.emit("contact-found", {
          phone: foundUser.phone,
          username: foundUser.username,

          online: Boolean(
            users[foundUser.phone]
          ),

          lastSeen:
            foundUser.lastSeen || null,
        });
      } catch (err) {
        console.error(
          "FIND CONTACT ERROR:",
          err
        );

        socket.emit(
          "contact-error",
          "Unable to search user."
        );
      }
    }
  );

  // ====================================================
  // SAVE CONTACT
  // ownerPhone comes from JWT, NOT frontend
  // ====================================================

  socket.on(
    "save-contact",
    async ({
      contactPhone,
      contactName,
    }) => {
      try {
        const ownerPhone =
          socket.data.phone;

        const targetUser =
          await User.findOne({
            phone: contactPhone,
          });

        if (!targetUser) {
          return socket.emit(
            "contact-error",
            "User does not exist."
          );
        }

        if (
          contactPhone === ownerPhone
        ) {
          return socket.emit(
            "contact-error",
            "You cannot add yourself."
          );
        }

        const owner =
          await User.findOne({
            phone: ownerPhone,
          });

        const alreadyExists =
          owner.contacts.some(
            (contact) =>
              contact.phone ===
              contactPhone
          );

        if (!alreadyExists) {
          owner.contacts.push({
            phone: contactPhone,

            username:
              targetUser.username ||
              contactName,
          });

          await owner.save();
        }

        socket.emit("contact-saved");
      } catch (err) {
        console.error(
          "SAVE CONTACT ERROR:",
          err
        );
      }
    }
  );

  // ====================================================
  // LOAD MESSAGES
  // myPhone always comes from authenticated socket
  // ====================================================

  socket.on(
    "load-messages",
    async ({ otherPhone }) => {
      try {
        const myPhone =
          socket.data.phone;

        const messages =
          await Message.find({
            $or: [
              {
                fromPhone: myPhone,
                toPhone: otherPhone,
              },

              {
                fromPhone: otherPhone,
                toPhone: myPhone,
              },
            ],
          }).sort({
            createdAt: 1,
          });

        socket.emit(
          "message-history",
          messages
        );
      } catch (err) {
        console.error(
          "LOAD MESSAGES ERROR:",
          err
        );
      }
    }
  );

 // ====================================================
// SEND MESSAGE
// ====================================================

socket.on(
  "send-message",
  async ({ toPhone, message }) => {
    try {
      const fromPhone = socket.data.phone;
      const fromName = socket.data.username;

      const cleanMessage =
        String(message || "").trim();

      if (!cleanMessage) return;

      const receiver =
        await User.findOne({ phone: toPhone });

      if (!receiver) {
        return socket.emit(
          "message-error",
          "Receiver does not exist."
        );
      }

      const timestamp =
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

      // IMPORTANT: save returned document
      const savedMessage =
        await Message.create({
          fromPhone,
          toPhone,
          message: cleanMessage,
          timestamp,
        });

      const payload = {
        messageId:
          savedMessage._id.toString(),

        fromPhone,
        fromName,
        toPhone,

        message:
          savedMessage.message,

        timestamp:
          savedMessage.timestamp,

        edited: false,
      };

      const target = users[toPhone];

      if (target) {
        io.to(target.socketId).emit(
          "receive-message",
          payload
        );
      }

      socket.emit(
        "message-sent",
        payload
      );

    } catch (err) {
      console.error(
        "SEND MESSAGE ERROR:",
        err
      );
    }
  }
);


// ====================================================
// EDIT MESSAGE
// Sender only
// ====================================================

socket.on(
  "edit-message",
  async ({ messageId, newMessage }) => {
    try {
      const myPhone =
        socket.data.phone;

      const cleanMessage =
        String(newMessage || "").trim();

      if (!messageId || !cleanMessage) {
        return socket.emit(
          "message-action-error",
          "Invalid message."
        );
      }

      const message =
        await Message.findById(messageId);

      if (!message) {
        return socket.emit(
          "message-action-error",
          "Message not found."
        );
      }

      // SECURITY:
      // only sender can edit
      if (message.fromPhone !== myPhone) {
        return socket.emit(
          "message-action-error",
          "You can only edit your own messages."
        );
      }

      message.message = cleanMessage;

      // Works even if edited wasn't in old documents
      message.edited = true;

      await message.save();

      const payload = {
        messageId:
          message._id.toString(),

        fromPhone:
          message.fromPhone,

        toPhone:
          message.toPhone,

        message:
          message.message,

        timestamp:
          message.timestamp,

        edited: true,
      };

      // Update sender
      socket.emit(
        "message-edited",
        payload
      );

      // Update receiver
      const target =
        users[message.toPhone];

      if (target) {
        io.to(target.socketId).emit(
          "message-edited",
          payload
        );
      }

    } catch (err) {
      console.error(
        "EDIT MESSAGE ERROR:",
        err
      );

      socket.emit(
        "message-action-error",
        "Unable to edit message."
      );
    }
  }
);


// ====================================================
// DELETE MESSAGE
// Delete for everyone - sender only
// ====================================================

socket.on(
  "delete-message",
  async ({ messageId }) => {
    try {
      const myPhone =
        socket.data.phone;

      if (!messageId) {
        return;
      }

      const message =
        await Message.findById(messageId);

      if (!message) {
        return socket.emit(
          "message-action-error",
          "Message not found."
        );
      }

      // SECURITY:
      // only sender can delete
      if (message.fromPhone !== myPhone) {
        return socket.emit(
          "message-action-error",
          "You can only delete your own messages."
        );
      }

      const otherPhone =
        message.toPhone;

      await Message.deleteOne({
        _id: message._id,
      });

      const payload = {
        messageId:
          message._id.toString(),

        fromPhone:
          message.fromPhone,

        toPhone:
          message.toPhone,
      };

      // Sender
      socket.emit(
        "message-deleted",
        payload
      );

      // Receiver
      const target =
        users[otherPhone];

      if (target) {
        io.to(target.socketId).emit(
          "message-deleted",
          payload
        );
      }

    } catch (err) {
      console.error(
        "DELETE MESSAGE ERROR:",
        err
      );

      socket.emit(
        "message-action-error",
        "Unable to delete message."
      );
    }
  }
);

  // ====================================================
  // TYPING
  // ====================================================

  socket.on(
    "typing",
    ({ toPhone, isTyping }) => {
      const target =
        users[toPhone];

      if (!target) return;

      io.to(
        target.socketId
      ).emit("typing", {
        fromPhone:
          socket.data.phone,

        isTyping:
          Boolean(isTyping),
      });
    }
  );

  // ====================================================
  // CALL USER
  // ====================================================

  socket.on(
    "call-user",
    ({
      toPhone,
      offer,
      callType,
    }) => {
      const target =
        users[toPhone];

      if (
        target &&
        target.online
      ) {
        io.to(
          target.socketId
        ).emit(
          "incoming-call",
          {
            fromPhone:
              socket.data.phone,

            fromName:
              socket.data.username,

            offer,
            callType,
          }
        );
      } else {
        socket.emit(
          "call-failed",
          "User is not online."
        );
      }
    }
  );

  // ====================================================
  // CALL ANSWER
  // ====================================================

  socket.on(
    "call-answer",
    ({ toPhone, answer }) => {
      const target =
        users[toPhone];

      if (target) {
        io.to(
          target.socketId
        ).emit(
          "call-answered",
          {
            answer,
          }
        );
      }
    }
  );

  // ====================================================
  // ICE
  // ====================================================

  socket.on(
    "ice-candidate",
    ({
      toPhone,
      candidate,
    }) => {
      const target =
        users[toPhone];

      if (target) {
        io.to(
          target.socketId
        ).emit(
          "ice-candidate",
          {
            candidate,
          }
        );
      }
    }
  );

  // ====================================================
  // END CALL
  // ====================================================

  socket.on(
    "end-call",
    ({ toPhone }) => {
      const target =
        users[toPhone];

      if (target) {
        io.to(
          target.socketId
        ).emit(
          "call-ended"
        );
      }
    }
  );

  // ====================================================
  // REJECT CALL
  // ====================================================

  socket.on(
    "reject-call",
    ({ toPhone }) => {
      const target =
        users[toPhone];

      if (target) {
        io.to(
          target.socketId
        ).emit(
          "call-rejected"
        );
      }
    }
  );

  // ====================================================
  // DISCONNECT / LAST SEEN
  // ====================================================

  socket.on(
    "disconnect",
    async () => {
      const disconnectedPhone =
        socketToPhone[socket.id];

      if (!disconnectedPhone) {
        return;
      }

      // Only mark offline if this
      // socket is still current.
      if (
        users[disconnectedPhone]
          ?.socketId === socket.id
      ) {
        delete users[
          disconnectedPhone
        ];

        const lastSeen =
          new Date();

        try {
          await User.updateOne(
            {
              phone:
                disconnectedPhone,
            },

            {
              $set: {
                lastSeen,
              },
            }
          );
        } catch (err) {
          console.error(
            "LAST SEEN ERROR:",
            err
          );
        }

        socket.broadcast.emit(
          "user-offline",
          {
            phone:
              disconnectedPhone,

            lastSeen,
          }
        );
      }

      delete socketToPhone[
        socket.id
      ];

      console.log(
        `🔴 Offline: ${disconnectedPhone}`
      );
    }
  );
});

// ======================================================
// SERVER
// ======================================================

const PORT =
  process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(
    `🚀 FriendCall running at http://localhost:${PORT}`
  );
});