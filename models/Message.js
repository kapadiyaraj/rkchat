const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  fromPhone: {
    type: String,
    required: true,
  },
  toPhone: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  timestamp: {
    type: String,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model("Message", messageSchema);