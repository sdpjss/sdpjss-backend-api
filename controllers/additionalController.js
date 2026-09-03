import mongoose from "mongoose";

// Import your models
import userModel from "../models/UserModel.js";
import guestUserModel from "../models/GuestUserModel.js";
import donationModel from "../models/DonationModel.js";
import guestDonationModel from "../models/GuestDonationModel.js";
import childUserModel from "../models/ChildUserModel.js";

// HELPER FUNCTIONS (Unchanged)
//================================================================

/**
 * Generates a unique ID for a guest user in the format GAAA0001.
 */
const generateGuestId = async () => {
  try {
    const lastGuest = await guestUserModel
      .findOne({}, { id: 1 })
      .sort({ id: -1 })
      .limit(1);

    if (!lastGuest || !lastGuest.id) {
      return "GAAA0001";
    }

    const lastId = lastGuest.id;
    const prefix = lastId.substring(0, 1); // 'G'
    let letters = lastId.substring(1, 4); // 'AAA'
    let number = parseInt(lastId.substring(4), 10); // 0001

    if (number < 9999) {
      const newNumber = (number + 1).toString().padStart(4, "0");
      return `${prefix}${letters}${newNumber}`;
    }

    // Increment letters if number reaches 9999
    let letterArray = letters.split("");
    for (let i = letterArray.length - 1; i >= 0; i--) {
      if (letterArray[i] !== "Z") {
        letterArray[i] = String.fromCharCode(letterArray[i].charCodeAt(0) + 1);
        break;
      } else {
        letterArray[i] = "A";
      }
    }
    const newLetters = letterArray.join("");
    return `${prefix}${newLetters}0001`;
  } catch (error) {
    console.error("Error generating guest ID:", error);
    return `GUEST_ID_ERROR_${Date.now()}`; // Fallback
  }
};

/**
 * Generates a unique receipt ID for a guest donation.
 * Format: SDG[Method_Code][YY][IncrementingNumber]
 * Example: SDGC250000001 (Guest, Cash, 2025)
 * Example: SDGQ250000001 (Guest, QR Code, 2025)
 */
