import express from "express";
import {
  recordGuestDonation,
  getAllDonationsCombined,
  getAllGuestUsers,
  getGuestDonationsById,
} from "../controllers/additionalController.js";

const additionalRouter = express.Router();

// --- DONOR & DONATION MANAGEMENT ROUTES ---

// 📝 Search for existing registered or guest donors by name or mobile
// METHOD: POST
// ENDPOINT: /api/additional/search-donors
additionalRouter.get("/all-guest-users", getAllGuestUsers);

// 📄 Record a new donation for a guest and get a downloadable PDF receipt
// METHOD: POST
// ENDPOINT: /api/additional/record-guest-donation
additionalRouter.post("/record-guest-donation", recordGuestDonation);

// 📊 Get a combined list of all donations (from registered users and guests)
// METHOD: GET
// ENDPOINT: /api/additional/all-donations-combined
additionalRouter.get("/all-donations-combined", getAllDonationsCombined);
additionalRouter.get("/guest-donations/:guestId", getGuestDonationsById);

export default additionalRouter;
