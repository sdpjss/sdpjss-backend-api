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
    if (list.length > 0) {
      list[0].isPacket = true;
      list[0].quantity = 1;
    }
    return true;
  }

  if (fulfillment?.type === "halwa") {
    list.forEach((item) => {
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

export { applyMahaprasadFulfillment };
export default updateOnlineDonationsWithPrasad;
