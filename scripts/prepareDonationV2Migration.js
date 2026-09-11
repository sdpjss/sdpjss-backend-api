import "dotenv/config";
import mongoose from "mongoose";
import donationCategoryModel from "../models/DonationCategoryModel.js";
import donationModel from "../models/DonationModel.js";
import guestDonationModel from "../models/GuestDonationModel.js";
import updateOnlineDonationsWithPrasad from "../controllers/helpers/prasadCalculator.js";

const apply = process.argv.includes("--apply");

const suggestedCategoryConfiguration = (category) => ({
  categoryId: category._id,
  categoryName: category.categoryName,
  suggestedAmountType: category.dynamic?.isDynamic ? "minimum" : "fixed",
  suggestedMinimumAmountPerUnit: false,
  suggestedPrasadType:
    category.categoryCode === "maa_durga_pratima"
      ? "none"
      : category.packet
        ? "packet"
        : category.weight > 0
          ? "grams"
          : "none",
  suggestedAllowGramAlternativeForInPerson:
    category.categoryName.toLowerCase().includes("professional"),
  requiresAdminReview:
    Boolean(category.dynamic?.isDynamic) ||
    category.categoryName.toLowerCase().includes("service"),
});

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  await mongoose.connect(`${process.env.MONGODB_URI}/sdpjss`);

  const categories = await donationCategoryModel.find({}).lean();
  const categoryReport = categories.map(suggestedCategoryConfiguration);
  const legacyDonations = await donationModel
    .find({
      paymentStatus: "completed",
      $or: [
        { calculationVersion: { $exists: false } },
        { calculationVersion: "legacy-v1", prasadEntitlement: { $exists: false } },
      ],
    })
    .lean();

  const snapshots = legacyDonations.map((donation) => {
    const visibleDonation = structuredClone(donation);
    updateOnlineDonationsWithPrasad([visibleDonation]);
    return {
      _id: donation._id,
      calculationVersion: "legacy-v1",
      list: visibleDonation.list,
      prasadEntitlement: {
        eligibleAmount: 0,
        grams: visibleDonation.totalWeightInGrams || 0,
        packets: visibleDonation.prasadPacketCount || 0,
        roundingUnitGrams: 1,
      },
    };
  });
  const legacyGuestDonations = await guestDonationModel
    .find({
      paymentStatus: "completed",
      $or: [
        { calculationVersion: { $exists: false } },
        { calculationVersion: "legacy-v1", prasadEntitlement: { $exists: false } },
      ],
    })
    .lean();
  const guestSnapshots = legacyGuestDonations.map((donation) => {
    const visibleDonation = structuredClone(donation);
    updateOnlineDonationsWithPrasad([visibleDonation]);
    return {
      _id: donation._id,
      calculationVersion: "legacy-v1",
      list: visibleDonation.list,
      prasadEntitlement: {
        eligibleAmount: 0,
        grams: visibleDonation.totalWeightInGrams || 0,
        packets: visibleDonation.prasadPacketCount || 0,
        roundingUnitGrams: 1,
      },
    };
  });

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        categories: categoryReport,
        historicalDonationsToSnapshot: snapshots.length,
        historicalGuestDonationsToSnapshot: guestSnapshots.length,
      },
      null,
      2
    )
  );

  if (apply && snapshots.length > 0) {
    await donationModel.bulkWrite(
      snapshots.map(({ _id, ...snapshot }) => ({
        updateOne: { filter: { _id }, update: { $set: snapshot } },
      }))
    );
    console.log(`Snapshotted ${snapshots.length} historical donations.`);
  }
  if (apply && guestSnapshots.length > 0) {
    await guestDonationModel.bulkWrite(
      guestSnapshots.map(({ _id, ...snapshot }) => ({
        updateOne: { filter: { _id }, update: { $set: snapshot } },
      }))
    );
    console.log(
      `Snapshotted ${guestSnapshots.length} historical guest donations.`
    );
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