const getFinancialYear = () => {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0 = January, 7 = August
  const currentYear = now.getFullYear();

  let startYear;
  let endYear;

  // The financial year starts in August (month 7)
  if (currentMonth >= 7) {
    startYear = currentYear;
    endYear = currentYear + 1;
  } else {
    // If the month is before August, it's the previous financial year
    startYear = currentYear - 1;
    endYear = currentYear;
  }

  // Slice the last two digits for the format
  const startYearShort = startYear.toString().slice(-2);
  const endYearShort = endYear.toString().slice(-2);

  return `${startYearShort}-${endYearShort}`;
};
const generateGuestReceiptId = async (method) => {
  // 1. Determine method code
  let methodCode;
  switch (method) {
    case "Cash":
      methodCode = "C";
      break;
    case "QR Code":
      methodCode = "Q";
      break;
    default:
      methodCode = "X"; // Default or error code
  }

  // 2. Get the financial year
  const financialYear = getFinancialYear();

  // 3. Create the prefix for guest donations
  const prefix = `SDP/${methodCode}`;

  try {
    // 4. Find the last guest donation with the same prefix and financial year
    const regex = new RegExp(`^SDP\\/${methodCode}[0-9]+\\/${financialYear}$`);
    const lastDonation = await guestDonationModel
      .findOne({ receiptId: { $regex: regex } }, { receiptId: 1 })
      .sort({ receiptId: -1 })
      .limit(1);

    // 5. Determine the next sequence number
    let nextNumber = 1;
    if (lastDonation?.receiptId) {
      // The receipt format is SDP/C0001/25-26, so we split by '/'
      const parts = lastDonation.receiptId.split("/");
      const lastNumberString = parts[1].substring(methodCode.length);
      const lastNumber = parseInt(lastNumberString, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    // 6. Format the new receipt ID with 5-digit padding and financial year
    const paddedNumber = nextNumber.toString().padStart(4, "0");
    return `${prefix}${paddedNumber}/${financialYear}`;
  } catch (error) {
    console.error("Error generating guest receipt ID:", error);
    throw new Error("Failed to generate unique guest receipt ID.", {
      cause: error,
    });
  }
};

// CONTROLLER FUNCTIONS (Updated)
//================================================================

/**
 * @description Records a guest donation for 'Cash' or 'QR Code' methods.
 * @route POST /api/additional/record-guest-donation
 */
const recordGuestDonation = async (req, res) => {
  try {
    const { donorInfo, list, method, remarks } = req.body;

    // --- Validation ---
    if (!donorInfo || !list || !method) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields." });
    }
    if (!donorInfo.fullname || !donorInfo.father || !donorInfo.mobile) {
      return res.status(400).json({
        success: false,
        message:
          "Fullname, Father's name and Mobile are required for the donor.",
      });
    }
    if (!/^\d{10}$/.test(donorInfo.mobile)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid mobile number format." });
    }

    const totalAmount = list.reduce((sum, item) => sum + item.amount, 0);
    if (totalAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Donation amount must be positive." });
    }

    // --- Handle 'Cash' and 'QR Code' donations ---
    if (method === "Cash" || method === "QR Code") {
      // --- Find or Create Guest User ---
      let guest = await guestUserModel.findOne({
        "contact.mobileno.number": donorInfo.mobile,
      });

      if (!guest) {
        const guestId = await generateGuestId();
        guest = new guestUserModel({
          id: guestId,
          fullname: donorInfo.fullname,
          father: donorInfo.father,
          username: "username" + Date.now(), // Fallback username
          contact: {
            mobileno: {
              code: donorInfo.code || "+91",
              number: donorInfo.mobile,
            },
          },
          address: {
            street: donorInfo.address?.street || "N/A",
            city: donorInfo.address?.city || "N/A",
            state: donorInfo.address?.state || "N/A",
            pin: donorInfo.address?.pin || "N/A",
            country: donorInfo.address?.country || "India",
          },
        });
        await guest.save();
      }

      // --- Create Donation Record ---
      const receiptId = await generateGuestReceiptId(method);
      const newDonation = new guestDonationModel({
        guestId: guest._id,
        list,
        amount: totalAmount,
        method,
        remarks,
        receiptId,
        // Using a generic transactionId for manual entries
        transactionId: `${method
          .replace(" ", "_")
          .toUpperCase()}_${Date.now()}`,
      });
      const savedDonation = await newDonation.save();

      return res.status(200).json({
        success: true,
        message: `${method} donation recorded successfully.`,
        data: { donationData: savedDonation, guestData: guest },
      });
    } else {
      return res.status(400).json({
        success: false,
        message:
          "Invalid payment method. Only 'Cash' or 'QR Code' are accepted.",
      });
    }
  } catch (error) {
    console.error("Error recording guest donation:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Failed to record donation. " + error.message,
      });
    }
  }
};

/**
 * @description Get all donations from both registered and guest users, combined and sorted.
 * @route GET /api/additional/all-donations
 */
