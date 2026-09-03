import mongoose from "mongoose";

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
  },
  {
    timestamps: true,
  }
);

const courierChargeModel =
  mongoose.models.courierCharge ||
  mongoose.model("courierCharge", courierChargeSchema);

export default courierChargeModel;
