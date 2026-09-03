import validator from "validator";
import bcrypt from "bcrypt";
import crypto from "crypto";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import razorpay from "razorpay";
import axios from "axios";

import userModel from "../models/UserModel.js";
import jobOpeningModel from "../models/JobOpeningModel.js";
import staffRequirementModel from "../models/StaffRequirementModel.js";
import advertisementModel from "../models/AdvertisementModel.js";
import donationModel from "../models/DonationModel.js";
import guestDonationModel from "../models/GuestDonationModel.js";
import featureModel from "../models/FeatureModel.js";
import sendEmail from "../services/emailServer.js";
import updateOnlineDonationsWithPrasad from "./helpers/prasadCalculator.js";

// Initialize Razorpay
const razorpayInstance = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Function to generate username from fullname and dob
const generateUsername = (fullname, dob) => {
  const firstName = fullname.split(" ")[0].toLowerCase();
  const date = new Date(dob);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString().slice(-2);
  return `${firstName}${day}${month}${year}`;
};

// Function to generate unique user ID in format UABC0001
const generateUserId = async () => {
  try {
    // Find the latest user with the highest ID
    const lastUser = await userModel
      .findOne({}, { id: 1 })
      .sort({ id: -1 })
      .limit(1);

    if (!lastUser || !lastUser.id) {
      return "UAAA0001";
    }

    const lastId = lastUser.id;

    // Extract parts: U + ABC + 0001
    const prefix = lastId.substring(0, 1); // 'U'
    const letters = lastId.substring(1, 4); // 'ABC'
    const number = parseInt(lastId.substring(4)); // 0001

    // If number can be incremented (less than 9999)
    if (number < 9999) {
      const newNumber = (number + 1).toString().padStart(4, "0");
      return `${prefix}${letters}${newNumber}`;
    }

    // Number has reached maximum, increment letters
    let newLetters = incrementLetters(letters);
    return `${prefix}${newLetters}0001`;
  } catch (error) {
    console.error("Error generating user ID:", error);
    return "UAAA0001";
  }
};

// Function to increment letters (ABC -> ABD -> ABE ... -> ABZ -> ACA -> ACB ...)
const incrementLetters = (letters) => {
  let letterArray = letters.split("");

  // Start from the rightmost letter
  for (let i = letterArray.length - 1; i >= 0; i--) {
    if (letterArray[i] !== "Z") {
      // Increment current letter
      letterArray[i] = String.fromCharCode(letterArray[i].charCodeAt(0) + 1);
      break;
    } else {
      // Current letter is Z, set to A and continue to next position
      letterArray[i] = "A";

      // If we're at the first position and it was Z, we need to expand
      if (i === 0) {
        // This shouldn't happen in normal usage, but handle edge case
        letterArray = ["A", "A", "A"];
      }
    }
  }

  return letterArray.join("");
};

