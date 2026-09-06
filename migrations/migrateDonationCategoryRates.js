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
};

export default migrateDonationCategoryRates;
