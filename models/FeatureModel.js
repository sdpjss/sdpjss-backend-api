import mongoose from "mongoose";

// Define the schema for a sidebar feature
const featureSchema = new mongoose.Schema(
  {
    featureName: {
      type: String,
      required: true,
    },
    access: {
      type: String,
      enum: ["admin", "user"],
      required: true,
    },
    link: {
      type: String,
      required: true,
      unique: true, // Each link should be unique
    },
    // The iconName will correspond to a key in your frontend assets object
    iconName: {
      type: String,
      required: true,
      // You can create a predefined list of available icon names
      enum: [
        "home_icon",
        "family_list",
        "advertisement_list",
        "user_list",
        "staff_requirement_list",
        "job_opening_list",
        "notice_board",
        "donation_list",
        "manage_team",
        "user_receipt",
        "guest_receipt",
        "guest_list",
        "team_list",
        "family_tree",
        "printing_portal",
      ],
    },
    isActive: {
      type: Boolean,
      default: true, // New features are active by default
    },
  },
  { timestamps: true }
); // Automatically adds createdAt and updatedAt fields

// Create the model, or use existing one
const featureModel =
  mongoose.models.feature || mongoose.model("feature", featureSchema);

export default featureModel;
