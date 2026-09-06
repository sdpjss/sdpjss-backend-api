import courierChargeModel from "../models/CourierChargesModel.js";
import { LEGACY_COURIER_CHARGE_YEAR } from "../config/donationRates.js";

const migrateCourierChargeAmounts = async () => {
  const result = await courierChargeModel.updateMany(
    {
      amount: { $type: "number" },
      yearlyAmountsInitialized: { $ne: true },
    },
    [
      {
        $set: {
          yearlyAmounts: {
            $cond: [
              {
                $gt: [{ $size: { $ifNull: ["$yearlyAmounts", []] } }, 0],
              },
              "$yearlyAmounts",
              [
                {
                  year: LEGACY_COURIER_CHARGE_YEAR,
                  amount: "$amount",
                },
              ],
            ],
          },
          yearlyAmountsInitialized: true,
        },
      },
    ]
  );

  if (result.modifiedCount > 0) {
    console.log(
      `Assigned ${result.modifiedCount} legacy courier charge(s) to ${LEGACY_COURIER_CHARGE_YEAR}`
    );
  }
};

export default migrateCourierChargeAmounts;
