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
    postalAddress: { type: String, default: "" },
    deliveryAddress: {
      type: deliveryAddressSchema,
      default: undefined,
    },
    refunded: {
      type: Boolean,
      default: false,
    },
    calculationVersion: {
      type: String,
      enum: ["legacy-v1", "category-v2"],
      default: "legacy-v1",
    },
    prasadEntitlement: {
      eligibleAmount: { type: Number, min: 0 },
      grams: { type: Number, min: 0 },
      packets: { type: Number, min: 0 },
      rateYear: { type: Number },
      rupeesPer100Grams: { type: Number, min: 0 },
      gramsPerRupee: { type: Number, min: 0 },
      minimumPrasadGrams: { type: Number, min: 0 },
      minimumCourierDonationAmount: { type: Number, min: 0 },
      roundingUnitGrams: { type: Number, min: 1 },
    },
    categorySnapshots: [
      {
        categoryId: { type: mongoose.Schema.Types.ObjectId },
        categoryName: String,
        amountType: { type: String, enum: ["fixed", "minimum"] },
        minimumAmountPerUnit: Boolean,
        configuredAmount: Number,
        contributedAmount: Number,
        units: Number,
        prasadType: { type: String, enum: ["grams", "packet", "none"] },
        packetsPerUnit: Number,
        allowGramAlternativeForInPerson: Boolean,
      },
    ],
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
