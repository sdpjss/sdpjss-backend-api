import donationModel from "../models/DonationModel.js";
import guestDonationModel from "../models/GuestDonationModel.js";
import updateOnlineDonationsWithPrasad from "./helpers/prasadCalculator.js";

const validStatuses = new Set([
  "pending",
  "ready",
  "dispatched",
  "fulfilled",
]);

const getIndiaCalendarYear = () =>
  Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
    }).format(new Date())
  );

const getIndiaYearRange = (year) => ({
  start: new Date(Date.UTC(year, 0, 1) - 5.5 * 60 * 60 * 1000),
  end: new Date(Date.UTC(year + 1, 0, 1) - 5.5 * 60 * 60 * 1000),
});

const parseYear = (value) => {
  const currentYear = getIndiaCalendarYear();
  const year = Number(value || currentYear);
  return Number.isInteger(year) && year >= 2000 && year <= currentYear
    ? year
    : null;
};

const getPrasadDetails = (donation) => {
  const hasStoredEntitlement =
    donation.prasadEntitlement &&
    (donation.prasadEntitlement.grams !== undefined ||
      donation.prasadEntitlement.packets !== undefined);
  const grams = hasStoredEntitlement
    ? Number(donation.prasadEntitlement.grams) || 0
    : (donation.list || []).reduce(
        (sum, item) =>
          sum + (item.isPacket ? 0 : Number(item.quantity) || 0),
        0
      );
  const packets = hasStoredEntitlement
    ? Number(donation.prasadEntitlement.packets) || 0
    : (donation.list || []).reduce(
        (sum, item) =>
          sum + (item.isPacket ? Number(item.quantity) || 0 : 0),
        0
      );
  const storedType = donation.mahaprasadFulfillment?.type;
  const type = ["none", "halwa", "packet", "mixed"].includes(storedType)
    ? storedType
    : grams > 0 && packets > 0
      ? "mixed"
      : packets > 0
        ? "packet"
        : grams > 0
          ? "halwa"
          : "none";
  const postalAddress = String(donation.postalAddress || "").toLowerCase();
  const inferredCollection =
    postalAddress === "will collect from durga sthan" ||
    (postalAddress.includes("gaya") && postalAddress.includes("bihar"));
  const mode =
    donation.mahaprasadFulfillment?.mode ||
    (type === "none" ? "none" : inferredCollection ? "collection" : "courier");

  return { grams, packets, type, mode };
};

const getAddressRegion = (deliveryAddress = {}, profileAddress = {}) => {
  const deliveryCountry = String(deliveryAddress.country || "").trim();
  const fallbackCountry = String(profileAddress.country || "").trim();
  const countryForClassification = deliveryCountry || fallbackCountry;
  const location = String(deliveryAddress.currlocation || "").trim();
  const region =
    location === "outside_india" ||
    (countryForClassification &&
      countryForClassification.toLowerCase() !== "india")
      ? "outside_india"
      : "india";

  return {
    region,
    state: String(deliveryAddress.state || "").trim(),
    country: deliveryCountry,
  };
};

const formatRecord = (donation, donorType) => {
  const donor = donorType === "registered" ? donation.userId : donation.guestId;
  const prasad = getPrasadDetails(donation);
  const address = getAddressRegion(
    donation.deliveryAddress || {},
    donor?.address || {}
  );

  return {
    donationId: donation._id,
    donorType,
    receiptId: donation.receiptId || null,
    fullName: donor?.fullname || "Unknown donor",
    grams: prasad.grams,
    packets: prasad.packets,
    fulfillmentType: prasad.type,
    fulfillmentMode: prasad.mode,
    region: address.region,
    state: address.state,
    country: address.country,
    fulfillmentStatus: donation.fulfillmentStatus || "pending",
    courierTrackingNumber: donation.courierTrackingNumber || "",
    fulfillmentUpdatedAt: donation.fulfillmentUpdatedAt || null,
    donatedAt: donation.createdAt,
  };
};

