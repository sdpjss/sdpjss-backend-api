import mongoose from "mongoose";

const razorpaySettlementSchema = new mongoose.Schema(
  {
    razorpaySettlementId: { type: String, required: true, unique: true },
    amountPaise: { type: Number, default: null },
    status: {
      type: String,
      enum: ["created", "processed", "failed", "unknown"],
      default: "unknown",
    },
    feesPaise: { type: Number, default: 0 },
    taxPaise: { type: Number, default: 0 },
    utr: { type: String, default: null },
    createdAtRazorpay: { type: Date, default: null },
    scheduledAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, required: true, default: Date.now },
    lastSource: {
      type: String,
      enum: ["webhook", "manual", "scheduled", "backfill"],
      default: "scheduled",
    },
  },
  { timestamps: true }
);

razorpaySettlementSchema.index({ status: 1, createdAtRazorpay: -1 });
razorpaySettlementSchema.index({ scheduledAt: -1 });

const razorpaySettlementModel =
  mongoose.models.razorpaySettlement ||
  mongoose.model("razorpaySettlement", razorpaySettlementSchema);

export default razorpaySettlementModel;
