import mongoose from "mongoose";

const donationCategorySchema = new mongoose.Schema(
  {
    categoryName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    weight: {
      type: Number,
      required: true,
      min: 0,
    },
    packet: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      trim: true,
    },
    dynamic: {
      type: Object,
      default: {
        isDynamic: false,
        minvalue: 0,
      },
    },
  },
  { timestamps: true }
);

const donationCategoryModel =
  mongoose.models.donationCategory ||
  mongoose.model("donationCategory", donationCategorySchema);

export default donationCategoryModel;
