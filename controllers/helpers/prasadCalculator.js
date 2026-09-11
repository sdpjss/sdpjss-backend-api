// Helper function to determine if prasad is for local pickup.
const prasadCollectionModeAsLocalPickup = (donation) => {
  const address = donation.postalAddress?.toLowerCase() || "";
  if (address === "will collect from durga sthan") return true;

  return (
    !address ||
    (address.includes("manpur") &&
      address.includes("gaya") &&
      address.includes("bihar")) ||
    (address.includes("gaya") && address.includes("bihar"))
  );
};

const clearMahaprasad = (list) => {
  list.forEach((item) => {
    item.isPacket = false;
    item.quantity = 0;
  });
};

const isPratimaItem = (item) => item.category === "Maa Durga Pratima";

const categoryUsesMinimumAmount = (category) =>
  category?.amountType === "minimum" ||
  category?.categoryName?.toLowerCase().includes("professional");

const categoryAllowsGramCollection = (category) =>
  category?.prasadType === "grams" ||
  (category?.prasadType === "packet" &&
    (category.allowGramAlternativeForInPerson ||
      category.categoryName?.toLowerCase().includes("professional")));

const calculateCategoryV2Entitlement = (list, categories, prasadRate) => {
  const categoryByName = new Map(
    categories.map((category) => [category.categoryName, category])
  );
  let eligibleAmount = 0;
  let packets = 0;

  list.forEach((item) => {
    const category = categoryByName.get(item.category?.trim());
    if (categoryAllowsGramCollection(category)) {
      eligibleAmount += Number(item.amount) || 0;
    }
    if (category?.prasadType === "packet") {
      packets +=
        (Number(item.number) || 1) * (Number(category.packetsPerUnit) || 1);
    }
  });

  const roundingUnitGrams = Number(prasadRate?.roundingUnitGrams) || 1;
  const rupeesPer100Grams = Number(prasadRate?.rupeesPer100Grams) || 0;
  const gramsPerRupee = rupeesPer100Grams
    ? 100 / rupeesPer100Grams
    : Number(prasadRate?.gramsPerRupee) || 0;
  const minimumPrasadGrams = Number(prasadRate?.minimumPrasadGrams) || 0;
  const rawGrams = eligibleAmount * gramsPerRupee;
  const roundedGrams =
    Math.floor(rawGrams / roundingUnitGrams) * roundingUnitGrams;
  const grams =
    eligibleAmount > 0
      ? Math.max(roundedGrams, minimumPrasadGrams)
      : 0;

  return {
    eligibleAmount,
    grams,
    packets,
    rateYear: prasadRate?.year,
    rupeesPer100Grams:
      rupeesPer100Grams || (gramsPerRupee ? 100 / gramsPerRupee : 0),
    gramsPerRupee,
    minimumPrasadGrams,
    minimumCourierDonationAmount:
      prasadRate?.minimumCourierDonationAmount ?? 1210,
    roundingUnitGrams,
  };
};

const applyCategoryV2Entitlement = (
  list,
  categories,
  entitlement,
  { forceCourierPacket = false } = {}
) => {
  const categoryByName = new Map(
    categories.map((category) => [category.categoryName, category])
  );
  let gramsAssigned = false;

  if (forceCourierPacket) {
    clearMahaprasad(list);
    const eligibleItem = list.find((item) => {
      const category = categoryByName.get(item.category?.trim());
      return category?.prasadType !== "none";
    });
    if (eligibleItem) {
      eligibleItem.isPacket = true;
      eligibleItem.quantity = 1;
    }
    return list;
  }

  list.forEach((item) => {
    const category = categoryByName.get(item.category?.trim());
    const receivesPacket =
      category?.prasadType === "packet" && entitlement.packets > 0;
    item.isPacket = receivesPacket;
    if (receivesPacket) {
      item.quantity =
        (Number(item.number) || 1) * (Number(category.packetsPerUnit) || 1);
    } else if (categoryAllowsGramCollection(category) && !gramsAssigned) {
      item.quantity = entitlement.grams;
      gramsAssigned = true;
    } else {
      item.quantity = 0;
    }
  });

  return list;
};

