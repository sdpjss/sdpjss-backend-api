import donationCategoryModel from "../models/DonationCategoryModel.js";
import { LEGACY_DONATION_RATE_YEAR } from "../config/donationRates.js";

const migrateDonationCategoryRates = async () => {
  const result = await donationCategoryModel.updateMany(
    {
      rate: { $type: "number" },
      yearlyRatesInitialized: { $ne: true },
    },
    [
      {
        $set: {
          yearlyRates: {
            $cond: [
              {
                $gt: [{ $size: { $ifNull: ["$yearlyRates", []] } }, 0],
              },
              "$yearlyRates",
              [
                {
                  year: LEGACY_DONATION_RATE_YEAR,
                  rate: "$rate",
                },
              ],
            ],
          },
          yearlyRatesInitialized: true,
        },
      },
    ]
  );

  if (result.modifiedCount > 0) {
    console.log(
      `Assigned ${result.modifiedCount} legacy donation category rate(s) to ${LEGACY_DONATION_RATE_YEAR}`
    );
  }

  const professionalResult = await donationCategoryModel.updateMany(
    { categoryName: { $regex: "professional", $options: "i" } },
    [
      {
        $set: {
          amountType: "minimum",
          dynamic: {
            $mergeObjects: [
              { $ifNull: ["$dynamic", {}] },
              { isDynamic: true, minvalue: "$rate" },
            ],
          },
        },
      },
    ]
  );

  if (professionalResult.modifiedCount > 0) {
    console.log(
      `Updated ${professionalResult.modifiedCount} Professional donation category amount rule(s) to minimum`
    );
  }

  const childEligibleResult = await donationCategoryModel.updateMany(
    {
      applicableToChildDonation: { $exists: false },
      $or: [
        { categoryName: { $regex: "^voluntary donations?$", $options: "i" } },
        { availableFor: "child" },
      ],
    },
    { $set: { applicableToChildDonation: true } }
  );

  await donationCategoryModel.updateMany(
    { applicableToChildDonation: { $exists: false } },
    { $set: { applicableToChildDonation: false } }
  );

  if (childEligibleResult.modifiedCount > 0) {
    console.log(
      `Enabled ${childEligibleResult.modifiedCount} existing donation category(s) for child donations`
    );
  }
};

export default migrateDonationCategoryRates;