const getAllDonationsCombined = async (req, res) => {
  try {
    const allDonations = await donationModel.aggregate([
      // Stage 1: Process registered user donations
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "donorDetails",
        },
      },
      { $unwind: "$donorDetails" },
      {
        $project: {
          _id: 1,
          receiptId: 1,
          amount: 1,
          method: 1,
          paymentStatus: 1,
          createdAt: 1,
          donorName: "$donorDetails.fullname",
          donorId: "$donorDetails.id",
          donorType: "Registered",
        },
      },
      // Stage 2: Union with guest donations
      {
        $unionWith: {
          coll: "guestdonations",
          pipeline: [
            {
              $lookup: {
                from: "guestusers",
                localField: "guestId",
                foreignField: "_id",
                as: "donorDetails",
              },
            },
            { $unwind: "$donorDetails" },
            {
              $project: {
                _id: 1,
                receiptId: 1,
                amount: 1,
                method: 1,
                // Guest donations are always considered 'completed' upon creation
                paymentStatus: { $literal: "completed" },
                createdAt: 1,
                donorName: "$donorDetails.fullname",
                donorId: "$donorDetails.id",
                donorType: "Guest",
              },
            },
          ],
        },
      },
      // Stage 3: Sort the combined result
      {
        $sort: { createdAt: -1 },
      },
    ]);

    res.json({
      success: true,
      donations: allDonations,
      count: allDonations.length,
    });
  } catch (error) {
    console.error("Error fetching all donations:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

/**
 * @description Get all guest users.
 * @route GET /api/additional/all-guest-users
 */
const getAllGuestUsers = async (req, res) => {
  try {
    const allGuestUsers = await guestUserModel.find({}).sort({ createdAt: -1 });
    res.json({
      success: true,
      guestUsers: allGuestUsers,
      count: allGuestUsers.length,
    });
  } catch (error) {
    console.error("Error fetching all guest users:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

/**
 * @description Get the last 2 donations for a specific guest user by their MongoDB _id.
 * @route GET /api/additional/guest-donations/:guestId
 */
const getGuestDonationsById = async (req, res) => {
  try {
    const { guestId } = req.params;

    // Validate the provided ID
    if (!mongoose.Types.ObjectId.isValid(guestId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid guest ID format." });
    }

    const donations = await guestDonationModel
      .find({ guestId: guestId })
      .sort({ createdAt: -1 }) // Get the most recent ones first
      .limit(2) // Limit to the last 2
      .select("createdAt list amount"); // Select only the fields we need

    if (!donations) {
      return res.json({ success: true, donations: [] }); // Send empty array if none found
    }

    res.json({
      success: true,
      donations: donations,
    });
  } catch (error) {
    console.error("Error fetching guest donations by ID:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching donations.",
    });
  }
};

// -----------------------Child User Functioins -----------------
// Helper function to generate Child ID
const generateChildId = async () => {
  try {
    const lastChild = await childUserModel
      .findOne({}, { id: 1 })
      .sort({ id: -1 })
      .limit(1);
    if (!lastChild || !lastChild.id) {
      return "CUAAA0001";
    }
    let num = parseInt(lastChild.id.slice(-4));
    num++;
    return "CUAAA" + num.toString().padStart(4, "0");
  } catch (error) {
    console.error("Error generating child ID:", error);
    return `CUERR${Date.now()}`;
  }
};

const addChildUser = async (req, res) => {
  try {
    const { parentId, fullname, mother, gender, dob } = req.body;

    if (!parentId || !fullname || !gender || !dob) {
      return res.status(400).json({
        success: false,
        message: "Parent ID, Fullname, Gender, and DOB are required.",
      });
    }

    const parent = await userModel.findById(parentId);
    if (!parent) {
      return res
        .status(404)
        .json({ success: false, message: "Parent user not found." });
    }

    const existingChild = await childUserModel.findOne({
      fatherid: parentId, // Assuming 'fatherid' is the field in your schema
      fullname,
      dob,
    });

    if (existingChild) {
      return res.status(409).json({
        success: false,
        message:
          "A child with the same name and date of birth already exists for this parent.",
      });
    }

    const childId = await generateChildId();

    const newChild = new childUserModel({
      fullname,
      id: childId,
      fatherid: parentId, // Use the correct field name from your schema
      mother,
      gender,
      dob,
      isComplete: true,
    });

    await newChild.save();

    res.status(201).json({
      success: true,
      message: "Child profile created successfully.",
      data: newChild,
    });
  } catch (error) {
    console.error("Error adding child user:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while adding child." });
  }
};

const getMyChildUsers = async (req, res) => {
  try {
    const { parentId } = req.params;
    if (!parentId) {
      return res
        .status(400)
        .json({ success: false, message: "Parent ID is required." });
    }
    const children = await childUserModel
      .find({ fatherid: parentId })
      .sort({ fullname: 1 });
    res.status(200).json({
      success: true,
      message: "Children fetched successfully.",
      data: children,
    });
  } catch (error) {
    console.error("Error fetching user's children:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching children.",
    });
  }
};

const editChildUser = async (req, res) => {
  try {
    const { _id, parentId, fullname, mother, gender, dob } = req.body;
    var childId = _id;

    if (!childId || !parentId) {
      return res.status(400).json({
        success: false,
        message: "Child ID and Parent ID are required.",
      });
    }

    const childToUpdate = await childUserModel.findById(childId);
    if (!childToUpdate) {
      return res
        .status(404)
        .json({ success: false, message: "Child profile not found." });
    }

    if (childToUpdate.fatherid.toString() !== parentId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to edit this profile.",
      });
    }

    childToUpdate.fullname = fullname || childToUpdate.fullname;
    childToUpdate.mother = mother !== undefined ? mother : childToUpdate.mother; // Allow setting mother to ""
    childToUpdate.gender = gender || childToUpdate.gender;
    childToUpdate.dob = dob || childToUpdate.dob;

    const updatedChild = await childToUpdate.save();

    res.status(200).json({
      success: true,
      message: "Child profile updated successfully.",
      data: updatedChild,
    });
  } catch (error) {
    console.error("Error editing child user:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating child profile.",
    });
  }
};