// Apply the explicit fulfilment selected for a new donation. One fulfilment
// packet represents the combined donation, rather than one packet per category.
const applyMahaprasadFulfillment = (donation) => {
  const fulfillment = donation.mahaprasadFulfillment;
  const list = donation.list || [];

  if (
    donation.donatedAs === "child" ||
    fulfillment?.mode === "none" ||
    fulfillment?.type === "none"
  ) {
    clearMahaprasad(list);
    return true;
  }

  if (fulfillment?.type === "packet") {
    clearMahaprasad(list);
    const eligibleItem = list.find((item) => !isPratimaItem(item));
    if (eligibleItem) {
      eligibleItem.isPacket = true;
      eligibleItem.quantity = 1;
    }
    return true;
  }

  if (fulfillment?.type === "halwa") {
    list.forEach((item) => {
      if (isPratimaItem(item)) {
        item.isPacket = false;
        item.quantity = 0;
        return;
      }
      const isVoluntary = [
        "Voluntary Donations",
        "Voluntary Donation",
      ].includes(item.category);
      item.isPacket = false;
      item.quantity = isVoluntary
        ? 300 * item.number
        : Math.max(300, item.quantity || 0);
    });
    return true;
  }

  return false;
};

// Retain the original calculation for historical donations that do not have
// an explicit fulfilment value.
const applyLegacyMahaprasadRules = (donation) => {
  const isLocalPickup = prasadCollectionModeAsLocalPickup(donation);

  donation.list.forEach((item) => {
    if (isPratimaItem(item)) {
      item.isPacket = false;
      item.quantity = 0;
      return;
    }
    if (isLocalPickup) {
      const isService = item.category?.toLowerCase().includes("service");
      const isVoluntary = [
        "Voluntary Donations",
        "Voluntary Donation",
      ].includes(item.category);
      item.isPacket = isService;
      item.quantity = isService
        ? item.number
        : isVoluntary
          ? 300 * item.number
          : Math.max(300, item.quantity);
    } else {
      item.isPacket = item.amount >= 1100;
      item.quantity = item.isPacket ? 1 : 0;
    }
  });

  const hasServiceWithCourier =
    !isLocalPickup &&
    donation.list.some((item) =>
      item.category?.toLowerCase().includes("service")
    );
  if (hasServiceWithCourier) {
    donation.list.forEach((item) => {
      if (!item.category?.toLowerCase().includes("service")) {
        item.isPacket = false;
        item.quantity = 0;
      }
    });
  }
};

const updateOnlineDonationsWithPrasad = (donations) => {
  donations.forEach((donation) => {
    if (donation.paymentStatus !== "completed") return;

    if (
      donation.prasadEntitlement &&
      (donation.prasadEntitlement.grams !== undefined ||
        donation.prasadEntitlement.packets !== undefined)
    ) {
      donation.prasadPacketCount = donation.prasadEntitlement.packets || 0;
      donation.totalWeightInGrams = donation.prasadEntitlement.grams || 0;
      return;
    }

    if (!applyMahaprasadFulfillment(donation)) {
      applyLegacyMahaprasadRules(donation);
    }

    donation.prasadPacketCount = donation.list.reduce(
      (sum, item) => sum + (item.isPacket ? item.quantity : 0),
      0
    );
    donation.totalWeightInGrams = donation.list.reduce(
      (sum, item) => sum + (item.isPacket ? 0 : item.quantity),
      0
    );
  });

  return donations;
};

export {
  applyCategoryV2Entitlement,
  applyMahaprasadFulfillment,
  calculateCategoryV2Entitlement,
  categoryAllowsGramCollection,
  categoryUsesMinimumAmount,
};
export default updateOnlineDonationsWithPrasad;
