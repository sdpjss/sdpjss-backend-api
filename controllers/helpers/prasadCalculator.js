// Helper function to determine if prasad is for local pickup
const prasadCollectionModeAsLocalPickup = (donation) => {
  const address = donation.postalAddress.toLowerCase();
  if (address === "will collect from durga sthan") {
    return true;
  }
  if (!address
      || (address.includes("manpur") && address.includes("gaya") && address.includes("bihar"))
      || (address.includes("gaya") && address.includes("bihar"))) {
    return true;
  }
  return false;
};

// Main function to update prasad packets and weights
const updateOnlineDonationsWithPrasad = (donations) => {
    // Perform Prasad packet and weight calculation
    donations.forEach((donation) => {
      if (donation.paymentStatus !== "completed") {
        return donation; // Skip non-completed donations
      }

      // Determine collection mode
      const isLocalPickUpCollectionMode = prasadCollectionModeAsLocalPickup(donation);

      let prasadPacketCount = 0;
      let totalWeight = 0;

      // Self Donations
      donation.list.forEach((item) => {
        const oldIsPacket = item.isPacket;
        const oldQuantity = item.quantity;
        let newIsPacket, newQuantity;

        // Courier Mode
        if (isLocalPickUpCollectionMode) {
          const isService = item.category?.toLowerCase().includes("service");
          const isVoluntary = item.category === "Voluntary Donations" || item.category === "Voluntary Donation";
          newIsPacket = isService;
          newQuantity = isService ? item.number : isVoluntary ? 300 * item.number : Math.max(300, item.quantity);
        } else {
          newIsPacket = item.amount >= 1100;
          newQuantity = newIsPacket ? 1 : 0;
        }

        // Update item properties and log changes if any
        if (oldIsPacket !== newIsPacket || oldQuantity !== newQuantity) {
          item.isPacket = newIsPacket;
          item.quantity = newQuantity;
          // Log the changes for review
          // console.log(`Receipt ID: ${donation.receiptId}, Item: ${item.category}, Old isPacket: ${oldIsPacket}, New isPacket: ${newIsPacket}, Old Quantity: ${oldQuantity}, New Quantity: ${newQuantity}`);
        }
      });

      const hasDonatedUnderServiceWithCourier = donation.list.some(item => item.category?.toLowerCase().includes("service") && !isLocalPickUpCollectionMode);
      if (hasDonatedUnderServiceWithCourier) {
        donation.list.forEach(item => {
          if (!item.category?.toLowerCase().includes("service")) {
            console.log(`Adjusting packet quantity for Receipt ID: ${donation.receiptId}, Item: ${item.category} to zero packets due to service item with courier.`);
            item.isPacket = false; // Ensure non-service items are not marked as packets
            item.quantity = 0; // Set quantity to 0 for non-packet items
          }
        });
      }

      // After updating all items, calculate prasadPacketCount and totalWeight
      donation.list.forEach((item) => {
        if (item.isPacket) {
          prasadPacketCount += item.quantity;
        } else {
          totalWeight += item.quantity;
        }
      });

      if (prasadPacketCount > 1) {
        console.log(`Receipt ID: ${donation.receiptId} has prasadPacketCount: ${prasadPacketCount} with collection mode: ${isLocalPickUpCollectionMode ? 'Local Pickup' : 'Courier'}`);
      }
      donation.prasadPacketCount = prasadPacketCount;
      donation.totalWeightInGrams = totalWeight;
    });
    console.log(`Completed processing all donations for prasad packet and weight calculation. Total donations processed: ${donations.length}`);
    return donations;
}

export default updateOnlineDonationsWithPrasad;