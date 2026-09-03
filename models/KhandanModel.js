import mongoose from "mongoose";

const khandanSchema = new mongoose.Schema(
  {
    khandanid: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    gotra: {
      type: String,
      required: true,
    },
    contact: {
      type: Object,
      default: {
        mobileno: {
          code: "+91",
          number: "0000000000",
        },
      },
    },
    address: {
      type: Object,
      default: {
        currlocation: "",
        country: "",
        state: "",
        district: "",
        city: "",
        postoffice: "",
        pin: "",
        landmark: "",
        street: "",
        apartment: "",
        floor: "",
        room: "",
      },
    },
  },
  { timestamps: true }
);

const khandanModel =
  mongoose.models.khandan || mongoose.model("khandan", khandanSchema);

export default khandanModel;