const getMahaprasadFulfillmentList = async (req, res) => {
  try {
    const year = parseYear(req.query.year);
    if (!year) {
      return res.status(400).json({
        success: false,
        message: `Year must be between 2000 and ${getIndiaCalendarYear()}.`,
      });
    }
    const { start, end } = getIndiaYearRange(year);
    const commonQuery = {
      paymentStatus: "completed",
      refunded: { $ne: true },
      createdAt: { $gte: start, $lt: end },
    };

    const [registeredDonations, guestDonations] = await Promise.all([
      donationModel
        .find(commonQuery)
        .populate("userId", "fullname address")
        .sort({ createdAt: -1 }),
      guestDonationModel
        .find(commonQuery)
        .populate("guestId", "fullname address")
        .sort({ createdAt: -1 }),
    ]);
    updateOnlineDonationsWithPrasad(registeredDonations);
    updateOnlineDonationsWithPrasad(guestDonations);

    const records = [
      ...registeredDonations.map((donation) =>
        formatRecord(donation, "registered")
      ),
      ...guestDonations.map((donation) => formatRecord(donation, "guest")),
    ]
      .filter(
        (record) =>
          record.fulfillmentMode !== "none" &&
          (record.grams > 0 || record.packets > 0)
      )
      .sort((first, second) => new Date(second.donatedAt) - new Date(first.donatedAt));

    const summary = records.reduce(
      (result, record) => {
        result.total += 1;
        result[record.region] += 1;
        result[record.fulfillmentStatus] += 1;
        result.totalGrams += record.grams;
        result.totalPackets += record.packets;
        result[record.fulfillmentMode] += 1;
        return result;
      },
      {
        total: 0,
        india: 0,
        outside_india: 0,
        pending: 0,
        ready: 0,
        dispatched: 0,
        fulfilled: 0,
        collection: 0,
        courier: 0,
        totalGrams: 0,
        totalPackets: 0,
      }
    );

    return res.json({
      success: true,
      year,
      currentYear: getIndiaCalendarYear(),
      summary,
      records,
    });
  } catch (error) {
    console.error("Error loading Mahaprasad fulfilment list:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load Mahaprasad fulfilment records.",
    });
  }
};

const updateMahaprasadFulfillmentStatus = async (req, res) => {
  try {
    const { donorType, donationId } = req.params;
    const status = String(req.body.fulfillmentStatus || "").trim();
    const requestedTrackingNumber = String(
      req.body.courierTrackingNumber || ""
    ).trim();
    if (!validStatuses.has(status)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid fulfilment status.",
      });
    }
    if (requestedTrackingNumber.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Courier tracking number cannot exceed 100 characters.",
      });
    }

    const Model =
      donorType === "registered"
        ? donationModel
        : donorType === "guest"
          ? guestDonationModel
          : null;
    if (!Model) {
      return res.status(400).json({
        success: false,
        message: "Invalid donor type.",
      });
    }

    const donation = await Model.findById(donationId);
    if (!donation) {
      return res.status(404).json({
        success: false,
        message: "Donation not found.",
      });
    }
    if (donation.paymentStatus !== "completed" || donation.refunded) {
      return res.status(400).json({
        success: false,
        message: "Only completed, non-refunded donations can be fulfilled.",
      });
    }

    const { mode } = getPrasadDetails(donation);
    if (status === "dispatched" && mode !== "courier") {
      return res.status(400).json({
        success: false,
        message: "Only courier fulfilments can be marked Dispatched.",
      });
    }
    const courierTrackingNumber =
      mode === "courier" ? requestedTrackingNumber : "";
    if (
      mode === "courier" &&
      ["dispatched", "fulfilled"].includes(status) &&
      !courierTrackingNumber
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter the courier tracking number before marking this record Dispatched or Fulfilled.",
      });
    }

    const previousStatus = donation.fulfillmentStatus || "pending";
    const previousTrackingNumber = donation.courierTrackingNumber || "";
    if (
      previousStatus !== status ||
      previousTrackingNumber !== courierTrackingNumber
    ) {
      donation.fulfillmentStatus = status;
      donation.courierTrackingNumber = courierTrackingNumber;
      donation.fulfillmentUpdatedAt = new Date();
      donation.fulfillmentUpdatedBy = String(req.adminId || "unknown");
      donation.fulfillmentStatusHistory.push({
        previousStatus,
        status,
        previousTrackingNumber,
        courierTrackingNumber,
        updatedBy: String(req.adminId || "unknown"),
      });
      await donation.save();
    }

    return res.json({
      success: true,
      message: "Mahaprasad fulfilment status updated successfully.",
      fulfillmentStatus: donation.fulfillmentStatus || "pending",
      courierTrackingNumber: donation.courierTrackingNumber || "",
      fulfillmentUpdatedAt: donation.fulfillmentUpdatedAt || null,
    });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid donation ID.",
      });
    }
    console.error("Error updating Mahaprasad fulfilment status:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update Mahaprasad fulfilment status.",
    });
  }
};

export {
  getMahaprasadFulfillmentList,
  updateMahaprasadFulfillmentStatus,
};
