// models/Message.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  fromPhone: String,
  toPhone: String,
  message: String,
  timestamp: String, // e.g. "06:21 PM"
  date: String,      // e.g. "2026-07-29"
  edited: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);