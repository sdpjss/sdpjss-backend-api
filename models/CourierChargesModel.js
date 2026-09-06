import mongoose from "mongoose";

const yearlyAmountSchema = new mongoose.Schema(
  {
    year: {
      type: Number,
      required: true,
      min: 1900,
      max: 9999,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const courierChargeSchema = new mongoose.Schema(
  {
    region: {
      type: String,
      required: true,
      enum: [
        "in_gaya_outside_manpur",
        "in_bihar_outside_gaya",
        "in_india_outside_bihar",
        "outside_india",
      ],
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Retain `amount` for compatibility and keep the annual history here.
    yearlyAmounts: {
      type: [yearlyAmountSchema],
      default: [],
      validate: {
        validator: (amounts) =>
          new Set(amounts.map(({ year }) => year)).size === amounts.length,
        message: "Only one courier charge can be configured for a year",
      },
    },
    yearlyAmountsInitialized: {
      type: Boolean,
      default: false,
    },
    disabledAmountYears: {
      type: [Number],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const courierChargeModel =
  mongoose.models.courierCharge ||
  mongoose.model("courierCharge", courierChargeSchema);

export default courierChargeModel;
