import mongoose from "mongoose";

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    time: {
      type: Date,
      default: Date.now, // Automatically sets current timestamp
    },
    icon: {
      type: String, // e.g., "Bell", "Zap", "Calendar"
      required: true,
    },
    color: {
      type: String, // Tailwind class like "text-cyan-500"
      required: true,
    },
    type: {
      type: String,
      enum: ["alert", "announcement", "event", "achievement", "info"],
      required: true,
    },
    author: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt fields
  }
);

const noticeModel = mongoose.model("notice", noticeSchema);

export default noticeModel;
