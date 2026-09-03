import mongoose from "mongoose";

const advertisementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    category: {
      type: String, // e.g., "Event", "Service", "Product", "Offer"
    },
    description: {
      type: String,
      required: true,
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    location: {
      type: String,
    },
    contact: {
      type: Object,
      default: {
        email: "",
        code: "+91",
        number: "",
      },
    },
    postedDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const advertisementModel =
  mongoose.models.advertisement ||
  mongoose.model("advertisement", advertisementSchema);

export default advertisementModel;
