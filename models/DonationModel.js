import mongoose from "mongoose";

const deliveryAddressSchema = new mongoose.Schema(
  {
    currlocation: { type: String, trim: true },
    country: { type: String, trim: true },
    state: { type: String, trim: true },
    district: { type: String, trim: true },
    city: { type: String, trim: true },
    postoffice: { type: String, trim: true },
    pin: { type: String, trim: true },
    landmark: { type: String, trim: true },
    street: { type: String, trim: true },
    apartment: { type: String, trim: true },
    floor: { type: String, trim: true },
    room: { type: String, trim: true },
  },
  { _id: false }
);

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
    donationType: {
      type: String,
      enum: ["regular", "maa_durga_pratima"],
      default: "regular",
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
    // Structured copy used for filtering/reporting. `postalAddress` remains
    // available for existing receipts and historical integrations.
    deliveryAddress: {
      type: deliveryAddressSchema,
      default: undefined,
    },
    mahaprasadFulfillment: {
      mode: {
        type: String,
        enum: ["none", "collection", "courier"],
        default: undefined,
      },
      type: {
        type: String,
        enum: ["none", "halwa", "packet"],
        default: undefined,
      },
    },
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
