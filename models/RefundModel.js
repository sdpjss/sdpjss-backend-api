import mongoose from "mongoose";

const refundSchema = new mongoose.Schema(
  {
    originalDonationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "donation",
      required: true,
    },
    originalReceiptId: {
      type: String,
      required: true,
    },
    donorName: {
      type: String,
      required: true,
    },
    refundedAmount: {
      type: Number,
      required: true,
    },
    refundMethod: {
      type: String, // e.g., 'Cash', 'Online Bank Transfer'
      required: true,
    },
    // Reference to the admin who processed the refund
    processedByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "admin", // Assuming you have an 'admin' collection
    },
    // Optional reference to a new donation made against this refund
    newDonationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "donation",
    },
    refundDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

const refundModel =
  mongoose.models.refund || mongoose.model("refund", refundSchema);

export default refundModel;
