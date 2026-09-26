import mongoose from "mongoose";

const razorpayWebhookEventSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true, unique: true },
    eventType: { type: String, required: true },
    accountId: { type: String, default: null },
    settlementId: { type: String, default: null },
    status: {
      type: String,
      enum: ["received", "processing", "processed", "ignored", "failed"],
      default: "received",
    },
    receivedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

const razorpayWebhookEventModel =
  mongoose.models.razorpayWebhookEvent ||
  mongoose.model("razorpayWebhookEvent", razorpayWebhookEventSchema);

export default razorpayWebhookEventModel;
