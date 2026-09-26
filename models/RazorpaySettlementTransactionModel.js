import mongoose from "mongoose";

const razorpaySettlementTransactionSchema = new mongoose.Schema(
  {
    reconciliationKey: { type: String, required: true, unique: true },
    razorpaySettlementId: { type: String, required: true, index: true },
    entityId: { type: String, default: null },
    paymentId: { type: String, default: null, index: true },
    orderId: { type: String, default: null },
    type: { type: String, required: true },
    method: { type: String, default: null },
    currency: { type: String, default: "INR" },
    grossAmountPaise: { type: Number, default: 0 },
    creditPaise: { type: Number, default: 0 },
    debitPaise: { type: Number, default: 0 },
    feePaise: { type: Number, default: 0 },
    taxPaise: { type: Number, default: 0 },
    settled: { type: Boolean, default: false },
    onHold: { type: Boolean, default: false },
    createdAtRazorpay: { type: Date, default: null },
    settledAt: { type: Date, default: null },
    settlementUtr: { type: String, default: null },
    donationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "donation",
      default: null,
    },
    receiptId: { type: String, default: null },
    donorName: { type: String, default: null },
    donationAmount: { type: Number, default: null },
    localPaymentStatus: { type: String, default: null },
    matched: { type: Boolean, default: false },
    lastSyncedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

razorpaySettlementTransactionSchema.index({ settledAt: -1 });
razorpaySettlementTransactionSchema.index({ donationId: 1 });

const razorpaySettlementTransactionModel =
  mongoose.models.razorpaySettlementTransaction ||
  mongoose.model(
    "razorpaySettlementTransaction",
    razorpaySettlementTransactionSchema
  );

export default razorpaySettlementTransactionModel;
