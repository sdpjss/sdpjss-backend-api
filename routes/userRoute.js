import express from "express";
import upload from "../middlewares/multer.js";
import {
  addAdvertisement,
  createDonationOrder,
  createJobOpening,
  createStaffRequirement,
  deleteAdvertisement,
  deleteJobOpening,
  deleteStaffRequirement,
  editAdvertisement,
  editJobOpening,
  editStaffRequirement,
  getAllAdvertisementsWithUserNames,
  getAllDonations,
  getAllJobOpeningsWithUserNames,
  getAllStaffRequirementsWithUserNames,
  getDonationStats,
  getJobOpeningsByUser,
  getMyAdvertisements,
  getStaffRequirementsByUser,
  getUserDonations,
  getUserProfile,
  loginUser,
  registerUser,
  updateAdvertisementStatus,
  updateJobStatus,
  updateStaffStatus,
  updateUserProfile,
  updateProfileImage,
  changePassword,
  verifyDonationPayment,
  forgotPassword,
  verifyOtp,
  resetPassword,
  loginWithOtp,
  sendLoginOtp,
  forgotUsername,
  listUserFeatures,
  verifyRegistrationOtp,
  setInitialPassword,
  resendRegistrationOtp,
} from "../controllers/userController.js";
import authUser from "../middlewares/authUser.js";
import {
  getAllCategories,
  getCategory,
  getCourierCharges,
} from "../controllers/adminController.js";
import {
  addChildUser,
  deleteChildUser,
  editChildUser,
  getMyChildUsers,
} from "../controllers/additionalController.js";

const userRouter = express.Router();

userRouter.post("/register", registerUser);
userRouter.post("/login", loginUser);
userRouter.post("/login-with-otp", upload.none(), loginWithOtp); // NEW
userRouter.post("/send-login-otp", upload.none(), sendLoginOtp); // NEW

userRouter.post("/verify-registration-otp", verifyRegistrationOtp);
userRouter.post("/set-initial-password", setInitialPassword);
userRouter.post("/resend-registration-otp", resendRegistrationOtp);
// --- FORGOT/RECOVERY ROUTES ---
userRouter.post("/forgot-username", upload.none(), forgotUsername); // NEW
userRouter.post("/forgot-password", upload.none(), forgotPassword); // Request OTP
userRouter.post("/verify-otp", upload.none(), verifyOtp); // Verify OTP
userRouter.post("/reset-password", upload.none(), resetPassword); // Reset Password
// ------------------------------

// userRouter.get("/get-by-khandan/:khandanId", authUser, getUsersByKhandan);
userRouter.get("/get-profile", authUser, getUserProfile);
userRouter.post("/update-profile", authUser, updateUserProfile);
userRouter.post(
  "/update-profile-image",
  authUser,
  upload.single("profileImage"),
  updateProfileImage
);
userRouter.post("/change-password", authUser, changePassword);

// ----JOB OPENING--------
userRouter.post("/add-job", upload.none(), authUser, createJobOpening);
userRouter.get("/my-jobs", authUser, getJobOpeningsByUser);
userRouter.get("/get-jobs", authUser, getAllJobOpeningsWithUserNames);
userRouter.post("/edit-job", upload.none(), authUser, editJobOpening);
//----------------
// router.delete('/delete-job/:jobId', authUser, deleteJobOpening);
// router.put('/update-job-status/:jobId', authUser, updateJobStatus);
//----------------
userRouter.delete("/delete-job", upload.none(), authUser, deleteJobOpening);
userRouter.put("/update-job-status", upload.none(), authUser, updateJobStatus);
// -----------------------

// -----STAFF REQUIREMENT-----
userRouter.post("/add-staff", upload.none(), authUser, createStaffRequirement);
userRouter.get("/my-staffs", authUser, getStaffRequirementsByUser);
userRouter.get("/get-staffs", authUser, getAllStaffRequirementsWithUserNames);
userRouter.post("/edit-staff", upload.none(), authUser, editStaffRequirement);
userRouter.delete(
  "/delete-staff",
  upload.none(),
  authUser,
  deleteStaffRequirement
);
userRouter.put(
  "/update-staff-status",
  upload.none(),
  authUser,
  updateStaffStatus
);

// ---------------------------

// -----ADVERTISEMENT-----
userRouter.post(
  "/add-advertisement",
  upload.none(),
  authUser,
  addAdvertisement
);
userRouter.get("/my-advertisements", authUser, getMyAdvertisements);
userRouter.get(
  "/get-advertisements",
  authUser,
  getAllAdvertisementsWithUserNames
);
userRouter.post(
  "/edit-advertisement",
  upload.none(),
  authUser,
  editAdvertisement
);
userRouter.delete(
  "/delete-advertisement",
  upload.none(),
  authUser,
  deleteAdvertisement
);
userRouter.put(
  "/update-advertisement-status",
  upload.none(),
  authUser,
  updateAdvertisementStatus
);

// ---------------------------

userRouter.get("/categories", getAllCategories);
userRouter.get("/categories/:id", getCategory);

// -----DONATION ROUTES-----
// Create donation order (initiate payment)
// Donation Routes - Add these to your userRouter

// Create donation order (initiate payment)
userRouter.post(
  "/create-donation-order",
  upload.none(),
  authUser,
  createDonationOrder
);

// Verify payment and complete donation
userRouter.post(
  "/verify-donation-payment",
  upload.none(),
  authUser,
  verifyDonationPayment
);

// Get user's donations
userRouter.get("/my-donations", authUser, getUserDonations);

// Admin routes (you might want to add admin auth middleware)
// Get all donations
userRouter.get("/get-all-donations", authUser, getAllDonations);

// Get donation statistics
userRouter.get("/donation-stats", authUser, getDonationStats);
userRouter.get("/courier-charges", getCourierCharges);
userRouter.get("/list-features", authUser, listUserFeatures);

// Child user route
userRouter.post("/child/add", authUser, addChildUser);
userRouter.get("/child/my-children/:parentId", authUser, getMyChildUsers);
userRouter.put("/child/edit", authUser, editChildUser);
userRouter.delete("/child/delete", authUser, deleteChildUser);

export default userRouter;
