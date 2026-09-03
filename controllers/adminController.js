import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import khandanModel from "../models/KhandanModel.js";
import userModel from "../models/UserModel.js";
import jobOpeningModel from "../models/JobOpeningModel.js";
import staffRequirementModel from "../models/StaffRequirementModel.js";
import advertisementModel from "../models/AdvertisementModel.js";
import noticeModel from "../models/NoticeModel.js";
import donationModel from "../models/DonationModel.js";
import donationCategoryModel from "../models/DonationCategoryModel.js";
import courierChargeModel from "../models/CourierChargesModel.js";

import adminModel from "../models/AdminModel.js";
import featureModel from "../models/FeatureModel.js"; // Make sure to import your feature model
import guestDonationModel from "../models/GuestDonationModel.js";
import guestUserModel from "../models/GuestUserModel.js";
import updateOnlineDonationsWithPrasad from "./helpers/prasadCalculator.js";

const generateTokens = (admin) => {
  // Access token has a short lifespan (e.g., 15 minutes)
  const accessToken = jwt.sign(
    {
      id: admin._id,
      name: admin.name,
      role: admin.role,
      isApproved: admin.isApproved,
      allowedFeatures: admin.allowedFeatures,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" } // Short-lived
  );

  // Refresh token has a long lifespan (e.g., 7 days)
  const refreshToken = jwt.sign(
    { id: admin._id },
    process.env.REFRESH_SECRET, // Use a separate secret for refresh tokens
    { expiresIn: "10d" } // Long-lived
  );

  return { accessToken, refreshToken };
};

const getAdminStatus = async (req, res) => {
  try {
    if (req.adminRole === "superadmin") {
      return res.json({ success: true, isApproved: true });
    }

    const admin = await adminModel
      .findById(req.adminId)
      .select("isApproved");

    if (!admin) {
      return res
        .status(404)
        .json({ success: false, message: "Admin not found." });
    }

    return res.json({ success: true, isApproved: admin.isApproved });
  } catch (error) {
    console.error("Error fetching admin status:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// Login Admin
const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Check for Super Admin
    if (
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const tokenPayload = {
        id: "superadmin",
        role: "superadmin",
      };
      // Super admin token is long-lived and doesn't use a refresh token for simplicity
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });
      return res.json({ success: true, token, role: "superadmin" });
    }

    // 2. Check for regular admin in the database
    const admin = await adminModel.findOne({ email });

    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.json({ success: false, message: "Invalid Credentials" });
    }

    if (!admin.isApproved) {
      return res.json({
        success: false,
        message: "Your account is not approved.",
      });
    }

    // 3. Generate and save tokens
    const { accessToken, refreshToken } = generateTokens(admin);

    // Save the refresh token to the database
    await adminModel.findByIdAndUpdate(admin._id, {
      refreshToken: refreshToken,
    });

    // 4. Send both tokens to the client
    res.json({ success: true, accessToken, refreshToken, role: "admin" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Server Error" });
  }
};

const refreshToken = async (req, res) => {
  try {
    // The verifyRefreshToken middleware already attached the admin object to req.admin
    const admin = req.admin;

    // Generate a new access token
    const accessToken = jwt.sign(
      {
        id: admin._id,
        name: admin.name,
        role: admin.role,
        isApproved: admin.isApproved,
        allowedFeatures: admin.allowedFeatures,
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.json({ success: true, accessToken });
  } catch (error) {
    res.json({ success: false, message: "Could not refresh token" });
  }
};

// Add Admin (Super Admin only)
const addAdmin = async (req, res) => {
  const { name, email, password, allowedFeatures } = req.body;
  console.log(req.body);
  try {
    const exists = await adminModel.findOne({ email });
    if (exists) {
      return res.json({
        success: false,
        message: "Admin with this email already exists",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newAdmin = new adminModel({
      name,
      email,
      password: hashedPassword,
      allowedFeatures,
    });

    const admin = await newAdmin.save();
    res.json({
      success: true,
      message: "Admin added successfully",
      data: admin,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error adding admin" });
  }
};

// List all Admins (Super Admin only)
const listAdmins = async (req, res) => {
  try {
    // Fetch admins and populate the names of the allowed features
    const admins = await adminModel
      .find({})
      .select("-password")
      .populate("allowedFeatures", "featureName");
    res.json({ success: true, data: admins });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error fetching admins" });
  }
};
// Edit Admin (Super Admin only)
const editAdmin = async (req, res) => {
  const { id, name, email, password, allowedFeatures } = req.body;

  try {
    // Find the admin to edit
    const admin = await adminModel.findById(id);
    if (!admin) {
      return res.json({ success: false, message: "Admin not found" });
    }

    // Check if email is being changed and if it's already taken by another admin
    if (email !== admin.email) {
      const emailExists = await adminModel.findOne({ email, _id: { $ne: id } });
      if (emailExists) {
        return res.json({
          success: false,
          message: "Email already exists for another admin",
        });
      }
    }

    // Prepare update object
    const updateData = {
      name,
      email,
      allowedFeatures,
    };

    // Only update password if provided
    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      updateData.password = hashedPassword;
    }

    // Update the admin
    const updatedAdmin = await adminModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate("allowedFeatures", "featureName");

    res.json({
      success: true,
      message: "Admin updated successfully",
      data: updatedAdmin,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error updating admin" });
  }
};

// New API to block an admin
const blockAdmin = async (req, res) => {
  try {
    const { id } = req.body;

    // Find the admin to block
    const admin = await adminModel.findById(id);
    if (!admin) {
      return res.json({ success: false, message: "Admin not found" });
    }

    // Update the admin's status and remove features
    const updatedAdmin = await adminModel
      .findByIdAndUpdate(
        id,
        {
          isApproved: false,
          allowedFeatures: [], // Remove all permissions
        },
        { new: true }
      )
      .select("-password");

    res.json({
      success: true,
      message: "Admin blocked successfully. All permissions revoked.",
      data: updatedAdmin,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error blocking admin" });
  }
};

// Update the Remove Admin function
const removeAdmin = async (req, res) => {
  try {
    const { id } = req.body;

    const admin = await adminModel.findById(id);
    if (!admin) {
      return res.json({ success: false, message: "Admin not found" });
    }

    // Only allow deletion if the admin is already blocked
    if (admin.isApproved) {
      return res.json({
        success: false,
        message: "Active admins cannot be deleted. Please block them first.",
      });
    }

    await adminModel.findByIdAndDelete(id);
    res.json({ success: true, message: "Admin removed successfully" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error removing admin" });
  }
};

// API to get family list with count (using khandanModel)
const getFamilyList = async (req, res) => {
  try {
    const families = await khandanModel.find({});

    const count = families.length;

    res.json({
      success: true,
      families,
      count,
      message: `Retrieved ${count} families successfully`,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get user list with count
const getUserList = async (req, res) => {
  try {
    const users = await userModel
      .find({})
      .select("-password")
      .populate("khandanid", "name khandanid")
      .sort({ createdAt: -1 });

    const count = users.length;

    res.json({
      success: true,
      users,
      count,
      message: `Retrieved ${count} users successfully`,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get staff requirement list with count
const getStaffRequirementList = async (req, res) => {
  try {
    const staffRequirements = await staffRequirementModel
      .find({})
      .populate("userId", "fullname username")
      .sort({ postedDate: -1 });

    const count = staffRequirements.length;

    res.json({
      success: true,
      staffRequirements,
      count,
      message: `Retrieved ${count} staff requirements successfully`,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get job opening list with count
const getJobOpeningList = async (req, res) => {
  try {
    const jobOpenings = await jobOpeningModel
      .find({})
      .populate("userId", "fullname username")
      .sort({ postedDate: -1 });

    const count = jobOpenings.length;

    res.json({
      success: true,
      jobOpenings,
      count,
      message: `Retrieved ${count} job openings successfully`,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get advertisement list with count
const getAdvertisementList = async (req, res) => {
  try {
    const advertisements = await advertisementModel
      .find({})
      .populate("userId", "fullname username")
      .sort({ postedDate: -1 });

    const count = advertisements.length;

    res.json({
      success: true,
      advertisements,
      count,
      message: `Retrieved ${count} advertisements successfully`,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get donation list (Corrected for your schemas)
const getDonationList = async (req, res) => {
  try {
    const rawDonations = await donationModel
      .find()
      .populate("userId", "_id fullname email contact address fatherName gender") // Populates the user who made the donation (the father)
      .populate("donatedFor", "fullname gender") // CORRECT: Populates the child's document using the 'donatedFor' field
      .sort({ createdAt: -1 });

    // Process donations to update prasad packets and weights
    const donations = updateOnlineDonationsWithPrasad(rawDonations);

    res.json({
      success: true,
      donations,
    });
  } catch (error) {
    console.log("Error in getDonationList:", error);
    res.json({ success: false, message: error.message });
  }
};

const editGuestDetails = async (req, res) => {
  try {
    // Destructure the ID and the fields you want to update from the request body
    console.log(req);
    const { id, fullname, father, contact, address } = req.body;

    // 1. Validate that the guest ID is provided
    if (!id) {
      return res.json({ success: false, message: "Guest ID is required." });
    }

    // 2. Prepare an object with only the fields that were actually sent in the request.
    // This prevents accidentally overwriting existing data with 'undefined'.
    const updateFields = {};
    if (fullname) updateFields.fullname = fullname;
    if (father) updateFields.father = father;
    if (contact) updateFields.contact = contact; // e.g., { email, mobileno }
    if (address) updateFields.address = address; // e.g., { line1, city, state, etc. }

    // 3. Check if there's any data to update
    if (Object.keys(updateFields).length === 0) {
      return res.json({
        success: false,
        message: "No fields to update were provided.",
      });
    }

    // 4. Find the guest by their ID and update their details.
    // The { new: true } option ensures the updated document is returned.
    const updatedGuest = await guestUserModel.findByIdAndUpdate(
      id,
      { $set: updateFields }, // Use $set to safely update only the provided fields
      { new: true }
    );

    // 5. If no guest was found with that ID, return an error
    if (!updatedGuest) {
      return res.json({ success: false, message: "Guest not found." });
    }

    // 6. Send a success response with the updated guest data
    res.json({
      success: true,
      message: "Guest details updated successfully.",
      data: updatedGuest,
    });
  } catch (error) {
    console.error("Error in editGuestDetails:", error);
    res.json({
      success: false,
      message: "Server error while updating guest details.",
    });
  }
};

const getGuestDonationList = async (req, res) => {
  try {
    const guestDonations = await guestDonationModel
      .find({ paymentStatus: "completed" }) // Filter for completed donations
      .populate("guestId", "fullname contact address father") // Populate guest user fields
      .sort({ createdAt: -1 });

    // Format data for frontend consistency by renaming guestId to userId
    const formattedDonations = guestDonations.map((d) => {
      const doc = d.toObject();
      doc.userId = doc.guestId; // Create a 'userId' property
      delete doc.guestId; // Remove the original 'guestId'
      return doc;
    });

    res.json({
      success: true,
      donations: formattedDonations, // Send with the same key 'donations'
    });
  } catch (error) {
    console.log("Error in getGuestDonationList:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to get family count only (using khandanModel)
const getFamilyCount = async (req, res) => {
  try {
    const { year } = req.query; // Get year from query params
    const currentYear = new Date().getFullYear();
    const targetYear = year ? parseInt(year) : currentYear;

    // Create start and end dates for the year
    const startDate = new Date(targetYear, 0, 1); // January 1st
    const endDate = new Date(targetYear + 1, 0, 1); // January 1st of next year

    // Get monthly family registrations for the specified year
    const monthlyFamilies = await khandanModel.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
        },
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.month": 1 },
      },
    ]);

    // Create array with all 12 months, filling missing months with 0
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const monthlyData = monthNames.map((month, index) => {
      const monthData = monthlyFamilies.find(
        (item) => item._id.month === index + 1
      );
      return {
        month,
        families: monthData ? monthData.count : 0,
      };
    });

    // Get total count for the year
    const totalCount = monthlyData.reduce(
      (sum, month) => sum + month.families,
      0
    );

    res.json({
      success: true,
      year: targetYear,
      totalCount,
      monthlyData,
      message: `Family registrations for ${targetYear}: ${totalCount}`,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get user count only
const getUserCount = async (req, res) => {
  try {
    const { year } = req.query; // Get year from query params
    const currentYear = new Date().getFullYear();
    const targetYear = year ? parseInt(year) : currentYear;

    // Create start and end dates for the year
    const startDate = new Date(targetYear, 0, 1); // January 1st
    const endDate = new Date(targetYear + 1, 0, 1); // January 1st of next year

    // Get monthly user registrations for the specified year
    const monthlyUsers = await userModel.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
        },
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          count: { $sum: 1 },
          complete: { $sum: { $cond: ["$isComplete", 1, 0] } },
        },
      },
      {
        $sort: { "_id.month": 1 },
      },
    ]);

    // Create array with all 12 months, filling missing months with 0
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const monthlyData = monthNames.map((month, index) => {
      const monthData = monthlyUsers.find(
        (item) => item._id.month === index + 1
      );
      return {
        month,
        users: monthData ? monthData.count : 0,
        completeUsers: monthData ? monthData.complete : 0,
        incompleteUsers: monthData ? monthData.count - monthData.complete : 0,
      };
    });

    // Get totals for the year
    const totalUsers = monthlyData.reduce((sum, month) => sum + month.users, 0);
    const totalComplete = monthlyData.reduce(
      (sum, month) => sum + month.completeUsers,
      0
    );
    const totalIncomplete = totalUsers - totalComplete;

    res.json({
      success: true,
      year: targetYear,
      totalUsers,
      completeProfiles: totalComplete,
      incompleteProfiles: totalIncomplete,
      monthlyData,
      message: `User registrations for ${targetYear}: ${totalUsers} (Complete: ${totalComplete}, Incomplete: ${totalIncomplete})`,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to update user status
const updateUserStatus = async (req, res) => {
  try {
    const { userId, isApproved } = req.body;

    // Validate status
    if (!["approved", "disabled"].includes(isApproved)) {
      return res.json({ success: false, message: "Invalid status value" });
    }

    const user = await userModel
      .findByIdAndUpdate(userId, { isApproved }, { new: true })
      .select("-password");

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      user,
      message: `User ${isApproved} successfully`,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get all notices
const getNoticeList = async (req, res) => {
  try {
    const notices = await noticeModel.find({}).sort({ createdAt: -1 }); // Most recent first

    const count = notices.length;

    res.json({
      success: true,
      notices,
      count,
      message: `Retrieved ${count} notices successfully`,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to add a new notice
const addNotice = async (req, res) => {
  try {
    const { title, message, icon, color, type, author, category } = req.body;

    // Validate required fields
    if (
      !title ||
      !message ||
      !icon ||
      !color ||
      !type ||
      !author ||
      !category
    ) {
      return res.json({
        success: false,
        message: "All fields are required",
      });
    }

    // Validate type enum
    const validTypes = [
      "alert",
      "announcement",
      "event",
      "achievement",
      "info",
    ];
    if (!validTypes.includes(type)) {
      return res.json({
        success: false,
        message: "Invalid notice type",
      });
    }

    const newNotice = new noticeModel({
      title,
      message,
      icon,
      color,
      type,
      author,
      category,
      time: new Date(), // Set current time
    });

    await newNotice.save();

    res.json({
      success: true,
      notice: newNotice,
      message: "Notice added successfully",
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to update a notice
const updateNotice = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, icon, color, type, author, category } = req.body;

    // Validate required fields
    if (
      !title ||
      !message ||
      !icon ||
      !color ||
      !type ||
      !author ||
      !category
    ) {
      return res.json({
        success: false,
        message: "All fields are required",
      });
    }

    // Validate type enum
    const validTypes = [
      "alert",
      "announcement",
      "event",
      "achievement",
      "info",
    ];
    if (!validTypes.includes(type)) {
      return res.json({
        success: false,
        message: "Invalid notice type",
      });
    }

    const updatedNotice = await noticeModel.findByIdAndUpdate(
      id,
      {
        title,
        message,
        icon,
        color,
        type,
        author,
        category,
      },
      { new: true }
    );

    if (!updatedNotice) {
      return res.json({ success: false, message: "Notice not found" });
    }

    res.json({
      success: true,
      notice: updatedNotice,
      message: "Notice updated successfully",
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to delete a notice
const deleteNotice = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedNotice = await noticeModel.findByIdAndDelete(id);

    if (!deletedNotice) {
      return res.json({ success: false, message: "Notice not found" });
    }

    res.json({
      success: true,
      message: "Notice deleted successfully",
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// Get all categories
const getAllCategories = async (req, res) => {
  try {
    const categories = await donationCategoryModel.find({ isActive: true });
    res.json({
      success: true,
      categories,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// Add new category
const addCategory = async (req, res) => {
  try {
    const { categoryName, rate, weight, packet, description, dynamic } =
      req.body;

    // Validate required fields
    if (!categoryName || !rate || !(weight || packet)) {
      return res.json({
        success: false,
        message: "Category name, rate, and weight are required",
      });
    }
    if (
      dynamic &&
      dynamic.isDynamic &&
      (!dynamic.minvalue || dynamic.minvalue < 0)
    ) {
      return res.json({
        success: false,
        message:
          "For a dynamic category, a minimum value of 0 or more is required.",
      });
    }
    // Check if category already exists
    const existingCategory = await donationCategoryModel.findOne({
      categoryName: categoryName.trim(),
    });

    if (existingCategory) {
      return res.json({
        success: false,
        message: "Category already exists",
      });
    }

    // Create new category
    const newCategory = new donationCategoryModel({
      categoryName: categoryName.trim(),
      rate: Number(rate),
      weight: Number(weight),
      packet: Boolean(packet),
      description: description?.trim() || "",
      dynamic: {
        isDynamic: dynamic?.isDynamic || false,
        minvalue: dynamic?.isDynamic ? Number(dynamic.minvalue) : 0,
      },
    });

    const savedCategory = await newCategory.save();

    res.json({
      success: true,
      message: "Category added successfully",
      category: savedCategory,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// Edit category
const editCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryName, rate, weight, packet, description, dynamic } =
      req.body;

    // Validate required fields
    if (!categoryName || !rate || !(weight || packet)) {
      return res.json({
        success: false,
        message: "Category name, rate, and weight/packet are required",
      });
    }

    if (
      dynamic &&
      dynamic.isDynamic &&
      (!dynamic.minvalue || dynamic.minvalue < 0)
    ) {
      return res.json({
        success: false,
        message:
          "For a dynamic category, a minimum value of 0 or more is required.",
      });
    }

    // Check if category exists
    const category = await donationCategoryModel.findById(id);
    if (!category) {
      return res.json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if another category with same name exists
    const existingCategory = await donationCategoryModel.findOne({
      categoryName: categoryName.trim(),
      _id: { $ne: id },
    });

    if (existingCategory) {
      return res.json({
        success: false,
        message: "Category name already exists",
      });
    }

    // Update category
    const updatedCategory = await donationCategoryModel.findByIdAndUpdate(
      id,
      {
        categoryName: categoryName.trim(),
        rate: Number(rate),
        weight: Number(weight),
        packet: Boolean(packet),
        description: description?.trim() || "",
        dynamic: {
          isDynamic: dynamic?.isDynamic || false,
          minvalue: dynamic?.isDynamic ? Number(dynamic.minvalue) : 0,
        },
      },
      { new: true }
    );

    res.json({
      success: true,
      message: "Category updated successfully",
      category: updatedCategory,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// Delete category (soft delete)
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const category = await donationCategoryModel.findById(id);
    if (!category) {
      return res.json({
        success: false,
        message: "Category not found",
      });
    }

    // Soft delete by setting isActive to false
    await donationCategoryModel.findByIdAndUpdate(id, { isActive: false });

    res.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// Get single category
const getCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await donationCategoryModel.findById(id);
    if (!category) {
      return res.json({
        success: false,
        message: "Category not found",
      });
    }

    res.json({
      success: true,
      category,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get available years for data filtering
const getAvailableYears = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    // Aggregate to find unique years from user creation dates
    const years = await userModel.aggregate([
      {
        $group: {
          _id: { $year: "$createdAt" },
        },
      },
      {
        $sort: { _id: -1 }, // Sort in descending order
      },
      {
        $project: {
          _id: 0,
          year: "$_id",
        },
      },
    ]);

    // Extract just the year numbers
    const availableYears = years.map((item) => item.year);

    // Ensure current year is always an option if no data exists for it yet
    if (!availableYears.includes(currentYear)) {
      availableYears.unshift(currentYear);
    }
    // Remove duplicates and sort again just to be safe, although aggregation should handle unique
    const uniqueSortedYears = [...new Set(availableYears)].sort(
      (a, b) => b - a
    );

    res.json({
      success: true,
      years: uniqueSortedYears,
      message: "Available years fetched successfully",
    });
  } catch (error) {
    console.error("Error in getAvailableYears:", error);
    res.json({ success: false, message: error.message });
  }
};

// ========== COURIER CHARGE CONTROLLERS ==========

// Get all courier charges
const getCourierCharges = async (req, res) => {
  try {
    const courierCharges = await courierChargeModel
      .find()
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Courier charges fetched successfully",
      courierCharges,
    });
  } catch (error) {
    console.error("Error fetching courier charges:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching courier charges",
      error: error.message,
    });
  }
};

// Create new courier charge
const createCourierCharge = async (req, res) => {
  try {
    const { region, amount } = req.body;

    // Validation
    if (!region || !amount) {
      return res.status(400).json({
        success: false,
        message: "Region and amount are required",
      });
    }

    if (amount < 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a positive number",
      });
    }

    // Valid regions
    const validRegions = [
      "in_gaya_outside_manpur",
      "in_bihar_outside_gaya",
      "in_india_outside_bihar",
      "outside_india",
    ];

    if (!validRegions.includes(region)) {
      return res.status(400).json({
        success: false,
        message: "Invalid region selected",
      });
    }

    // Check if courier charge for this region already exists
    const existingCharge = await courierChargeModel.findOne({ region });
    if (existingCharge) {
      return res.status(400).json({
        success: false,
        message: "Courier charge for this region already exists",
      });
    }

    // Create new courier charge
    const newCourierCharge = new courierChargeModel({
      region,
      amount: Number(amount),
    });

    await newCourierCharge.save();

    res.status(201).json({
      success: true,
      message: "Courier charge created successfully",
      courierCharge: newCourierCharge,
    });
  } catch (error) {
    console.error("Error creating courier charge:", error);
    res.status(500).json({
      success: false,
      message: "Error creating courier charge",
      error: error.message,
    });
  }
};

// Update courier charge
const updateCourierCharge = async (req, res) => {
  try {
    const { id } = req.params;
    const { region, amount } = req.body;

    // Validation
    if (!region || !amount) {
      return res.status(400).json({
        success: false,
        message: "Region and amount are required",
      });
    }

    if (amount < 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a positive number",
      });
    }

    // Valid regions
    const validRegions = [
      "in_gaya_outside_manpur",
      "in_bihar_outside_gaya",
      "in_india_outside_bihar",
      "outside_india",
    ];

    if (!validRegions.includes(region)) {
      return res.status(400).json({
        success: false,
        message: "Invalid region selected",
      });
    }

    // Check if courier charge exists
    const courierCharge = await courierChargeModel.findById(id);
    if (!courierCharge) {
      return res.status(404).json({
        success: false,
        message: "Courier charge not found",
      });
    }

    // Check if courier charge for this region already exists (excluding current one)
    const existingCharge = await courierChargeModel.findOne({
      region,
      _id: { $ne: id },
    });

    if (existingCharge) {
      return res.status(400).json({
        success: false,
        message: "Courier charge for this region already exists",
      });
    }

    // Update courier charge
    const updatedCourierCharge = await courierChargeModel.findByIdAndUpdate(
      id,
      {
        region,
        amount: Number(amount),
        updatedAt: new Date(),
      },
      { new: true }
    );

    res.json({
      success: true,
      message: "Courier charge updated successfully",
      courierCharge: updatedCourierCharge,
    });
  } catch (error) {
    console.error("Error updating courier charge:", error);
    res.status(500).json({
      success: false,
      message: "Error updating courier charge",
      error: error.message,
    });
  }
};

// Delete courier charge
const deleteCourierCharge = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if courier charge exists
    const courierCharge = await courierChargeModel.findById(id);
    if (!courierCharge) {
      return res.status(404).json({
        success: false,
        message: "Courier charge not found",
      });
    }

    // Delete courier charge
    await courierChargeModel.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Courier charge deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting courier charge:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting courier charge",
      error: error.message,
    });
  }
};

// Add a new feature
const addFeature = async (req, res) => {
  const { featureName, link, iconName, access } = req.body;
  if (!featureName || !link || !iconName || !access) {
    return res.json({ success: false, message: "All fields are required" });
  }

  const feature = new featureModel({
    featureName,
    link,
    iconName,
    access,
  });

  try {
    await feature.save();
    res.json({ success: true, message: "Feature Added Successfully" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error adding feature" });
  }
};

// Get all features
const listFeatures = async (req, res) => {
  try {
    const filter = {};
    if (req.query.access) {
      filter.access = req.query.access;
    }
    const features = await featureModel.find(filter);
    res.json({ success: true, data: features });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error fetching features" });
  }
};

// Update an existing feature (including toggling active status)
const updateFeature = async (req, res) => {
  try {
    await featureModel.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true, message: "Feature Updated Successfully" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error updating feature" });
  }
};

// Remove a feature
const removeFeature = async (req, res) => {
  try {
    await featureModel.findByIdAndDelete(req.body.id);
    res.json({ success: true, message: "Feature Removed Successfully" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error removing feature" });
  }
};
const getDonationCount = async (req, res) => {
  try {
    const { year } = req.query; // Get year from query params
    const currentYear = new Date().getFullYear();
    const targetYear = year ? parseInt(year) : currentYear; // Create start and end dates for the year

    const startDate = new Date(targetYear, 0, 1); // January 1st
    const endDate = new Date(targetYear + 1, 0, 1); // January 1st of next year // 1. Get monthly donation amounts for registered users

    const monthlyDonations = await donationModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate },
          paymentStatus: "completed",
        },
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]); // 2. Get monthly donation amounts for guest users

    const monthlyGuestDonations = await guestDonationModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate },
          paymentStatus: "completed",
        },
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]); // 3. Combine the results from both sources

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const monthlyData = monthNames.map((month, index) => {
      const monthIndex = index + 1; // Find data for the current month, defaulting to 0 if not found

      const userDonationData = monthlyDonations.find(
        (item) => item._id.month === monthIndex
      );
      const guestDonationData = monthlyGuestDonations.find(
        (item) => item._id.month === monthIndex
      );

      const userAmount = userDonationData ? userDonationData.totalAmount : 0;
      const guestAmount = guestDonationData ? guestDonationData.totalAmount : 0;

      return {
        month,
        donations: userAmount + guestAmount, // Sum of both donation types
      };
    }); // 4. Calculate the total amount for the entire year

    const totalAmount = monthlyData.reduce(
      (sum, month) => sum + month.donations,
      0
    ); // 5. Send the final combined data

    res.json({
      success: true,
      year: targetYear,
      totalAmount,
      monthlyData,
      message: `Total completed donations for ${targetYear}: ${totalAmount}`,
    });
  } catch (error) {
    console.log("Error in getDonationCount:", error);
    res.json({ success: false, message: error.message });
  }
};

const profileAddressForRegisteredUser = (address) => {
    if (!address) return "";
    const {
      room,
      floor,
      apartment,
      street,
      landmark,
      postoffice,
      city,
      district,
      state,
      country,
      pin,
    } = address;
    return [
      room,
      floor,
      apartment,
      street,
      landmark,
      postoffice,
      city,
      district,
      state,
      country,
      pin,
    ]
      .filter(Boolean)
      .join(", ");
  };

const getOnlineCourierAddresses = async (req, res) => {
  try {
    const { year, location = "all", donorType = "all" } = req.query;

    // 1. Date range setup (remains the same)
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear + 1, 0, 1);
    const dateQuery = { createdAt: { $gte: startDate, $lt: endDate } };

    let allDonations = [];

    // 2. Fetching from both collections (remains the same)
    if (donorType === "all" || donorType === "registered") {
      const registeredDonations = await donationModel
        .find({
          method: "Online",
          paymentStatus: "completed",
          postalAddress: {
            $not: {
              $regex: "^Will collect from Durga Sthan$", // Matches the entire string
              $options: "i", // Case-insensitive
            }
          },
          ...dateQuery,
        })
        .populate({ path: "userId", select: "fullname address contact" })
        .sort({ receiptId: 1 })
        .lean();

      const donationsWithPrasad = updateOnlineDonationsWithPrasad(registeredDonations);

      const formattedRegistered = donationsWithPrasad.map((d) => ({
        ...d,
        user: d.userId,
        donorType: "registered",
        courierAddressSameAsProfile: d.postalAddress === profileAddressForRegisteredUser(d.userId?.address),
        totalPackets: d.list.reduce((sum, item) => sum + (item.isPacket ? item.quantity : 0), 0),
        totalWeightInGrams: d.list.reduce((sum, item) => sum + (item.isPacket ? 0 : item.quantity), 0),
      }));
      allDonations.push(...formattedRegistered);
    }

    /* Do not include guest donations temporarily
    if (donorType === "all" || donorType === "guest") {
      const guestDonations = await guestDonationModel
        .find({
          paymentStatus: "completed",
          ...dateQuery,
        })
        .populate({ path: "guestId", select: "fullname address contact" })
        .lean();
      const formattedGuest = guestDonations.map((d) => ({
        ...d,
        user: d.guestId,
        postalAddress: formatGuestAddress(d.guestId?.address),
        courierAddressSameAsProfile: true,
        donorType: "guest",
      }));
      allDonations.push(...formattedGuest);
    }*/

    // 3. Filter by location (In India / Outside India)
    const filteredByLocation = allDonations.filter((donation) => {
      if (!donation.user || !donation.user.address) return false;
      const country = (donation.user.address.country || "").toLowerCase();
      if (location === "in_india") return country === "india";
      if (location === "outside_india") return country !== "india";
      return true;
    });

    // 4. *** NEW *** Filter out local Gaya/Bihar addresses
    const filteredDonations = filteredByLocation.filter((donation) => {
      const addressString = (donation.postalAddress || "").toLowerCase();
      const hasGaya = addressString.includes("gaya");
      const hasBihar = addressString.includes("bihar");
      // Keep the donation ONLY IF it does not contain BOTH "gaya" and "bihar"
      return !(hasGaya && hasBihar);
    });

    // 5. Format the addresses for the final response (remains the same)
    const formattedAddresses = filteredDonations
      .filter(d => d.totalPackets > 0 || d.totalWeightInGrams > 0) // Only include donations with prasad
      .map((d) => ({
        id: d._id,
        receiptId: d.receiptId,
        toName: d.user?.fullname || "N/A",
        toAddress: d.postalAddress,
        toPhone: d.user?.contact?.mobileno
          ? `${d.user.contact.mobileno.code} ${d.user.contact.mobileno.number}`
          : "N/A",
        donationDate: d.createdAt,
        donorType: d.donorType,
    }));

    // 7. Send the response
    res.json({
      success: true,
      addresses: formattedAddresses,
      count: formattedAddresses.length,
    });
  } catch (error) {
    console.error("Error fetching courier addresses:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching addresses.",
    });
  }
};

export {
  loginAdmin,
  addAdmin,
  listAdmins,
  removeAdmin,
  refreshToken,
  getFamilyList,
  getUserList,
  getStaffRequirementList,
  getJobOpeningList,
  getAdvertisementList,
  getDonationList,
  getGuestDonationList,
  getFamilyCount,
  getUserCount,
  updateUserStatus,
  getNoticeList,
  addNotice,
  updateNotice,
  deleteNotice,
  getAllCategories,
  addCategory,
  editCategory,
  deleteCategory,
  getCategory,
  getAvailableYears,
  // Courier charge controllers
  getCourierCharges,
  createCourierCharge,
  updateCourierCharge,
  deleteCourierCharge,
  //Features controllers
  addFeature,
  listFeatures,
  updateFeature,
  removeFeature,
  editAdmin,
  getDonationCount,
  getOnlineCourierAddresses,
  blockAdmin,
  getAdminStatus,
  editGuestDetails,
};
