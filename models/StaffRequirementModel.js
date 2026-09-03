import mongoose from "mongoose";

const staffRequirementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    }, // person who posted
    title: { type: String, required: true }, // e.g., "Driver", "Caretaker"
    category: { type: String },
    description: { type: String },
    location: { type: String },
    salary: { type: Number },
    staffType: {
      type: String,
      enum: ["Full-time", "Part-time", "Freelance"],
      default: "Full-time",
    },
    availabilityDate: { type: Date },
    requirements: { type: [String] },
    isOpen: { type: Boolean, default: true },
    contact: {
      type: Object,
      default: {
        email: "",
        code: "+91",
        number: "",
      },
    },
    postedDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const staffRequirementModel =
  mongoose.models.staffRequirement ||
  mongoose.model("staffRequirement", staffRequirementSchema);

export default staffRequirementModel;
