import mongoose from "mongoose";

const childUserSchema = new mongoose.Schema(
  {
    fullname: {
      type: String,
      required: true,
    },
    id: {
      type: String,
      required: true,
    },
    fatherid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    mother: {
      type: String,
      default: "",
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      required: true,
    },
    dob: {
      type: Date,
      required: true,
    },
    isComplete: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const childUserModel =
  mongoose.models.childUser || mongoose.model("childUser", childUserSchema);

export default childUserModel;
