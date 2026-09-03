import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin", "superadmin"], default: "admin" },
    // Assuming your feature model is named 'feature'
    allowedFeatures: [{ type: mongoose.Schema.Types.ObjectId, ref: "feature" }],
    isApproved: {
      type: Boolean,
      default: true,
    },
    refreshToken: {
      type: String,
    },
  },
  { timestamps: true }
);

const adminModel =
  mongoose.models.admin || mongoose.model("admin", adminSchema);

export default adminModel;
