import mongoose from "mongoose";

const yearlyRateSchema = new mongoose.Schema(
  {
    year: {
      type: Number,
      required: true,
      min: 1900,
      max: 9999,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const donationCategorySchema = new mongoose.Schema(
  {
    categoryName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    categoryCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    // `rate` is retained as a compatibility value for older records and
    // consumers. New changes are recorded here, one entry per calendar year.
    yearlyRates: {
      type: [yearlyRateSchema],
      default: [],
      validate: {
        validator: (rates) =>
          new Set(rates.map(({ year }) => year)).size === rates.length,
        message: "Only one base rate can be configured for a year",
      },
    },
    yearlyRatesInitialized: {
      type: Boolean,
      default: false,
    },
    disabledRateYears: {
      type: [Number],
      default: [],
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
    amountType: {
      type: String,
      enum: ["fixed", "minimum"],
      default: "fixed",
    },
    availableFor: {
      type: [String],
      enum: ["self", "child"],
      default: undefined,
    },
    isSpecial: {
      type: Boolean,
      default: false,
    },
    showInRegularDonation: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const donationCategoryModel =
  mongoose.models.donationCategory ||
  mongoose.model("donationCategory", donationCategorySchema);

export default donationCategoryModel;
