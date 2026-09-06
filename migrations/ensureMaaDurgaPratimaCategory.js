import donationCategoryModel from "../models/DonationCategoryModel.js";

const CATEGORY_CODE = "maa_durga_pratima";
const CATEGORY_NAME = "Maa Durga Pratima";
const MINIMUM_AMOUNT = 2500;

const ensureMaaDurgaPratimaCategory = async () => {
  const currentYear = new Date().getFullYear();
  const existingCategory = await donationCategoryModel.findOne({
    $or: [
      { categoryCode: CATEGORY_CODE },
      { categoryName: CATEGORY_NAME },
    ],
  });

  if (!existingCategory) {
    await donationCategoryModel.create({
      categoryName: CATEGORY_NAME,
      categoryCode: CATEGORY_CODE,
      rate: MINIMUM_AMOUNT,
      yearlyRates: [{ year: currentYear, rate: MINIMUM_AMOUNT }],
      yearlyRatesInitialized: true,
      weight: 0,
      packet: false,
      isActive: true,
      description: "Special contribution for Maa Durga Pratima",
      dynamic: {
        isDynamic: true,
        minvalue: MINIMUM_AMOUNT,
      },
      amountType: "minimum",
      availableFor: ["self"],
      isSpecial: true,
      showInRegularDonation: false,
    });
    console.log("Created Maa Durga Pratima special donation category");
    return;
  }

  existingCategory.categoryCode = CATEGORY_CODE;
  existingCategory.amountType = "minimum";
  existingCategory.availableFor = ["self"];
  existingCategory.isSpecial = true;
  existingCategory.showInRegularDonation = false;
  existingCategory.dynamic = {
    ...existingCategory.dynamic,
    isDynamic: true,
    minvalue: Math.max(
      Number(existingCategory.dynamic?.minvalue) || 0,
      MINIMUM_AMOUNT
    ),
  };

  const isDisabledForCurrentYear =
    existingCategory.disabledRateYears?.includes(currentYear);
  if (
    !isDisabledForCurrentYear &&
    !existingCategory.yearlyRates.some(({ year }) => year === currentYear)
  ) {
    existingCategory.yearlyRates.push({
      year: currentYear,
      rate: MINIMUM_AMOUNT,
    });
  }
  existingCategory.rate = Math.max(
    Number(existingCategory.rate) || 0,
    MINIMUM_AMOUNT
  );
  await existingCategory.save();
};

export default ensureMaaDurgaPratimaCategory;