const deleteChildUser = async (req, res) => {
  try {
    const { childId, parentId } = req.body;
    if (!childId || !parentId) {
      return res.status(400).json({
        success: false,
        message: "Child ID and Parent ID are required.",
      });
    }

    const childToDelete = await childUserModel.findById(childId);
    if (!childToDelete) {
      return res
        .status(404)
        .json({ success: false, message: "Child profile not found." });
    }

    if (childToDelete.fatherid.toString() !== parentId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this profile.",
      });
    }

    await childUserModel.findByIdAndDelete(childId);
    res
      .status(200)
      .json({ success: true, message: "Child profile deleted successfully." });
  } catch (error) {
    console.error("Error deleting child user:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting child profile.",
    });
  }
};

export const getAllChildUsers = async (req, res) => {
  try {
    const allChildren = await childUserModel
      .find({})
      .populate("fatherid", "fullname id") // Populates father's name and ID
      .sort({ createdAt: -1 });

    res
      .status(200)
      .json({ success: true, count: allChildren.length, data: allChildren });
  } catch (error) {
    console.error("Error fetching all child users:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching all child profiles.",
    });
  }
};

import refundModel from "../models/RefundModel.js";
import { generateReceiptId } from "./helpers/receiptIdHelper.js";

export const processFullRefund = async (req, res) => {
  try {
    const { originalDonationId } = req.body;
    // Assuming admin ID is available from middleware
    let adminId = req.adminId;

    // FIX: Add a check to block the invalid "superadmin" string
    if (adminId === "superadmin") {
      console.error(
        "Attempted to process refund with invalid admin ID 'superadmin'."
      );
      // Setting it to null will cause a validation error if the field is required.
      // This effectively blocks the operation, as requested.
      adminId = null;
    }

    // --- Robustly find the donation and its donor details ---
    let originalDonation = await donationModel
      .findById(originalDonationId)
      .populate("userId", "fullname");

    let donorName = "Registered User"; // Default
    if (originalDonation) {
      donorName = originalDonation.userId?.fullname || "N/A";
    } else {
      originalDonation = await guestDonationModel
        .findById(originalDonationId)
        .populate("guestId", "fullname");
      if (originalDonation) {
        donorName = originalDonation.guestId?.fullname || "Guest";
      }
    }

    if (!originalDonation) {
      return res
        .status(404)
        .json({ success: false, message: "Original donation not found." });
    }

    if (originalDonation.refunded) {
      return res.status(400).json({
        success: false,
        message: "This donation has already been refunded.",
      });
    }

    // Mark original donation as refunded (works for both schemas now)
    originalDonation.refunded = true;
    await originalDonation.save();

    // Create a refund record
    await new refundModel({
      originalDonationId,
      originalReceiptId: originalDonation.receiptId,
      donorName: donorName,
      refundedAmount: originalDonation.amount,
      refundMethod: "Full Refund",
      processedByAdmin: adminId,
      newDonationId: null, // No new donation in a full refund
      notes: `Full refund processed by admin.`,
    }).save();

    res
      .status(200)
      .json({ success: true, message: "Refund processed successfully." });
  } catch (error) {
    console.error("Error processing full refund:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error during refund." });
  }
};

/**
 * @description Replaces a donation by refunding the old one and creating a new one.
 * Handles both registered and guest user donations.
 */
