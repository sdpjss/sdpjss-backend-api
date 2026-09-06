import mongoose from "mongoose";
import migrateDonationCategoryRates from "../migrations/migrateDonationCategoryRates.js";
import migrateCourierChargeAmounts from "../migrations/migrateCourierChargeAmounts.js";
import ensureMaaDurgaPratimaCategory from "../migrations/ensureMaaDurgaPratimaCategory.js";

const connectDB = async () => {
  mongoose.connection.on("connected", () => console.log("Database Connected"));

  await mongoose.connect(`${process.env.MONGODB_URI}/sdpjss`);
  await migrateDonationCategoryRates();
  await migrateCourierChargeAmounts();
  await ensureMaaDurgaPratimaCategory();
};

export default connectDB;
