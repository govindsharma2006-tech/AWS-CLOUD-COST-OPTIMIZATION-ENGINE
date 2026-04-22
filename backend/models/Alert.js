const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type:      { type: String, enum: ["alert", "budget"], default: "alert" },
  name:      { type: String, required: true },
  service:   { type: String, default: "Total AWS Spend" },
  threshold: { type: Number, required: true },
  lastEmailSent: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Alert", alertSchema);