export const processEditAndReplace = async (req, res) => {
  try {
    const { originalDonationId, updatedDonation, adjustmentDetails } = req.body;
    // Assuming admin ID is available from middleware
    let adminId = req.adminId;

    // FIX: Add a check to block the invalid "superadmin" string
    if (adminId === "superadmin") {
      console.error(
        "Attempted to process refund with invalid admin ID 'superadmin'."
      );
      // Setting it to null will cause a validation error if the field is required.
      // This effectively blocks the operation, as requested.
      adminId = null;
    }

    // --- Step 1: Find the original donation robustly ---
    let originalDonation;
    let isGuestDonation = false;

    // Try finding in registered user donations first
    originalDonation = await donationModel
      .findById(originalDonationId)
      .populate("userId", "fullname");

    // If not found, try guest donations
    if (!originalDonation) {
      originalDonation = await guestDonationModel
        .findById(originalDonationId)
        .populate("guestId", "fullname");
      if (originalDonation) {
        isGuestDonation = true;
      }
    }

    if (!originalDonation) {
      return res
        .status(404)
        .json({ success: false, message: "Original donation not found." });
    }

    if (originalDonation.refunded) {
      return res.status(400).json({
        success: false,
        message: "This donation has already been refunded/edited.",
      });
    }

    // --- Step 2: Mark original as refunded ---
    originalDonation.refunded = true;
    await originalDonation.save();

    // --- Step 3: Determine final payment method and generate new Receipt ID ---
    const amountDifference = updatedDonation.amount - originalDonation.amount;
    let finalPaymentMethod = originalDonation.method; // Default to original method // ✅ **IMPROVEMENT**: If new amount is GREATER, use the new adjustment method.

    if (amountDifference > 0 && adjustmentDetails) {
      finalPaymentMethod = adjustmentDetails.method;
    }

    // --- Step 3: Prepare and create the new donation ---
    const Model = isGuestDonation ? guestDonationModel : donationModel;
    const newReceiptId = await generateReceiptId(
      finalPaymentMethod,
      Model.modelName.toLowerCase()
    );

    const originalData = originalDonation.toObject();
    // Clean up fields that should not be copied
    ["_id", "__v", "createdAt", "updatedAt", "refunded", "receiptId"].forEach(
      (key) => delete originalData[key]
    );

    let newDonationData = {
      ...originalData,
      ...updatedDonation, // Apply updates from the request body
      receiptId: newReceiptId,
      createdBy: adminId,
      refunded: false, // Ensure the new record is not marked as refunded
      method: finalPaymentMethod,
    };

    if (amountDifference > 0 && adjustmentDetails) {
      // If the new amount is GREATER, a new payment was made for the difference.
      // The new donation record should reflect this new payment's details.
      newDonationData.transactionId = adjustmentDetails.transactionId;
    }

    const newDonation = new Model(newDonationData);
    await newDonation.save();

    // --- Step 4: Create the refund record to link old and new ---
    const donorName = isGuestDonation
      ? originalDonation.guestId?.fullname || "Guest"
      : originalDonation.userId?.fullname || "N/A";

    await new refundModel({
      originalDonationId,
      originalReceiptId: originalDonation.receiptId,
      donorName: donorName,
      refundedAmount: originalDonation.amount,
      refundMethod: "Edit/Replace",
      processedByAdmin: adminId,
      newDonationId: newDonation._id,
      notes: `Edited from ${originalDonation.amount} to ${newDonation.amount}. New Receipt: ${newDonation.receiptId}`,
    }).save();

    // --- Step 5: Populate and return the new donation ---
    let populatedNewDonation = await newDonation.populate(
      isGuestDonation
        ? { path: "guestId", select: "fullname id" }
        : { path: "userId donatedFor", select: "fullname id" }
    );

    res.status(201).json({
      success: true,
      message: "Donation updated successfully.",
      newDonation: populatedNewDonation,
    });
  } catch (error) {
    console.error("Error processing edit and replace:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error during update." });
  }
};
// Controller for Refund Page
export const getRefunds = async (req, res) => {
  try {
    const { year, paymentMode } = req.query;
    let query = {};

    if (year) {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      query.refundDate = { $gte: startDate, $lte: endDate };
    }

    if (paymentMode && paymentMode !== "all") {
      query.refundMethod = paymentMode;
    }

    const refunds = await refundModel
      .find(query)
      .populate("processedByAdmin", "name")
      .sort({ refundDate: -1 });

    res.status(200).json({ success: true, refunds });
  } catch (error) {
    console.error("Error fetching refunds:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching refunds.",
    });
  }
};

export const getDonationDetails = async (req, res) => {
  try {
    const { donationId } = req.params;

    if (!donationId) {
      return res.json({
        success: false,
        message: "Donation ID is required.",
      });
    }

    const donation = await donationModel.findById(donationId);

    if (!donation) {
      return res.json({
        success: false,
        message: "Donation not found.",
      });
    }

    res.json({
      success: true,
      donation,
      message: "Donation details fetched successfully.",
    });
  } catch (error) {
    console.error("Error fetching donation details:", error);
    res.json({
      success: false,
      message: "An error occurred while fetching donation details.",
    });
  }
};

export {
  recordGuestDonation,
  getAllDonationsCombined,
  getAllGuestUsers,
  getGuestDonationsById,
  addChildUser,
  getMyChildUsers,
  editChildUser,
  deleteChildUser,
};
