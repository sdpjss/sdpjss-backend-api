import mongoose from "mongoose";

const guestDonationSchema = new mongoose.Schema(
  {
    guestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "guestUser", // Important: references the guestUser model
      required: true,
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
      enum: ["Cash", "QR Code"],
      required: true,
    },
    courierCharge: { type: Number, default: 0 },
    transactionId: { type: String }, // For digital payments like QR
    receiptId: { type: String, unique: true, sparse: true },
    remarks: { type: String },
    refunded: {
      type: Boolean,
      default: false,
    },
    paymentStatus: {
      type: String,
      enum: ["completed", "failed"], // Guest donations are recorded after completion
      default: "completed",
    },
  },
  { timestamps: true }
);

const guestDonationModel =
  mongoose.models.guestDonation ||
  mongoose.model("guestDonation", guestDonationSchema);

export default guestDonationModel;
