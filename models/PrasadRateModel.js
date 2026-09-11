import mongoose from "mongoose";

const prasadRateSchema = new mongoose.Schema(
  {
    year: {
      type: Number,
      required: true,
      unique: true,
      min: 1900,
      max: 9999,
    },
    rupeesPer100Grams: {
      type: Number,
      min: 0,
    },
    // Retained so a rate saved during the initial v2 rollout remains readable.
    gramsPerRupee: { type: Number, min: 0 },
    minimumPrasadGrams: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    minimumCourierDonationAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 1210,
    },
    roundingUnitGrams: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
  },
  { timestamps: true }
);

const prasadRateModel =
  mongoose.models.prasadRate || mongoose.model("prasadRate", prasadRateSchema);

export default prasadRateModel;
