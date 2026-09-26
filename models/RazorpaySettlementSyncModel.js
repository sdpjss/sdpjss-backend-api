import mongoose from "mongoose";

const razorpaySettlementSyncSchema = new mongoose.Schema(
  {
    period: { type: String, required: true, unique: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      required: true,
    },
    trigger: {
      type: String,
      enum: ["webhook", "manual", "scheduled", "backfill"],
      required: true,
    },
    settlementCount: { type: Number, default: 0 },
    transactionCount: { type: Number, default: 0 },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

const razorpaySettlementSyncModel =
  mongoose.models.razorpaySettlementSync ||
  mongoose.model("razorpaySettlementSync", razorpaySettlementSyncSchema);

export default razorpaySettlementSyncModel;
