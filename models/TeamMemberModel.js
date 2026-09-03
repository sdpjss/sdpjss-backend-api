import mongoose from "mongoose";

const teamMemberSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    position: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "chairman-vicechairman",
        "president-vicepresident",
        "secretary",
        "treasurer",
        "consultant",
        "digital-technical-support",
      ],
    },
    image: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const teamMemberModel =
  mongoose.models.teamMember || mongoose.model("teamMember", teamMemberSchema);

export default teamMemberModel;
