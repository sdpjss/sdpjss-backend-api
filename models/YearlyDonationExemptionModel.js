import mongoose from "mongoose";

const yearlyDonationExemptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    year: { type: Number, required: true, min: 1900, max: 9999 },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 1000,
    },
    approvedBy: { type: String, required: true },
    approvedByRole: {
      type: String,
      enum: ["admin", "superadmin"],
      required: true,
    },
    approvedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

yearlyDonationExemptionSchema.index({ userId: 1, year: 1 }, { unique: true });
yearlyDonationExemptionSchema.index({ year: 1, approvedAt: -1 });

const yearlyDonationExemptionModel =
  mongoose.models.yearlyDonationExemption ||
  mongoose.model("yearlyDonationExemption", yearlyDonationExemptionSchema);

export default yearlyDonationExemptionModel;
