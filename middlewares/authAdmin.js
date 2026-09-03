import jwt from "jsonwebtoken";
import adminModel from "../models/AdminModel.js";

const verifyRefreshToken = async (req, res, next) => {
  const refreshToken = req.body.refreshToken;
  if (!refreshToken) {
    return res.json({ success: false, message: "No refresh token provided" });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    const admin = await adminModel.findById(decoded.id);

    if (!admin || admin.refreshToken !== refreshToken) {
      // Token is invalid or has been invalidated (e.g., admin logged out)
      return res.json({ success: false, message: "Invalid refresh token" });
    }

    // Attach admin data to the request for the next middleware
    req.admin = admin;
    next();
  } catch (error) {
    return res.json({
      success: false,
      message: "Failed to authenticate refresh token",
    });
  }
};

//admin authentication middleware..
const authAdmin = async (req, res, next) => {
  const token = req.header("atoken");
  if (!token) {
    return res.json({
      success: false,
      message: "Not Authorized, no token provided",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.adminId = decoded.id; // Store admin ID for route handlers
    req.adminRole = decoded.role;
    req.allowedFeatures = decoded.allowedFeatures;
    req.isApproved = decoded.isApproved;
    next();
  } catch (error) {
    // If token has expired, send a specific error message
    if (error.name === "TokenExpiredError") {
      return res.json({
        success: false,
        message: "Token has expired",
        expired: true,
      });
    }
    // For any other token validation error
    return res.json({ success: false, message: "Invalid token" });
  }
};

export { authAdmin, verifyRefreshToken };
