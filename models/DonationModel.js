import mongoose from "mongoose";

const donationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    donatedFor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "childUser",
    },
    donatedAs: {
      type: String,
      required: true,
      default: "self",
    },
    relationName: {
      type: String,
      default: "",
    },
    refunded: {
      type: Boolean,
      default: false,
    },
    list: [
      {
        category: String,
        number: Number,
        amount: Number,
        isPacket: Boolean,
        quantity: Number,
      },
    ],
    amount: { type: Number, required: true },
    method: {
      type: String,
      enum: ["Cash", "Online", "QR Code"],
      required: true,
    },
    courierCharge: { type: Number, required: true },
    razorpayOrderId: { type: String },
    transactionId: { type: String }, // if digital payment
    receiptId: { type: String, unique: true, sparse: true }, // Added unique and sparse for indexing
    date: { type: Date, default: Date.now },
    remarks: { type: String },
    postalAddress: { type: String, required: true },
    paymentStatus: {
      // Keep only one paymentStatus
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

const donationModel =
  mongoose.models.donation || mongoose.model("donation", donationSchema);

export default donationModel;