const numberToWords = (num) => {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  const convertHundreds = (n) => {
    let result = "";
    if (n >= 100) {
      result += ones[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 20) {
      result += tens[Math.floor(n / 10)] + " ";
      n %= 10;
    } else if (n >= 10) {
      result += teens[n - 10] + " ";
      return result;
    }
    if (n > 0) {
      result += ones[n] + " ";
    }
    return result;
  };

  if (num === 0) return "Zero";

  let result = "";
  let crore = Math.floor(num / 10000000);
  let lakh = Math.floor((num % 10000000) / 100000);
  let thousand = Math.floor((num % 100000) / 1000);
  let remainder = num % 1000;

  if (crore > 0) {
    result += convertHundreds(crore) + "Crore ";
  }
  if (lakh > 0) {
    result += convertHundreds(lakh) + "Lakh ";
  }
  if (thousand > 0) {
    result += convertHundreds(thousand) + "Thousand ";
  }
  if (remainder > 0) {
    result += convertHundreds(remainder);
  }

  return result.trim();
};

const verifyRecaptcha = async (token) => {
  try {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const response = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`
    );
    return response.data.success;
  } catch (error) {
    console.error("reCAPTCHA verification failed:", error);
    return false;
  }
};

//-----------------------------------------------------------------------------

// API for user registration
const registerUser = async (req, res) => {
  try {
    const {
      fullname: rawFullname,
      fatherid,
      fatherName: rawFatherName,
      mother: rawMother,
      gender,
      dob,
      bloodgroup,
      khandanid,
      email: rawEmail,
      mobile,
      address: rawAddress,
      education,
      profession,
      healthissue: rawHealthissue,
      marriage,
      recaptchaToken,
    } = req.body;

    if (!recaptchaToken) {
      return res.json({
        success: false,
        message: "reCAPTCHA token is missing.",
      });
    }
    const isHuman = await verifyRecaptcha(recaptchaToken);
    if (!isHuman) {
      return res.json({
        success: false,
        message: "reCAPTCHA verification failed. Please try again.",
      });
    }
    const fullname = rawFullname?.trim();
    const fatherName = rawFatherName?.trim();
    const mother = rawMother?.trim();
    const email = rawEmail?.trim();
    const healthissue = rawHealthissue?.trim();

    // Validate required fields
    if (
      !fullname ||
      !(fatherid || fatherName) ||
      !gender ||
      !dob ||
      !khandanid ||
      !rawAddress
    ) {
      return res.json({
        success: false,
        message:
          "Missing required details: fullname, fatherid/fatheName, gender, dob, khandanid, and address are required",
      });
    }
    // --- TRIMMED --- Create a new address object with trimmed values
    const address = {
      currlocation: rawAddress.currlocation?.trim(),
      country: rawAddress.country?.trim(),
      state: rawAddress.state?.trim(),
      district: rawAddress.district?.trim(),
      city: rawAddress.city?.trim(),
      postoffice: rawAddress.postoffice?.trim(),
      pin: rawAddress.pin?.trim(),
      street: rawAddress.street?.trim(),
      landmark: rawAddress.landmark?.trim(),
      apartment: rawAddress.apartment?.trim(),
      floor: rawAddress.floor?.trim(),
      room: rawAddress.room?.trim(),
    };
    // Validate required address fields
    const requiredAddressFields = [
      "currlocation",
      "country",
      "state",
      "city",
      "pin",
      "street",
    ];

    const missingAddressFields = requiredAddressFields.filter(
      (field) => {
        // If the location is 'outside_india' AND the field is 'state', we don't
        // want to perform the validation, so we return false to exclude it.
        if (address.currlocation === "outside_india" && field === "state") {
          return false;
        }

        // For all other fields and locations, perform the original validation logic.
        return !address[field] || address[field].trim() === "";
      }
    );

    if (missingAddressFields.length > 0) {
      return res.json({
        success: false,
        message: `Missing required address fields: ${missingAddressFields.join(
          ", "
        )}`,
      });
    }

    // Validate that at least one contact method is provided
    const hasEmail = email && email !== "";
    const hasMobile = mobile && mobile.code && mobile.number;

    if (!hasEmail || !hasMobile) {
      return res.json({
        success: false,
        message: "Contact (email & mobile) is required",
      });
    }

    // Validate email format if provided
    if (hasEmail && !validator.isEmail(email)) {
      return res.json({ success: false, message: "Enter a valid email" });
    }

    // Validate mobile number if provided
    if (
      hasMobile &&
      (typeof mobile !== "object" ||
        !mobile.code ||
        !mobile.number ||
        (mobile.code === "+91" ?
          !/^\d{10}$/.test(mobile.number) : // For +91, require 10 digits
          !/^\d{9,11}$/.test(mobile.number))) // For other codes, allow 9, 10, or 11 digits
    ) {
      return res.json({
        success: false,
        message: "Enter a valid mobile number",
      });
    }

    // Validate gender
    if (!["male", "female", "other"].includes(gender.toLowerCase())) {
      return res.json({
        success: false,
        message: "Gender must be 'male', 'female', or 'other'",
      });
    }

    // Validate date of birth
    const dobDate = new Date(dob);
    if (isNaN(dobDate.getTime())) {
      return res.json({
        success: false,
        message: "Enter a valid date of birth",
      });
    }

    // Check for an existing user with the same name, father's name, and DOB.
    const existingUser = await userModel.findOne({
      fullname: fullname,
      fatherName: fatherName,
      dob: dobDate,
      gender: gender,
    });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min validity

    if (existingUser) {
      if (!existingUser.password) {
        // Update email if it has changed, and set new OTP
        existingUser.contact.email = email;
        existingUser.otp = otp;
        existingUser.otpExpires = otpExpires;
        // Explicitly tell Mongoose that the 'contact.email' field has been modified
        existingUser.markModified('contact.email');
        await existingUser.save();
        const subject = "Verify Your Email for SDPJSS Registration";
        const htmlBody = `
          <p>Dear ${existingUser.fullname},</p>
          <p>Thank you for registering. Your One-Time Password (OTP) to complete the setup is:</p>
          <h2><b>${otp}</b></h2>
          <p>This OTP is valid for 10 minutes. Please use it to verify your account and set your password.</p>
          <p>Best regards,<br>SDPJSS</p>
        `;

          await sendEmail(email, subject, htmlBody);

        return res.json({
          success: true,
          message:
            "You have already registered. A new OTP has been sent to your email to set your password.",
          nextStep: "verifyOtp",
          email: email, // Return email for frontend state
        });
      } else {
        // User is fully registered.
        return res.json({
          success: false,
          message:
            "A user with the same name, father's name, and date of birth already exists.",
        });
      }
    }

    const today = new Date();
    const minAllowedDate = new Date();
    minAllowedDate.setFullYear(today.getFullYear() - 12);

    // Check if DOB is at least 12 years earlier
    if (dobDate > minAllowedDate) {
      return res.json({
        success: false,
        message: "You must be at least 12 years old",
      });
    }

    // Generate unique user ID
    const userId = await generateUserId();

    // Generate username and password
    const generatedUsername = generateUsername(fullname, dobDate);

    // Check if username already exists, if so, add a number suffix
    let finalUsername = generatedUsername;
    let counter = 1;
    while (await userModel.findOne({ username: finalUsername })) {
      finalUsername = `${generatedUsername}${counter}`;
      counter++;
    }

    // Prepare contact object
    const contactData = {
      email: hasEmail ? email : "",
      mobileno: hasMobile ? mobile : { code: "+91", number: "0000000000" },
      whatsappno: "",
    };

    // Prepare address object with required fields
    const addressData = {
      currlocation: address.currlocation,
      country: address.country,
      state: address.state,
      city: address.city,
      pin: address.pin,
      street: address.street,
      // Optional fields
      postoffice: address.postoffice || "",
      district: address.district || "",
      landmark: address.landmark || "",
      apartment: address.apartment || "",
      floor: address.floor || "",
      room: address.room || "",
    };

    // Create user data
    const userData = {
      fullname,
      id: userId,
      fatherid,
      fatherName,
      mother: mother || "",
      gender: gender.toLowerCase(),
      dob: dobDate,
      bloodgroup: bloodgroup || "",
      username: finalUsername,
      khandanid,
      contact: contactData,
      address: addressData,
      education: education || {
        upto: "",
        qualification: "",
      },
      profession: profession || {
        category: "",
        job: "",
        specialization: "",
      },
      healthissue: healthissue || "None",
      marriage: marriage || {
        maritalstatus: "",
        number: "",
        spouse: [],
      },
      islive: true,
      isComplete: false,
      otp,
      otpExpires,
      isApproved: "approved",
    };

    const newUser = new userModel(userData);
    await newUser.save();

    const subject = "Verify Your Email for SDPJSS Registration";
    const htmlBody = `
      <p>Dear ${fullname},</p>
      <p>Thank you for registering. Your One-Time Password (OTP) to complete the setup is:</p>
      <h2><b>${otp}</b></h2>
      <p>This OTP is valid for 10 minutes. Please use it to verify your account and set your password.</p>
      <p>Best regards,<br>SDPJSS</p>
    `;

    await sendEmail(email, subject, htmlBody);

    return res.json({
      success: true,
      message: "You are great",
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// --- MODIFIED: API for Registration (Step 2: Verify OTP) ---
const verifyRegistrationOtp = async (req, res) => {
  try {
    const {
      email: rawEmail,
      otp,
      fullname: rawFullname,
      fatherName: rawFatherName,
      dob,
    } = req.body;
    const email = rawEmail?.trim().toLowerCase();
    const fullname = rawFullname?.trim();
    const fatherName = rawFatherName?.trim();

    if (!email || !otp || !fullname || !fatherName || !dob) {
      return res.json({
        success: false,
        message: "Email, OTP, and user identification details are required.",
      });
    }

    const user = await userModel.findOne({
      fullname,
      fatherName,
      dob: new Date(dob),
      "contact.email": email,
    });

    if (!user) {
      return res.json({
        success: false,
        message: "User not found. Please start over.",
      });
    }

    if (user.otp !== otp || user.otpExpires < new Date()) {
      return res.json({
        success: false,
        message: "OTP has expired or is invalid.",
      });
    }

    // OTP is valid, clear it
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({
      success: true,
      message: "OTP verified successfully. Please set your password.",
      nextStep: "setPassword",
    });
  } catch (error) {
    console.error("Error verifying registration OTP:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// --- MODIFIED: API for Registration (Step 3: Set Initial Password & Login) ---
const setInitialPassword = async (req, res) => {
  try {
    const {
      email: rawEmail,
      password,
      fullname: rawFullname,
      fatherName: rawFatherName,
      dob,
    } = req.body;
    const email = rawEmail?.trim().toLowerCase();
    const fullname = rawFullname?.trim();
    const fatherName = rawFatherName?.trim();

    if (!email || !password || !fullname || !fatherName || !dob) {
      return res.json({
        success: false,
        message:
          "Email, password, and user identification details are required.",
      });
    }

    if (password.length < 8) {
      return res.json({
        success: false,
        message: "Password must be at least 8 characters long.",
      });
    }

    const user = await userModel.findOne({
      fullname,
      fatherName,
      dob: new Date(dob),
      "contact.email": email,
    });

    if (!user) {
      return res.json({ success: false, message: "User not found." });
    }
    if (user.password) {
      return res.json({
        success: false,
        message: "Password has already been set for this account.",
      });
    }

    // Hash and save the new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    // Auto-login: Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "2d",
    });

    const subject = "Your SDPJSS Account is Ready!";
    const htmlBody = `
      <p>Dear ${user.fullname},</p>
      <p>This is to confirm that your password has been successfully set. Your account is now active and ready to use.</p>
      <p>You can now log in using the following username:</p>
      <p><strong>Username: ${user.username}</strong></p>
      <p>If you did not make this change, please contact us immediately.</p>
      <p>Best regards,<br>SDPJSS</p>
    `;

    await sendEmail(email, subject, htmlBody);

    res.json({
      success: true,
      token,
      message: "Password set successfully! You are now logged in.",
    });
  } catch (error) {
    console.error("Error setting initial password:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

const resendRegistrationOtp = async (req, res) => {
  try {
    const {
      email: rawEmail,
      fullname: rawFullname,
      fatherName: rawFatherName,
      dob,
    } = req.body;
    const email = rawEmail?.trim().toLowerCase();
    const fullname = rawFullname?.trim();
    const fatherName = rawFatherName?.trim();

    if (!email || !fullname || !fatherName || !dob) {
      return res.json({
        success: false,
        message: "Required user details are missing to resend OTP.",
      });
    }

    const user = await userModel.findOne({
      fullname,
      fatherName,
      dob: new Date(dob),
      "contact.email": email,
    });

    if (!user) {
      return res.json({
        success: false,
        message: "Pending registration not found. Please start over.",
      });
    }

    if (user.password) {
      return res.json({
        success: false,
        message: "This account is already fully registered.",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min validity
    await user.save();

    // await sendOtpEmail(email, otp, user.fullname);
    const subject = "Your New Registration OTP";
    const htmlBody = `
      <p>Dear ${user.fullname},</p>
      <p>As requested, here is your new One-Time Password (OTP):</p>
      <h2><b>${otp}</b></h2>
      <p>This OTP is valid for 10 minutes.</p>
      <p>Best regards,<br>SDPJSS</p>
    `;

    await sendEmail(email, subject, htmlBody);
    res.json({
      success: true,
      message: "A new OTP has been sent to your email.",
    });
  } catch (error) {
    console.error("Error resending registration OTP:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

//API for user login
const loginUser = async (req, res) => {
  try {
    const { username: rawUsername, password, recaptchaToken } = req.body; // <-- NEW recaptchaToken

    // Verify reCAPTCHA
    if (!recaptchaToken) {
      return res.json({
        success: false,
        message: "reCAPTCHA token is missing.",
      });
    }
    const isHuman = await verifyRecaptcha(recaptchaToken);
    if (!isHuman) {
      return res.json({
        success: false,
        message: "reCAPTCHA verification failed.",
      });
    }

    const username = rawUsername?.trim();

    if (!username || !password) {
      return res.json({
        success: false,
        message: "Username and password are required",
      });
    }

    const user = await userModel.findOne({ username });

    if (!user) {
      return res.json({ success: false, message: "User does not exist" });
    }

    // Check if password is set
    if (!user.password) {
      return res.json({
        success: false,
        message:
          "Account setup is not complete. Please use the 'Forgot Password' option to set your password.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      const utoken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "20m",
      });
      res.json({ success: true, utoken });
    } else {
      res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get user profile data
const getUserProfile = async (req, res) => {
  try {
    // User will send userId or get it from token
    const { userId } = req.body;

    if (!userId) {
      return res.json({ success: false, message: "User ID is required" });
    }

    const userData = await userModel.findById(userId).select("-password");

    if (!userData) {
      return res.json({ success: false, message: "User not found" });
    }

    res.json({ success: true, userData });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to update user profile
const updateUserProfile = async (req, res) => {
  try {
    const { userId, ...updateData } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required." });
    }

    // Basic validation for incoming data
    if (Object.keys(updateData).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No update data provided." });
    }

    // Optional: Add more specific validation if needed
    if (
      updateData.contact &&
      updateData.contact.email &&
      !validator.isEmail(updateData.contact.email)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide a valid email." });
    }

    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        {
          $set: updateData, // Use $set to update only the fields provided in updateData
          updatedAt: new Date(),
        },
        {
          new: true, // Return the updated document
          runValidators: true, // Ensure schema validation is run on update
        }
      )
      .select("-password");

    if (!updatedUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    res.json({
      success: true,
      message: "Profile updated successfully!",
      userData: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    // Handle potential validation errors from Mongoose
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({
      success: false,
      message: "Failed to update profile. Please try again.",
    });
  }
};

const updateProfileImage = async (req, res) => {
  try {
    const { userId } = req.body;
    const imageFile = req.file;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required." });
    }
    if (!imageFile) {
      return res
        .status(400)
        .json({ success: false, message: "No image file uploaded." });
    }

    // Upload to Cloudinary
    const imageUpload = await cloudinary.uploader.upload(imageFile.path, {
      resource_type: "image",
      folder: "profile_images", // Optional: organize uploads in a folder
    });

    const imageURL = imageUpload.secure_url;

    // Update the user's image field in the database
    const updatedUser = await userModel
      .findByIdAndUpdate(userId, { image: imageURL }, { new: true })
      .select("-password");

    if (!updatedUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    res.json({
      success: true,
      message: "Profile image updated successfully.",
      image: imageURL,
    });
  } catch (error) {
    console.error("Error updating profile image:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update profile image." });
  }
};

// Change Password Route
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, userId } = req.body;

    // Validate input
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Old password and new password are required",
      });
    }

    // Check password length
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters long",
      });
    }

    // Find user
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Check if new password is different from old password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await userModel.findByIdAndUpdate(userId, {
      password: hashedNewPassword,
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getUsersByKhandan = async (req, res) => {
  try {
    const { khandanId } = req.params;

    if (!khandanId) {
      return res.json({
        success: false,
        message: "Khandan ID is required",
      });
    }

    // Find users by khandanid
    const users = await userModel
      .find({ khandanid: khandanId })
      .select("id fullname gender dob")
      .sort({ fullname: 1 });

    if (!users || users.length === 0) {
      return res.json({
        success: false,
        message: "No users found for this khandan",
        users: [],
      });
    }

    res.json({
      success: true,
      message: "Users fetched successfully",
      users: users,
    });
  } catch (error) {
    console.error("Error fetching users by khandan:", error);
    res.json({
      success: false,
      message: "Failed to fetch users: " + error.message,
      users: [],
    });
  }
};

// API to create a job opening
const createJobOpening = async (req, res) => {
  try {
    const {
      userId,
      title,
      category,
      description,
      location,
      salary,
      jobType,
      availabilityDate,
      requirements,
      contact,
    } = req.body;

    console.log({
      userId,
      title,
      category,
      description,
      location,
      salary,
      jobType,
      availabilityDate,
      requirements,
      contact,
    });

    // Check for required fields
    if (!userId || !title || !description || !location || !contact) {
      return res.json({
        success: false,
        message: "Missing required job fields",
      });
    }

    const parsedContact =
      typeof contact === "string" ? JSON.parse(contact) : contact;
    const parsedRequirements =
      typeof requirements === "string"
        ? JSON.parse(requirements)
        : requirements;

    //Validating mobile number
    if (
      !parsedContact.code ||
      !parsedContact.number ||
      !/^\d{10}$/.test(parsedContact.number)
    ) {
      return res.json({
        success: false,
        message: "Enter a valid mobile number",
      });
    }

    // validate email format
    if (!validator.isEmail(parsedContact.email)) {
      return res.json({ success: false, message: "Enter a valid email" });
    }

    const jobOpening = await jobOpeningModel.create({
      userId,
      title,
      category,
      description,
      location,
      salary,
      jobType,
      availabilityDate,
      requirements: parsedRequirements,
      contact: parsedContact,
    });

    res.json({
      success: true,
      message: "Job opening created successfully",
      jobOpening,
    });
  } catch (error) {
    console.log("Error in createJobOpening:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to get the job Openings generated by a User
const getJobOpeningsByUser = async (req, res) => {
  try {
    const { userId } = req.body; // Assuming user is authenticated and ID is in `req.user`

    const jobOpenings = await jobOpeningModel.find({ userId });

    res.status(200).json({ success: true, jobOpenings });
  } catch (error) {
    console.error("Error fetching user's job openings:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// API to get all the job openings open to people
const getAllJobOpeningsWithUserNames = async (req, res) => {
  try {
    const jobOpenings = await jobOpeningModel.find().populate({
      path: "userId",
      select: "fullname", // Only fetch the fullname of the user
    });

    const formatted = jobOpenings.map((job) => ({
      _id: job._id,
      title: job.title,
      category: job.category,
      description: job.description,
      location: job.location,
      salary: job.salary,
      jobType: job.jobType,
      availabilityDate: job.availabilityDate,
      requirements: job.requirements,
      isOpen: job.isOpen,
      contact: job.contact,
      postedDate: job.postedDate,
      userFullname: job.userId?.fullname || "Unknown",
    }));

    res.status(200).json({ success: true, jobOpenings: formatted });
  } catch (error) {
    console.error("Error fetching all job openings:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// API to edit/update a job opening
const editJobOpening = async (req, res) => {
  try {
    const {
      jobId,
      title,
      category,
      description,
      location,
      salary,
      jobType,
      availabilityDate,
      requirements,
      contact,
    } = req.body;

    // Check for required fields
    if (!jobId || !title || !description || !location || !contact) {
      return res.json({
        success: false,
        message: "Missing required job fields",
      });
    }

    const parsedContact =
      typeof contact === "string" ? JSON.parse(contact) : contact;
    const parsedRequirements =
      typeof requirements === "string"
        ? JSON.parse(requirements)
        : requirements;

    // Validating mobile number
    if (
      !parsedContact.code ||
      !parsedContact.number ||
      !/^\d{10}$/.test(parsedContact.number)
    ) {
      return res.json({
        success: false,
        message: "Enter a valid mobile number",
      });
    }

    // validate email format
    if (!validator.isEmail(parsedContact.email)) {
      return res.json({ success: false, message: "Enter a valid email" });
    }

    const updatedJob = await jobOpeningModel.findByIdAndUpdate(
      jobId,
      {
        title,
        category,
        description,
        location,
        salary,
        jobType,
        availabilityDate,
        requirements: parsedRequirements,
        contact: parsedContact,
      },
      { new: true }
    );

    if (!updatedJob) {
      return res.json({
        success: false,
        message: "Job opening not found",
      });
    }

    res.json({
      success: true,
      message: "Job opening updated successfully",
      jobOpening: updatedJob,
    });
  } catch (error) {
    console.log("Error in editJobOpening:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to delete a job opening
const deleteJobOpening = async (req, res) => {
  try {
    // const { jobId } = req.params;

    const { jobId } = req.body;

    if (!jobId) {
      return res.json({
        success: false,
        message: "Job ID is required",
      });
    }

    const deletedJob = await jobOpeningModel.findByIdAndDelete(jobId);

    if (!deletedJob) {
      return res.json({
        success: false,
        message: "Job opening not found",
      });
    }

    res.json({
      success: true,
      message: "Job opening deleted successfully",
    });
  } catch (error) {
    console.log("Error in deleteJobOpening:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to update job opening status (open/close)
const updateJobStatus = async (req, res) => {
  try {
    // const { jobId } = req.params;
    const { jobId, isOpen } = req.body;

    if (!jobId) {
      return res.json({
        success: false,
        message: "Job ID is missing",
      });
    }

    var isOpened = isOpen;
    if (typeof isOpen !== "boolean") {
      if (isOpen === "true") isOpened = true;
      else if (isOpen === "false") isOpened = false;
      else {
        return res.json({
          success: false,
          message: "isOpen must be boolean or true/false.",
        });
      }
    }

    const updatedJob = await jobOpeningModel.findByIdAndUpdate(
      jobId,
      { isOpen: isOpened },
      { new: true }
    );

    if (!updatedJob) {
      return res.json({
        success: false,
        message: "Job opening not found",
      });
    }

    res.json({
      success: true,
      message: `Job opening ${isOpened ? "opened" : "closed"} successfully`,
      jobOpening: updatedJob,
    });
  } catch (error) {
    console.log("Error in updateJobStatus:", error);
    res.json({ success: false, message: error.message });
  }
};

// -------STAFF REQUIREMENTS-------------
// API to create a staff requirement
const createStaffRequirement = async (req, res) => {
  try {
    const {
      userId,
      title,
      category,
      description,
      location,
      salary,
      staffType,
      availabilityDate,
      requirements,
      contact,
    } = req.body;

    // Check for required fields
    if (!userId || !title || !description || !location || !contact) {
      return res.json({
        success: false,
        message: "Missing required staff fields",
      });
    }

    const parsedContact =
      typeof contact === "string" ? JSON.parse(contact) : contact;
    const parsedRequirements =
      typeof requirements === "string"
        ? JSON.parse(requirements)
        : requirements;

    //Validating mobile number
    if (
      !parsedContact.code ||
      !parsedContact.number ||
      !/^\d{10}$/.test(parsedContact.number)
    ) {
      return res.json({
        success: false,
        message: "Enter a valid mobile number",
      });
    }

    // validate email format
    if (!validator.isEmail(parsedContact.email)) {
      return res.json({ success: false, message: "Enter a valid email" });
    }

    const staffRequirement = await staffRequirementModel.create({
      userId,
      title,
      category,
      description,
      location,
      salary,
      staffType,
      availabilityDate,
      requirements: parsedRequirements,
      contact: parsedContact,
    });

    res.json({
      success: true,
      message: "Staff requirement created successfully",
      staffRequirement,
    });
  } catch (error) {
    console.log("Error in createStaffRequirement:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to get the staff Requirements generated by a User
const getStaffRequirementsByUser = async (req, res) => {
  try {
    const { userId } = req.body; // Assuming user is authenticated and ID is in `req.user`

    const staffRequirements = await staffRequirementModel.find({ userId });

    res.status(200).json({ success: true, staffRequirements });
  } catch (error) {
    console.error("Error fetching user's staff requirements:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// API to get all the staff Requirements open to people
const getAllStaffRequirementsWithUserNames = async (req, res) => {
  try {
    const staffRequirements = await staffRequirementModel.find().populate({
      path: "userId",
      select: "fullname", // Only fetch the fullname of the user
    });

    const formatted = staffRequirements.map((staff) => ({
      _id: staff._id,
      title: staff.title,
      category: staff.category,
      description: staff.description,
      location: staff.location,
      salary: staff.salary,
      staffType: staff.staffType,
      availabilityDate: staff.availabilityDate,
      requirements: staff.requirements,
      isOpen: staff.isOpen,
      contact: staff.contact,
      postedDate: staff.postedDate,
      userFullname: staff.userId?.fullname || "Unknown",
    }));

    res.status(200).json({ success: true, staffRequirements: formatted });
  } catch (error) {
    console.error("Error fetching all staff requirements:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// API to edit/update a staff requirement
const editStaffRequirement = async (req, res) => {
  try {
    const {
      staffId,
      title,
      category,
      description,
      location,
      salary,
      staffType,
      availabilityDate,
      requirements,
      contact,
    } = req.body;

    // Check for required fields
    if (!staffId || !title || !description || !location || !contact) {
      return res.json({
        success: false,
        message: "Missing required staff fields",
      });
    }

    const parsedContact =
      typeof contact === "string" ? JSON.parse(contact) : contact;
    const parsedRequirements =
      typeof requirements === "string"
        ? JSON.parse(requirements)
        : requirements;

    // Validating mobile number
    if (
      !parsedContact.code ||
      !parsedContact.number ||
      !/^\d{10}$/.test(parsedContact.number)
    ) {
      return res.json({
        success: false,
        message: "Enter a valid mobile number",
      });
    }

    // validate email format
    if (!validator.isEmail(parsedContact.email)) {
      return res.json({ success: false, message: "Enter a valid email" });
    }

    const updatedStaff = await staffRequirementModel.findByIdAndUpdate(
      staffId,
      {
        title,
        category,
        description,
        location,
        salary,
        staffType,
        availabilityDate,
        requirements: parsedRequirements,
        contact: parsedContact,
      },
      { new: true }
    );

    if (!updatedStaff) {
      return res.json({
        success: false,
        message: "Staff requirement not found",
      });
    }

    res.json({
      success: true,
      message: "Staff requirement updated successfully",
      staffRequirement: updatedStaff,
    });
  } catch (error) {
    console.log("Error in editStaffRequirement:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to delete a staff requirement
const deleteStaffRequirement = async (req, res) => {
  try {
    // const { staffId } = req.params;

    const { staffId } = req.body;

    if (!staffId) {
      return res.json({
        success: false,
        message: "Staff ID is required",
      });
    }

    const deletedStaff = await staffRequirementModel.findByIdAndDelete(staffId);

    if (!deletedStaff) {
      return res.json({
        success: false,
        message: "Staff requirement not found",
      });
    }

    res.json({
      success: true,
      message: "Staff requirement deleted successfully",
    });
  } catch (error) {
    console.log("Error in deleteStaffRequirement:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to update staff requirement status (open/close)
const updateStaffStatus = async (req, res) => {
  try {
    // const { staffId } = req.params;
    const { staffId, isOpen } = req.body;

    if (!staffId) {
      return res.json({
        success: false,
        message: "Staff ID is missing",
      });
    }

    var isOpened = isOpen;
    if (typeof isOpen !== "boolean") {
      if (isOpen === "true") isOpened = true;
      else if (isOpen === "false") isOpened = false;
      else {
        return res.json({
          success: false,
          message: "isOpen must be boolean or true/false.",
        });
      }
    }

    const updatedStaff = await staffRequirementModel.findByIdAndUpdate(
      staffId,
      { isOpen: isOpened },
      { new: true }
    );

    if (!updatedStaff) {
      return res.json({
        success: false,
        message: "Staff requirement not found",
      });
    }

    res.json({
      success: true,
      message: `Staff requirement ${
        isOpened ? "opened" : "closed"
      } successfully`,
      staffRequirement: updatedStaff,
    });
  } catch (error) {
    console.log("Error in updateStaffStatus:", error);
    res.json({ success: false, message: error.message });
  }
};

// --------------------------------------

// -----------ADVERTISEMENT SECTION------
// API to create a new advertisement
const addAdvertisement = async (req, res) => {
  try {
    const {
      userId,
      title,
      category,
      description,
      validFrom,
      validUntil,
      location,
      contact,
    } = req.body;

    console.log({
      userId,
      title,
      category,
      description,
      validFrom,
      validUntil,
      location,
      contact,
    });

    // Check for required fields
    if (
      !userId ||
      !title ||
      !description ||
      !validFrom ||
      !validUntil ||
      !contact
    ) {
      return res.json({
        success: false,
        message: "Missing required advertisement fields",
      });
    }

    const parsedContact =
      typeof contact === "string" ? JSON.parse(contact) : contact;

    // Validating mobile number
    if (
      !parsedContact.code ||
      !parsedContact.number ||
      !/^\d{10}$/.test(parsedContact.number)
    ) {
      return res.json({
        success: false,
        message: "Enter a valid mobile number",
      });
    }

    // validate email format
    if (!validator.isEmail(parsedContact.email)) {
      return res.json({ success: false, message: "Enter a valid email" });
    }

    // Validate dates
    const fromDate = new Date(validFrom);
    const untilDate = new Date(validUntil);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (fromDate >= untilDate) {
      return res.json({
        success: false,
        message: "Valid Until date must be after Valid From date",
      });
    }

    if (fromDate < today) {
      return res.json({
        success: false,
        message: "Valid From date cannot be in the past",
      });
    }

    const advertisement = await advertisementModel.create({
      userId,
      title,
      category,
      description,
      validFrom: fromDate,
      validUntil: untilDate,
      location,
      contact: parsedContact,
    });

    res.json({
      success: true,
      message: "Advertisement created successfully",
      advertisement,
    });
  } catch (error) {
    console.log("Error in addAdvertisement:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to get advertisements created by a specific user
const getMyAdvertisements = async (req, res) => {
  try {
    const { userId } = req.body; // Assuming user is authenticated and ID is in `req.user`

    const advertisements = await advertisementModel
      .find({ userId })
      .sort({ postedDate: -1 });

    res.status(200).json({ success: true, advertisements });
  } catch (error) {
    console.error("Error fetching user's advertisements:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// API to get all active advertisements with user names
const getAllAdvertisementsWithUserNames = async (req, res) => {
  try {
    const currentDate = new Date();

    const advertisements = await advertisementModel
      .find({
        isActive: true,
        validFrom: { $lte: currentDate },
        validUntil: { $gte: currentDate },
      })
      .populate({
        path: "userId",
        select: "fullname", // Only fetch the fullname of the user
      })
      .sort({ postedDate: -1 });

    const formatted = advertisements.map((ad) => ({
      _id: ad._id,
      title: ad.title,
      category: ad.category,
      description: ad.description,
      validFrom: ad.validFrom,
      validUntil: ad.validUntil,
      location: ad.location,
      contact: ad.contact,
      postedDate: ad.postedDate,
      isActive: ad.isActive,
      userFullname: ad.userId?.fullname || "Unknown",
    }));

    res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    console.error("Error fetching all advertisements:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// NEW: API for Forgot Username
const forgotUsername = async (req, res) => {
  try {
    const {
      fullname: rawFullname,
      khandanid,
      fatherName: rawFatherName,
      dob,
      recaptchaToken,
    } = req.body;

    // Added reCAPTCHA verification
    if (!recaptchaToken) {
      return res.json({
        success: false,
        message: "reCAPTCHA token is missing.",
      });
    }
    const isHuman = await verifyRecaptcha(recaptchaToken);
    if (!isHuman) {
      return res.json({
        success: false,
        message: "reCAPTCHA verification failed.",
      });
    }

    const fullname = rawFullname?.trim();
    const fatherName = rawFatherName?.trim();

    if (!fullname || !khandanid || !fatherName || !dob) {
      return res.json({
        success: false,
        message: "All fields (Full Name, Khandan, Father, DOB) are required.",
      });
    }

    const user = await userModel.findOne({
      fullname,
      khandanid,
      fatherName,
      dob: new Date(dob),
    });

    if (!user) {
      return res.json({
        success: false,
        message:
          "No user found with the provided details. Please check the information and try again.",
      });
    }

    const email = user.contact.email;
    if (!email) {
      return res.json({
        success: false,
        message:
          "User found, but no email is registered. Please contact support.",
      });
    }

    const subject = "Your Username Recovery for SDPJSS";
    const htmlBody = `
      <p>Dear ${user.fullname},</p>
      <p>As requested, we have retrieved your username for your SDPJSS account.</p>
      <p>Your username is: <strong>${user.username}</strong></p>
      <p>You can now use this username to log in or reset your password.</p>
      <p>Best regards,<br>SDPJSS</p>
    `;

    const emailSent = await sendEmail(email, subject, htmlBody);

    if (emailSent) {
      res.json({
        success: true,
        message: `Your username has been sent to your registered email: ${email}`,
      });
    } else {
      res.json({
        success: false,
        message: "Failed to send email. Please try again later.",
      });
    }
  } catch (error) {
    console.error("Error in forgotUsername:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// NEW: Send OTP for Login
const sendLoginOtp = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.json({ success: false, message: "Username is required." });
    }

    const user = await userModel.findOne({ username });
    if (!user) {
      return res.json({ success: false, message: "User not found." });
    }

    const email = user.contact.email;
    if (!email) {
      return res.json({
        success: false,
        message: "No email registered for this account. Cannot login with OTP.",
      });
    } // Generate and save OTP

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min validity
    await user.save(); // Send OTP (reusing the forgot password OTP email function)

    // await sendOtpEmail(email, otp, user.fullname);
    const subject = "Your Login OTP for SDPJSS";
    const htmlBody = `
      <p>Dear ${user.fullname},</p>
      <p>Your One-Time Password (OTP) to log in is:</p>
      <h2><b>${otp}</b></h2>
      <p>This OTP is valid for 10 minutes.</p>
      <p>Best regards,<br>SDPJSS</p>
    `;

    await sendEmail(user.contact.email, subject, htmlBody);
    res.json({ success: true, message: "OTP sent to your registered email." });
  } catch (error) {
    console.error("Error sending login OTP:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// NEW: Login with OTP
const loginWithOtp = async (req, res) => {
  try {
    const { username: rawUsername, otp } = req.body;
    const username = rawUsername?.trim(); // --- TRIMMED ---

    if (!username || !otp) {
      return res.json({
        success: false,
        message: "Username and OTP are required.",
      });
    }

    const user = await userModel.findOne({ username });
    if (!user) {
      return res.json({ success: false, message: "User not found." });
    } // Verify OTP

    if (user.otp !== otp || user.otpExpires < new Date()) {
      return res.json({ success: false, message: "Invalid or expired OTP." });
    } // OTP is valid, clear it

    user.otp = null;
    user.otpExpires = null;
    await user.save(); // Generate token and log in

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ success: true, utoken: token });
  } catch (error) {
    console.error("Error logging in with OTP:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// API to edit/update an advertisement
const editAdvertisement = async (req, res) => {
  try {
    const {
      adId,
      title,
      category,
      description,
      validFrom,
      validUntil,
      location,
      contact,
    } = req.body;

    // Check for required fields
    if (
      !adId ||
      !title ||
      !description ||
      !validFrom ||
      !validUntil ||
      !contact
    ) {
      return res.json({
        success: false,
        message: "Missing required advertisement fields",
      });
    }

    const parsedContact =
      typeof contact === "string" ? JSON.parse(contact) : contact;

    // Validating mobile number
    if (
      !parsedContact.code ||
      !parsedContact.number ||
      !/^\d{10}$/.test(parsedContact.number)
    ) {
      return res.json({
        success: false,
        message: "Enter a valid mobile number",
      });
    }

    // validate email format
    if (!validator.isEmail(parsedContact.email)) {
      return res.json({ success: false, message: "Enter a valid email" });
    }

    // Validate dates
    const fromDate = new Date(validFrom);
    const untilDate = new Date(validUntil);

    if (fromDate >= untilDate) {
      return res.json({
        success: false,
        message: "Valid Until date must be after Valid From date",
      });
    }

    const updatedAdvertisement = await advertisementModel.findByIdAndUpdate(
      adId,
      {
        title,
        category,
        description,
        validFrom: fromDate,
        validUntil: untilDate,
        location,
        contact: parsedContact,
      },
      { new: true }
    );

    if (!updatedAdvertisement) {
      return res.json({
        success: false,
        message: "Advertisement not found",
      });
    }

    res.json({
      success: true,
      message: "Advertisement updated successfully",
      advertisement: updatedAdvertisement,
    });
  } catch (error) {
    console.log("Error in editAdvertisement:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to delete an advertisement
const deleteAdvertisement = async (req, res) => {
  try {
    const { adId } = req.body;

    if (!adId) {
      return res.json({
        success: false,
        message: "Advertisement ID is required",
      });
    }

    const deletedAdvertisement = await advertisementModel.findByIdAndDelete(
      adId
    );

    if (!deletedAdvertisement) {
      return res.json({
        success: false,
        message: "Advertisement not found",
      });
    }

    res.json({
      success: true,
      message: "Advertisement deleted successfully",
    });
  } catch (error) {
    console.log("Error in deleteAdvertisement:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to update advertisement status (active/inactive)
const updateAdvertisementStatus = async (req, res) => {
  try {
    const { adId, isActive } = req.body;

    if (!adId) {
      return res.json({
        success: false,
        message: "Advertisement ID is missing",
      });
    }

    var isActivated = isActive;
    if (typeof isActive !== "boolean") {
      if (isActive === "true") isActivated = true;
      else if (isActive === "false") isActivated = false;
      else {
        return res.json({
          success: false,
          message: "isActive must be boolean or true/false.",
        });
      }
    }

    const updatedAdvertisement = await advertisementModel.findByIdAndUpdate(
      adId,
      { isActive: isActivated },
      { new: true }
    );

    if (!updatedAdvertisement) {
      return res.json({
        success: false,
        message: "Advertisement not found",
      });
    }

    res.json({
      success: true,
      message: `Advertisement ${
        isActivated ? "activated" : "deactivated"
      } successfully`,
      advertisement: updatedAdvertisement,
    });
  } catch (error) {
    console.log("Error in updateAdvertisementStatus:", error);
    res.json({ success: false, message: error.message });
  }
};

// --------------------------------------

// 1. Updated generateBillHTML function with fixed watermark and right-aligned values
const _generateBillHTML = (donationData, userData, adminName) => {
  const {
    list,
    amount,
    method,
    courierCharge = 0,
    transactionId,
    createdAt,
    _id,
    receiptId,
  } = donationData;

  const finalTotalAmount = amount + courierCharge;

  // Convert total amount to words (assuming this function exists)
  const amountInWords = numberToWords
    ? numberToWords(finalTotalAmount)
    : `${finalTotalAmount} Rupees`;

  // Helper function to format numbers in Indian style
  const formatIndianNumber = (num) => {
    return num.toLocaleString("en-IN");
  };

  // Calculate totals for summary slip
  const totalWeight = list.reduce((sum, item) => sum + item.quantity, 0);
  const totalPackets = list.filter((item) => item.isPacket).length;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Donation Receipt</title>
      <style>
        @media print { 
          body { -webkit-print-color-adjust: exact; } 
          .bill-container { box-shadow: none !important; border: none !important; } 
        }

        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          margin: 20px; 
          padding: 0; 
          color: #333;
          background-color: white;
        }
        
        /* Main watermark */
        .main-watermark {
          position: absolute;
          top: 35%;
          left: 50%;
          width: 60%;
          height: 60%;
          background-image: url('https://res.cloudinary.com/needlesscat/image/upload/v1754307740/logo_unr2rc.jpg');
          background-repeat: no-repeat;
          background-position: center center;
          background-size: contain;
          transform: translate(-50%, -50%);
          opacity: 0.08;
          z-index: 10;
          pointer-events: none;
        }
          
        .bill-container { 
          max-width: 800px; 
          margin: auto; 
          border: 1px solid #ccc; 
          padding: 10px 20px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
          background-color: white;
          position: relative;
          z-index: 2;
        }
        
        .header {
          text-align: center;
          border-bottom: 2px solid #d32f2f;
          padding-bottom: 10px;
          margin-bottom: 10px;
        }
        
        .header-top {
          font-size: 12px;
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
        }
        
        .org-name {
          font-size: 24px;
          font-weight: bold;
          color: #d32f2f;
          margin-bottom: 1px;
        }
        
        .org-address {
          margin-bottom: 1px;
          font-size: 14px;
        }
        
        .org-contact {
          font-size: 12px;
          color: #444;
        }
        
        .receipt-title {
          font-size: 16px;
          font-weight: 600;
          text-align: center;
          margin: 5px 0;
          letter-spacing: 1px;
        }
        
        .receipt-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 12px;
        }
        
        .donor-section {
          background-color: #f9f9f9;
          padding: 8px;
          border: 1px dashed #ddd;
          border-radius: 8px;
          margin-bottom: 8px;
        }
        
        .donor-title {
          margin-top: 0;
          color: #d32f2f;
          border-bottom: 1px solid #eee;
          padding-bottom: 3px;
          font-size: 14px;
          margin-bottom: 6px;
        }
        
        .donor-content {
          display: flex;
          justify-content: space-between;
        }
        
        .donor-left {
          flex: 1;
          padding-right: 10px;
        }
        
        .donor-right {
          flex: 1;
          padding-left: 10px;
        }
        
        .donor-info {
          font-size: 12px;
          margin: 3px 0;
        }
        
        .donation-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 10px;
        }
        
        .table-header {
          padding: 8px;
          text-align: left;
          border-bottom: 1px solid #eee;
          background-color: #f2f2f2;
          font-weight: 600;
          font-size: 12px;
        }
        
        .table-header-right {
          padding: 8px;
          text-align: right;
          border-bottom: 1px solid #eee;
          background-color: #f2f2f2;
          font-weight: 600;
          font-size: 12px;
        }
        
        .table-cell {
          padding: 8px;
          text-align: left;
          border-bottom: 1px solid #eee;
          font-size: 12px;
        }
        
        .table-cell-right {
          padding: 8px;
          text-align: right;
          border-bottom: 1px solid #eee;
          font-size: 12px;
        }
        
        .courier-row .table-cell,
        .courier-row .table-cell-right {
          border-top: 2px solid #ddd;
          font-weight: bold;
        }
        
        .total-row {
          font-weight: bold;
          font-size: 12px;
          background-color: #f2f2f2;
        }
        
        .total-row .table-cell,
        .total-row .table-cell-right {
          padding: 10px 8px;
          border-top: 2px solid #ddd;
        }
        
        .amount-words {
          padding: 6px;
          background-color: #f9f9f9;
          border-left: 4px solid #d32f2f;
          margin-top: 8px;
          font-weight: bold;
          font-size: 12px;
        }
        
        .payment-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #f9f9f9;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 8px;
          margin-top: 8px;
          font-size: 12px;
        }
        
        .payment-details p {
          margin: 0 0 3px 0;
        }
        
        .payment-status {
          background-color: #077e13ff;
          color: white;
          padding: 6px 12px;
          border-radius: 4px;
          font-weight: bold;
          border: 1px solid #044202ff;
          font-size: 14px;
        }
        
        .footer {
          text-align: center;
          margin-top: 15px;
          padding-top: 8px;
          border-top: 1px solid #ccc;
          font-size: 10px;
          color: #777;
          font-style: italic;
        }
        
        .footer p {
          margin: 2px 0;
        }
        
        /* Summary Slip Styles */
        .summary-section {
          margin-top: 8px;
          position: relative;
          border-top: 2px dashed #333;
        }
        
        .scissors-icon {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background-color: white;
          padding: 0 5px;
          font-size: 18px;
        }
        
        .summary-watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 40%;
          height: 60%;
          transform: translate(-50%, -40%);
          background-image: url('https://res.cloudinary.com/needlesscat/image/upload/v1754307740/logo_unr2rc.jpg');
          background-repeat: no-repeat;
          background-position: center center;
          background-size: contain;
          opacity: 0.06;
          z-index: 10;
          pointer-events: none;
        }
        
        .summary-slip {
          max-width: 800px;
          margin: auto;
          margin-top: 8px;
          border: 2px solid #d32f2f;
          border-radius: 8px;
          padding: 10px 20px;
          background-color: #fefefe;
          box-shadow: 0 0 8px rgba(0,0,0,0.1);
          position: relative;
          z-index: 2;
        }
        
        .summary-header {
          text-align: center;
          margin-bottom: 10px;
          border-bottom: 1px solid #e0e0e0;
          padding-bottom: 6px;
        }
        
        .summary-title {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          color: #d32f2f;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        
        .summary-subtitle {
          font-size: 12px;
          color: #666;
          margin-top: 2px;
          font-style: italic;
        }
        
        .summary-content {
          display: flex;
          gap: 20px;
          align-items: flex-start;
        }
        
        .summary-left {
          flex: 1;
          background-color: #f8f9ff;
          padding: 8px;
          border-radius: 6px;
          border: 1px solid #e8e8ff;
        }
        
        .summary-left-title {
          font-size: 12px;
          font-weight: 600;
          color: #4a4a9a;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .summary-table {
          width: 100%;
          font-size: 12px;
          border-collapse: collapse;
        }
        
        .summary-table td {
          padding: 2px 0;
          vertical-align: top;
        }
        
        .summary-label {
          font-weight: 600;
          color: #555;
          width: 70px;
        }
        
        .summary-value {
          padding-left: 8px;
          color: #333;
        }
        
        .receipt-no-value {
          font-weight: 700;
          color: #d32f2f;
        }
        
        .summary-right {
          flex: 0 0 180px;
          background-color: #f0f8f0;
          padding: 5px;
          border-radius: 6px;
          border: 2px solid #d4edda;
        }
        
        .summary-right-title {
          font-size: 12px;
          font-weight: 600;
          color: #155724;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          text-align: center;
        }
        
        .summary-totals {
          margin-bottom: 3px;
        }
        
        .summary-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0px 8px 4px 8px;
          background-color: white;
          border-radius: 4px;
          margin-bottom: 2px;
          border: 1px solid #e8f5e8;
        }
        
        .summary-item-label {
          font-size: 12px;
          font-weight: 600;
          color: #555;
        }
        
        .summary-item-value {
          font-size: 12px;
          font-weight: 700;
          color: #155724;
          background-color: #d4edda;
          margin-top: 4px;
          padding: 0px 8px 4px 8px;
          border-radius: 3px;
        }
        
        .total-amount-container {
          background-color: #d32f2f;
          color: white;
          padding: 2px 8px;
          border-radius: 6px;
          text-align: center;
          border: 2px solid #b71c1c;
          box-shadow: 0 2px 4px rgba(211,47,47,0.3);
        }
        
        .total-amount-label {
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 2px;
          opacity: 0.9;
        }
        
        .total-amount-value {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        
        .summary-footer {
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid #e0e0e0;
          text-align: center;
          font-size: 8px;
          color: #888;
          font-style: italic;
        }
      </style>
    </head>
    <body>
      <div class="main-watermark"></div>
      
      <div class="bill-container">
        <!-- Header Section -->
        <div class="header">
          <div class="header-top">
            <span><b>Estd. 1939</b></span>
            <span><b>Reg. No. 2020/272</b></span>
          </div>
          <div class="org-name">SHREE DURGAJI PATWAY JATI SUDHAR SAMITI</div>
          <div class="org-address">Shree Durga Sthan, Patwatoli, Manpur, P.O. Buniyadganj, Gaya Ji - 823003</div>
          <div class="org-contact">
            <strong>PAN:</strong> ABBTS1301C | <strong>Contact:</strong> 0631 2952160, +91 9472030916 | <strong>Email:</strong> sdpjssmanpur@gmail.com
          </div>
        </div>

        <!-- Receipt Title -->
        <div class="receipt-title">DONATION RECEIPT</div>

        <!-- Receipt Info -->
        <div class="receipt-info">
          <div><strong>Receipt No:</strong> ${
            receiptId || _id.toString().slice(-8).toUpperCase()
          }</div>
          <div><strong>Date:</strong> ${new Date(createdAt).toLocaleDateString(
            "en-IN",
            {
              year: "numeric",
              month: "long",
              day: "numeric",
            }
          )}</div>
        </div>

        <!-- Donor Section -->
        <div class="donor-section">
          <h3 class="donor-title">Donor Details</h3>
          <div class="donor-content">
            <div class="donor-left">
              <p class="donor-info"><strong>Name:</strong> ${
                userData.fullname
              } ${userData.gender === "female" ? "D/O" : "S/O"} ${userData.fatherName}</p>
              <p class="donor-info"><strong>Mobile:</strong> ${
                userData.contact.mobileno?.code || ""
              } ${userData.contact.mobileno?.number || ""}</p>
            </div>
            <div class="donor-right">
              <p class="donor-info"><strong>Address:</strong> ${
                userData.address.street
              }, ${userData.address.city}, ${userData.address.state} - ${
    userData.address.pin
  }</p>
            </div>
          </div>
        </div>

        <!-- Donation Table -->
        <table class="donation-table">
          <thead>
            <tr>
              <th class="table-header">Item</th>
              <th class="table-header-right">Quantity</th>
              <th class="table-header-right">Amount (₹)</th>
              <th class="table-header-right">Weight (g)</th>
              <th class="table-header-right">Packet</th>
            </tr>
          </thead>
          <tbody>
            ${list
              .map(
                (item) => `
            <tr>
              <td class="table-cell">${item.category}</td>
              <td class="table-cell-right">${formatIndianNumber(
                item.number
              )}</td>
              <td class="table-cell-right">₹${formatIndianNumber(
                item.amount
              )}</td>
              <td class="table-cell-right">${formatIndianNumber(
                item.quantity
              )}</td>
              <td class="table-cell-right">${item.isPacket ? "Yes" : "No"}</td>
            </tr>
            `
              )
              .join("")}
            
            ${`
            <tr class="courier-row">
              <td class="table-cell" colspan="2">Courier Charges</td>
              <td class="table-cell-right">  ₹${formatIndianNumber(
                courierCharge
              )} </td>
              <td class="table-cell" colspan="2"></td>
            </tr>
            `}
            
            <tr class="total-row">
              <td class="table-cell" colspan="2">TOTAL AMOUNT</td>
              <td class="table-cell-right">₹${formatIndianNumber(
                finalTotalAmount
              )}</td>
              <td class="table-cell" colspan="2"></td>
            </tr>
          </tbody>
        </table>

        <!-- Amount in Words -->
        <div class="amount-words">
          Amount in Words: ${amountInWords}
        </div>

        <!-- Payment Section -->
        <div class="payment-section">
          <div class="payment-details">
            <p><strong>Payment Method:</strong> ${method}</p>
            <p><strong>Transaction ID:</strong> ${transactionId || "N/A"}</p>
          </div>
          <div class="payment-status">PAID</div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <p>Thank you for your generous contribution. This is a computer-generated receipt.</p>
          <p>Generated by: <strong>${
            adminName || "System"
          }</strong> on ${new Date().toLocaleString("en-IN")}</p>
        </div>
      </div>

      <!-- Summary Slip (only if courierCharge is 0) -->
      ${
        courierCharge === 0
          ? `
      <div class="summary-section">
        <div class="scissors-icon">✂</div>
        <div class="summary-watermark"></div>
        
        <div class="summary-slip">
          <div class="summary-header">
            <h4 class="summary-title">Donation Summary Slip</h4>
            <div class="summary-subtitle">Keep this slip for your records</div>
          </div>
          
          <div class="summary-content">
            <div class="summary-left">
              <div class="summary-left-title">Donor Details</div>
              <table class="summary-table">
                <tbody>
                  <tr>
                    <td class="summary-label">Receipt No:</td>
                    <td class="summary-value receipt-no-value">${
                      receiptId || _id.toString().slice(-8).toUpperCase()
                    }</td>
                  </tr>
                  <tr>
                    <td class="summary-label">Name:</td>
                    <td class="summary-value">${userData.fullname}</td>
                  </tr>
                  <tr>
                    <td class="summary-label">Location:</td>
                    <td class="summary-value">${userData.address.city}, ${
              userData.address.state
            }</td>
                  </tr>
                  <tr>
                    <td class="summary-label">Mobile:</td>
                    <td class="summary-value">${
                      userData.contact.mobileno?.number || ""
                    }</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div class="summary-right">
              <div class="summary-right-title">Summary Totals</div>
              <div class="summary-totals">
                <div class="summary-item">
                  <span class="summary-item-label">Weights:</span>
                  <span class="summary-item-value">${formatIndianNumber(
                    totalWeight
                  )}</span>
                </div>
                <div class="summary-item">
                  <span class="summary-item-label">Packets:</span>
                  <span class="summary-item-value">${formatIndianNumber(
                    totalPackets
                  )}</span>
                </div>
              </div>
              <div class="total-amount-container">
                <div class="total-amount-label">
                  TOTAL AMOUNT: <span class="total-amount-value">₹${formatIndianNumber(
                    finalTotalAmount
                  )}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="summary-footer">
            Generated by ${
              adminName || "System"
            } on ${new Date().toLocaleDateString(
              "en-IN"
            )} • Thank you for your donation
          </div>
        </div>
      </div>
      `
          : ""
      }
    </body>
    </html>
  `;
};

// const sendDonationReceiptEmail = async (email, donationData, userData) => {
//   try {
//     // Generate HTML bill
//     const billHTML = generateBillHTML(donationData, userData);

//     // Generate PDF using Puppeteer
//     const options = {
//       format: "A4",
//       printBackground: true,
//       margin: {
//         top: "20px",
//         right: "20px",
//         bottom: "20px",
//         left: "20px",
//       },
//     }; // Define the file object with the HTML content
//     const file = { content: billHTML }; // Generate PDF buffer using html-pdf-node

//     const pdfBuffer = await html_to_pdf.generatePdf(file, options);

//     // Configure nodemailer transporter
//     const transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASSWORD,
//       },
//     });

//     const receiptNumber =
//       donationData.receiptId ||
//       donationData._id.toString().slice(-8).toUpperCase();
//     const paymentStatus =
//       donationData.method === "Online" ? "PAID" : "TO BE PAID IN OFFICE";

//     const mailOptions = {
//       from: process.env.EMAIL_USER,
//       to: email,
//       subject: `Donation Receipt - SDPJSS - ${receiptNumber}`,
//       html: `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//           <h2 style="color: #d32f2f;">Thank you for your donation!</h2>
//           <p>Dear ${userData.fullname},</p>
//           <p>We have received your donation. Please find your receipt below attached as PDF.</p>

//           <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
//             <h3>Quick Summary:</h3>
//             <p><strong>Receipt Number:</strong> ${receiptNumber}</p>
//             <p><strong>Total Amount:</strong> ₹${
//               donationData.amount + donationData.courierCharge
//             }</p>
//             <p><strong>Payment Method:</strong> ${donationData.method}</p>
//             <p><strong>Status:</strong> <span style="color: ${
//               donationData.method === "Online" ? "#28a745" : "#ffc107"
//             }; font-weight: bold;">${paymentStatus}</span></p>
//           </div>

//           <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; text-align: center;">
//             <p>Best regards,<br>
//             <strong>SDPJSS</strong><br>
//             Shree Durga Ji Patway Jati Sudhar Samiti<br>
//             Durga Asthan, Manpur, Gaya, Bihar, India - 823003</p>
//           </div>
//         </div>
//       `,
//       attachments: [
//         {
//           filename: `SDPJSS_Receipt_${receiptNumber}.pdf`,
//           content: pdfBuffer,
//           contentType: "application/pdf",
//         },
//       ],
//     };

//     await transporter.sendMail(mailOptions);

//     return true;
//   } catch (error) {
//     console.error("Receipt email sending failed:", error);
//     return false;
//   }
// };

/**
 * Generates a unique receipt ID based on the donation method and year.
 * Format: SD[Method_Code][YY][IncrementingNumber]
 * Method Codes: C for Cash, O for Online
 * Example: SDC250000001
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

const generateReceiptId = async (method, modelName = "donation") => {
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
  let prefix = `SDP/${methodCode}`;

  if (modelName === "donation") {
    Model = donationModel;
  } else if (modelName === "guestdonation") {
    Model = guestDonationModel;
  } else {
    throw new Error("Invalid model name provided for receipt ID generation.");
  }

  try {
    // 4. Find the last donation with the same prefix and financial year
    const regex = new RegExp(`^SDP\\/${methodCode}[0-9]+\\/${financialYear}$`);
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
      const lastNumberString = parts[1].substring(methodCode.length);
      const lastNumber = parseInt(lastNumberString, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    // 6. Format the new receipt ID with 5-digit padding and financial year
    const paddedNumber = nextNumber.toString().padStart(5, "0");
    const newReceiptId = `${prefix}${paddedNumber}/${financialYear}`;

    return newReceiptId;
  } catch (error) {
    console.error("Error generating receipt ID:", error);
    throw new Error("Failed to generate unique receipt ID.", { cause: error });
  }
};

// API to create a donation order (initiate payment)
// controllers/donationController.js
// const calculateRazorpayCharges = (amount) => {
//   const platformFeeRate = 0.02;
//   const totalCharges = amount * platformFeeRate;
//   return parseFloat(totalCharges.toFixed(2));
// };

// --- UPDATED FUNCTION ---
const createDonationOrder = async (req, res) => {
  try {
    const {
      userId,
      list,
      amount,
      method,
      courierCharge,
      remarks,
      postalAddress,
      donatedFor, // This ID is now provided by the frontend (can be user's or child's)
      donatedAs,
      relationName,
    } = req.body;

    // --- All validation remains the same ---
    if (
      !userId ||
      !list ||
      !amount ||
      !method ||
      courierCharge === undefined ||
      !postalAddress ||
      !donatedAs ||
      !donatedFor
    ) {
      return res.json({
        success: false,
        message: "Missing required donation fields",
      });
    }
    if (amount <= 0) {
      return res.json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }
    if (!["Cash", "Online"].includes(method)) {
      return res.json({ success: false, message: "Invalid payment method" });
    }

    // --- The child creation/update logic has been REMOVED from here ---

    if (method === "Cash") {
      const receiptId = await generateReceiptId(method);
      const donation = await donationModel.create({
        userId,
        list,
        amount,
        method,
        courierCharge,
        remarks,
        transactionId: `CASH_${Date.now()}`,
        paymentStatus: "completed",
        postalAddress,
        receiptId,
        donatedAs,
        donatedFor, // Directly use the ID provided by the frontend
        relationName: relationName || "",
      });

      return res.json({
        success: true,
        message: "Cash donation recorded",
        donation,
        paymentRequired: false,
      });
    }

    // const platformCharges = calculateRazorpayCharges(amount);
    // const finalAmountToCharge = amount + platformCharges;

    // For online payments
    const options = {
      amount: Math.round(amount * 100),
      currency: process.env.CURRENCY || "INR",
      receipt: `receipt_${Date.now()}`,
      notes: { userId, postalAddress },
    };
    const razorpayOrder = await razorpayInstance.orders.create(options);

    const tempDonation = await donationModel.create({
      userId,
      list,
      amount,
      method,
      courierCharge,
      remarks,
      razorpayOrderId: razorpayOrder.id,
      paymentStatus: "pending",
      postalAddress,
      donatedAs,
      donatedFor, // Directly use the ID provided by the frontend
      relationName: relationName || "",
    });

    res.json({
      success: true,
      message: "Donation order created successfully",
      order: razorpayOrder,
      donationId: tempDonation._id,
      paymentRequired: true,
    });
  } catch (error) {
    console.log("Error in createDonationOrder:", error);
    res.json({
      success: false,
      message: "Failed to create order. See server logs.",
    });
  }
};

// --- NO CHANGES NEEDED BELOW ---
// API to verify Razorpay payment and update donation
const verifyDonationPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      donationId, // Your internal donation ID
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !donationId
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing payment verification data" });
    }

    // Verify payment signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      // If signature is invalid, mark payment as failed
      await donationModel.findByIdAndUpdate(donationId, {
        paymentStatus: "failed",
      });
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment signature." });
    }

    // If signature is valid, generate receipt ID for online payment
    const donationToUpdate = await donationModel.findById(donationId);
    if (!donationToUpdate) {
      return res
        .status(404)
        .json({ success: false, message: "Donation record not found" });
    }

    const receiptId = await generateReceiptId("Online"); // Generate receipt ID for online payment

    // Update the donation record
    const updatedDonation = await donationModel
      .findByIdAndUpdate(
        donationId,
        {
          transactionId: razorpay_payment_id,
          paymentStatus: "completed",
          $unset: { razorpayOrderId: 1 }, // Remove temporary order ID
          receiptId, // Add the generated receiptId
        },
        { new: true }
      )
      .populate("userId", "fullname contact");

    if (!updatedDonation) {
      return res.status(404).json({
        success: false,
        message: "Donation record not found after update",
      });
    }

    res.json({
      success: true,
      message: "Payment verified successfully!",
      donation: updatedDonation,
    });

  } catch (error) {
    console.log("Error in verifyDonationPayment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during payment verification.",
    });
  }
};

// API to get donations by user
const getUserDonations = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.json({
        success: false,
        message: "User ID is required",
      });
    }

    const donations = await donationModel
      .find({ userId })
      .sort({ createdAt: -1 }); // Most recent first

    const updatedDonationsWithPrasad = updateOnlineDonationsWithPrasad(donations);

    res.json({
      success: true,
      donations: updatedDonationsWithPrasad,
    });
  } catch (error) {
    console.log("Error in getUserDonations:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to get all donations (admin function)
const getAllDonations = async (req, res) => {
  try {
    const donations = await donationModel
      .find()
      .populate("userId", "fullname email contact")
      .sort({ createdAt: -1 });

    // Calculate total donations (only completed ones)
    const completedDonations = donations.filter(
      (d) => d.paymentStatus === "completed"
    );
    const totalAmount = completedDonations.reduce(
      (sum, donation) => sum + donation.amount,
      0
    );

    res.json({
      success: true,
      donations,
      totalAmount,
      totalCount: donations.length,
      completedCount: completedDonations.length,
    });
  } catch (error) {
    console.log("Error in getAllDonations:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to get donation statistics
const getDonationStats = async (req, res) => {
  try {
    // Total donations (only completed)
    const totalDonations = await donationModel.countDocuments({
      paymentStatus: "completed",
    });
    const totalAmount = await donationModel.aggregate([
      { $match: { paymentStatus: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Donations by purpose (only completed)
    const donationsByPurpose = await donationModel.aggregate([
      { $match: { paymentStatus: "completed" } },
      {
        $group: {
          _id: "$purpose",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    // Donations by method (only completed)
    const donationsByMethod = await donationModel.aggregate([
      { $match: { paymentStatus: "completed" } },
      {
        $group: {
          _id: "$method",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    // Donations by status
    const donationsByStatus = await donationModel.aggregate([
      {
        $group: {
          _id: "$paymentStatus",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Recent donations (last 30 days, only completed)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentDonations = await donationModel.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          paymentStatus: "completed",
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    res.json({
      success: true,
      stats: {
        totalDonations,
        totalAmount: totalAmount[0]?.total || 0,
        donationsByPurpose,
        donationsByMethod,
        donationsByStatus,
        recentDonations: recentDonations[0] || { count: 0, totalAmount: 0 },
      },
    });
  } catch (error) {
    console.log("Error in getDonationStats:", error);
    res.json({ success: false, message: error.message });
  }
};

// MODIFIED: forgotPassword to use username
const forgotPassword = async (req, res) => {
  try {
    const { username: rawUsername } = req.body;
    const username = rawUsername?.trim(); // --- TRIMMED ---

    if (!username) {
      return res.json({
        success: false,
        message: "Please enter your username.",
      });
    }

    const user = await userModel.findOne({ username });

    if (!user) {
      return res.json({
        success: false,
        message: "User with this username does not exist.",
      });
    }
    const email = user.contact.email;
    if (!email) {
      return res.json({
        success: false,
        message:
          "No email is registered for this account. Cannot reset password.",
      });
    }
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // OTP valid for 10 minutes

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Send OTP to user's email
    // const emailSent = await sendOtpEmail(email, otp, user.fullname);
    const subject = "Password Reset OTP for Your Account";
    const htmlBody = `
      <p>Dear ${user.fullname},</p>
      <p>You have requested to reset your password. Your One-Time Password (OTP) is:</p>
      <h2><b>${otp}</b></h2>
      <p>This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
      <p>Best regards,<br>SDPJSS</p>
    `;

    const emailSent = await sendEmail(user.contact.email, subject, htmlBody);
    if (emailSent) {
      res.json({
        success: true,
        message: "OTP sent to your registered email. Please check your inbox.",
      });
    } else {
      res.json({
        success: false,
        message: "Failed to send OTP. Please try again later.",
      });
    }
  } catch (error) {
    console.error("Error in forgotPassword:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// MODIFIED: verifyOtp to use username
const verifyOtp = async (req, res) => {
  try {
    const { username: rawUsername, otp } = req.body;
    const username = rawUsername?.trim(); // --- TRIMMED ---

    if (!username || !otp) {
      return res.json({
        success: false,
        message: "Username and OTP are required.",
      });
    }

    const user = await userModel.findOne({ username });

    if (!user) {
      return res.json({ success: false, message: "User not found." });
    }

    if (user.otp !== otp || user.otpExpires < new Date()) {
      return res.json({
        success: false,
        message: "OTP has expired or is invalid. Please request a new one.",
      });
    }

    // Clear OTP fields after successful verification
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({
      success: true,
      message: "OTP verified successfully. You can now reset your password.",
    });
  } catch (error) {
    console.error("Error in verifyOtp:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// MODIFIED: resetPassword to use username
const resetPassword = async (req, res) => {
  try {
    const { username: rawUsername, newPassword } = req.body;
    const username = rawUsername?.trim(); // --- TRIMMED ---

    if (!username || !newPassword) {
      return res.json({
        success: false,
        message: "Username and new password are required.",
      });
    }

    if (newPassword.length < 8) {
      return res.json({
        success: false,
        message: "New password must be at least 8 characters long.",
      });
    }

    const user = await userModel.findOne({ username });

    if (!user) {
      return res.json({ success: false, message: "User not found." });
    }

    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    user.password = hashedNewPassword;
    await user.save();

    const email = user.contact.email;
    if (email) {
      const subject = "Your Password Has Been Reset";
      const htmlBody = `
        <p>Dear ${user.fullname},</p>
        <p>This email confirms that the password for your SDPJSS account has been successfully changed.</p>
        <p>Your username is: <strong>${user.username}</strong></p>
        <p>If you did not make this change, please contact our support team immediately.</p>
        <p>Best regards,<br>SDPJSS</p>
      `;

      await sendEmail(email, subject, htmlBody);
    }
    res.json({
      success: true,
      message: "Password has been reset successfully.",
    });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// Function to send password reset confirmation email
const _sendPasswordResetConfirmationEmail = async (
  email,
  fullname,
  username
) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Account is Ready!",
      html: `
        <p>Dear ${fullname},</p>
        <p>This is to confirm that your password has been successfully set. Your account is now active.</p>

                <p>You can now log in using the following username:</p>
        <p><strong>Username: ${username}</strong></p>

        <p>If you did not make this change, please contact us immediately.</p>
        <p>Best regards,</p>
        <p>SDPJSS</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Password reset confirmation email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Password reset confirmation email sending failed:", error);
    return false;
  }
};

// List features specifically for the user portal
const listUserFeatures = async (req, res) => {
  try {
    // Find features that are specifically for 'user' access and are 'active'
    const features = await featureModel.find({
      access: "user",
      isActive: true,
    });
    res.json({ success: true, data: features });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error fetching features" });
  }
};

export const reconcileSingleDonation = async (req, res) => {
  const { donationId } = req.body;

  if (!donationId) {
    return res
      .status(400)
      .json({ success: false, message: "Donation ID is required." });
  }

  try {
    // 1. Find the donation in your database
    const donation = await donationModel.findById(donationId);

    if (!donation) {
      return res
        .status(404)
        .json({ success: false, message: "Donation not found." });
    }

    // 2. Ensure it's a pending online payment
    if (donation.paymentStatus !== "pending" || !donation.razorpayOrderId) {
      return res.status(400).json({
        success: false,
        message:
          "This donation is not a pending online payment and cannot be reconciled.",
      });
    }

    const orderId = donation.razorpayOrderId;

    // 3. Fetch payment details for the order from Razorpay
    const payments = await razorpayInstance.orders.fetchPayments(orderId);

    if (!payments || payments.items.length === 0) {
      // No payment was ever attempted for this order, mark it as failed
      donation.paymentStatus = "failed";
      await donation.save();
      return res.json({
        success: false,
        message: "No payment attempt found for this order. Marked as Failed.",
      });
    }

    // 4. Find a successful payment
    const capturedPayment = payments.items.find((p) => p.status === "captured");

    if (capturedPayment) {
      // 5. Payment was successful! Update your database.
      const receiptId = await generateReceiptId("Online");

      await donationModel.findByIdAndUpdate(donation._id, {
        paymentStatus: "completed",
        transactionId: capturedPayment.id,
        receiptId: receiptId,
        $unset: { razorpayOrderId: 1 }, // Clean up the temporary order ID
      });

      return res.json({
        success: true,
        message: `Successfully reconciled. Receipt: ${receiptId}`,
      });
    } else {
      // 6. No successful payment found, mark as failed
      donation.paymentStatus = "failed";
      await donation.save();
      return res.json({
        success: false,
        message: "Payment was not successful. Marked as Failed.",
      });
    }
  } catch (error) {
    console.error("Error during manual reconciliation:", error);
    // Handle cases where order might not exist on Razorpay anymore
    if (error.statusCode === 404) {
      await donationModel.findByIdAndUpdate(donationId, {
        paymentStatus: "failed",
      });
      return res
        .status(404)
        .json({
          success: false,
          message: "Order not found on Razorpay. Marked as Failed.",
        });
    }
    return res
      .status(500)
      .json({ success: false, message: "An internal server error occurred." });
  }
};

// Update the export statement to include the new functions
export {
  registerUser,
  verifyRegistrationOtp,
  setInitialPassword,
  resendRegistrationOtp,
  loginUser,
  getUserProfile,
  updateUserProfile,
  updateProfileImage,
  changePassword,
  createJobOpening,
  getJobOpeningsByUser,
  getAllJobOpeningsWithUserNames,
  editJobOpening,
  deleteJobOpening,
  updateJobStatus,
  createStaffRequirement,
  getStaffRequirementsByUser,
  getAllStaffRequirementsWithUserNames,
  editStaffRequirement,
  deleteStaffRequirement,
  updateStaffStatus,
  addAdvertisement,
  getMyAdvertisements,
  getAllAdvertisementsWithUserNames,
  editAdvertisement,
  deleteAdvertisement,
  updateAdvertisementStatus,
  // Make Donations
  createDonationOrder,
  verifyDonationPayment,
  getUserDonations,
  getAllDonations,
  getDonationStats,
  getUsersByKhandan,
  //Forget Password
  forgotPassword,
  verifyOtp,
  resetPassword,
  forgotUsername,
  sendLoginOtp,
  loginWithOtp,
  listUserFeatures,
};
