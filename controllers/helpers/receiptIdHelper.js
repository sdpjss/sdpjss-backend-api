import donationModel from "../../models/DonationModel.js";
import guestDonationModel from "../../models/GuestDonationModel.js";

/**
 * Calculates the current financial year in a 'YY-YY' format.
 * The financial year runs from August 1st to July 31st.
 * @returns {string} The financial year string (e.g., '25-26').
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

/**
 * Generates a unique receipt ID based on payment method and model.
 * The format is SDP/[PaymentMethod][Identifier][SequenceNumber]/[FinancialYear]
 * e.g., SDP/C0001/25-26 or SDP/OP0001/25-26 for a Pratima donation
 *
 * @param {string} method The payment method ("Cash", "Online", "QR Code").
 * @param {string} [modelName="donation"] The model name ("donation" or "guestdonation").
 * @param {string} [receiptIdentifier=""] Optional donation identifier such as "P" for Pratima.
 * @returns {Promise<string>} The new unique receipt ID.
 */
export const generateReceiptId = async (
  method,
  modelName = "donation",
  receiptIdentifier = ""
) => {
  console.log("In generate Receipt: ", method);

  // 1. Determine method code
  let methodCode;
  if (method === "Cash") {
    methodCode = "C";
  } else if (method === "Online") {
    methodCode = "O";
  } else if (method === "QR Code") {
    methodCode = "Q";
  } else {
    methodCode = "X"; // Default or error code
  }

  // 2. Get the financial year
  const financialYear = getFinancialYear();

  // 3. Select the correct model and create the prefix
  let Model;
  const receiptCode = `${methodCode}${receiptIdentifier}`;
  const prefix = `SDP/${receiptCode}`;

  if (modelName === "donation") {
    Model = donationModel;
  } else if (modelName === "guestdonation") {
    Model = guestDonationModel;
  } else {
    throw new Error("Invalid model name provided for receipt ID generation.");
  }

  try {
    // 4. Find the last donation with the same prefix and financial year
    const regex = new RegExp(`^SDP\\/${receiptCode}[0-9]+\\/${financialYear}$`);
    const lastDonation = await Model.findOne(
      { receiptId: { $regex: regex } },
      { receiptId: 1 }
    )
      .sort({ receiptId: -1 })
      .limit(1);

    // 5. Determine the next sequence number
    let nextNumber = 1;
    if (lastDonation && lastDonation.receiptId) {
      // The receipt format is SDP/C0001/25-26, so we need to split by '/'
      const parts = lastDonation.receiptId.split("/");
      const lastNumberString = parts[1].substring(receiptCode.length);
      const lastNumber = parseInt(lastNumberString, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    if (receiptIdentifier && nextNumber > 9999) {
      throw new Error(
        `Receipt sequence exhausted for ${receiptCode}/${financialYear}.`
      );
    }

    // Pratima and existing helper-generated receipts use four digits.
    const paddedNumber = nextNumber.toString().padStart(4, "0");
    const newReceiptId = `${prefix}${paddedNumber}/${financialYear}`;

    return newReceiptId;
  } catch (error) {
    console.error("Error generating receipt ID:", error);
    throw new Error("Failed to generate unique receipt ID.", { cause: error });
  }
};
