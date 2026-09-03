import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import mongoose from "mongoose";
import teamMemberModel from "../models/TeamMemberModel.js";

// // Configure Cloudinary
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_SECRET_KEY,
// });

// Helper function to delete temporary file
const deleteTempFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error("Error deleting temp file:", error);
    }
  }
};

// Helper function to extract public_id from Cloudinary URL
const extractPublicId = (url) => {
  if (!url || !url.includes("cloudinary.com")) return null;
  try {
    const parts = url.split("/");
    const filename = parts[parts.length - 1];
    const publicId = filename.split(".")[0];
    return `team-members/${publicId}`;
  } catch (error) {
    console.error("Error extracting public ID:", error);
    return null;
  }
};

// Get all active team members by category (Public route) -- DONE
export const getTeamMembers = async (req, res) => {
  try {
    const teamMembers = await teamMemberModel.find({ isActive: true }).sort({
      category: 1,
      order: 1,
      createdAt: 1,
    });

    // Group by category for easier frontend rendering
    const groupedMembers = teamMembers.reduce((acc, member) => {
      if (!acc[member.category]) {
        acc[member.category] = [];
      }
      acc[member.category].push(member);
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      teamMembers: groupedMembers,
      totalMembers: teamMembers.length,
    });
  } catch (error) {
    console.error("Error fetching team members:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch team members. Please try again later.",
    });
  }
};

// Get all team members for admin panel (Admin route) - DONE
export const getAllTeamMembersForAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 50, category, status } = req.query;

    // Build filter object
    const filter = {};
    if (category && category !== "all") {
      filter.category = category;
    }
    if (status && status !== "all") {
      filter.isActive = status === "active";
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { category: 1, order: 1, createdAt: -1 },
    };

    const teamMembers = await teamMemberModel
      .find(filter)
      .sort(options.sort)
      .limit(options.limit * options.page)
      .skip((options.page - 1) * options.limit);

    const total = await teamMemberModel.countDocuments(filter);

    res.status(200).json({
      success: true,
      teamMembers,
      pagination: {
        currentPage: options.page,
        totalPages: Math.ceil(total / options.limit),
        totalItems: total,
        itemsPerPage: options.limit,
      },
    });
  } catch (error) {
    console.error("Error fetching team members for admin:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch team members. Please try again later.",
    });
  }
};

// Add new team member (Admin route) - DONE
export const addTeamMember = async (req, res) => {
  try {
    const { name, position, category, isActive } = req.body;
    const imageFile = req.file;

    // Validation
    if (!name || !position || !category) {
      if (imageFile) deleteTempFile(imageFile.path);
      return res.json({
        success: false,
        message: "Name, position, and category are required fields.",
      });
    }

    if (!imageFile) {
      return res.json({
        success: false,
        message: "Image is required for team member.",
      });
    }

    // Validate category
    const validCategories = [
      "chairman-vicechairman",
      "president-vicepresident",
      "secretary",
      "treasurer",
      "consultant",
      "digital-technical-support",
    ];

    if (!validCategories.includes(category)) {
      deleteTempFile(imageFile.path);
      return res.json({
        success: false,
        message: "Invalid category selected.",
      });
    }

    // Upload image to Cloudinary
    const imageUpload = await cloudinary.uploader.upload(imageFile.path, {
      folder: "team-members",
      resource_type: "image",
      transformation: [
        { width: 400, height: 400, crop: "fill", gravity: "face" },
        { quality: "auto", fetch_format: "auto" },
      ],
    });

    const imageURL = imageUpload.secure_url;

    // Create new team member
    const newMember = new teamMemberModel({
      name: name.trim(),
      position: position.trim(),
      category,
      isActive: isActive === "true" || isActive === true,
      image: imageURL,
    });

    await newMember.save();

    // Clean up temp file
    deleteTempFile(imageFile.path);

    res.json({
      success: true,
      message: "Team member added successfully",
      member: newMember,
    });
  } catch (error) {
    // Clean up temp file on error
    if (req.file) deleteTempFile(req.file.path);

    console.error("Error adding team member:", error);

    if (error.code === 11000) {
      return res.json({
        success: false,
        message: "A team member with this information already exists.",
      });
    }

    res.json({
      success: false,
      message: "Failed to add team member. Please try again later.",
    });
  }
};

// Update team member (Admin route) - DONE
export const updateTeamMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, position, category, isActive } = req.body;
    const imageFile = req.file;

    // Validate MongoDB ObjectId
    if (!mongoose.isValidObjectId(id)) {
      if (imageFile) deleteTempFile(imageFile.path);
      return res.json({
        success: false,
        message: "Invalid team member ID format.",
      });
    }

    // Check if member exists
    const existingMember = await teamMemberModel.findById(id);
    if (!existingMember) {
      if (imageFile) deleteTempFile(imageFile.path);
      return res.json({
        success: false,
        message: "Team member not found.",
      });
    }

    // Prepare update data
    const updateData = {};

    if (name) updateData.name = name.trim();
    if (position) updateData.position = position.trim();
    if (category) updateData.category = category;
    if (isActive !== undefined)
      updateData.isActive = isActive === "true" || isActive === true;

    // Validate category if provided
    if (category) {
      const validCategories = [
        "chairman-vicechairman",
        "president-vicepresident",
        "secretary",
        "treasurer",
        "consultant",
        "digital-technical-support",
      ];

      if (!validCategories.includes(category)) {
        if (imageFile) deleteTempFile(imageFile.path);
        return res.json({
          success: false,
          message: "Invalid category selected.",
        });
      }
    }

    // Handle image update
    if (imageFile) {
      try {
        // Upload new image to Cloudinary
        const imageUpload = await cloudinary.uploader.upload(imageFile.path, {
          folder: "team-members",
          resource_type: "image",
          transformation: [
            { width: 400, height: 400, crop: "fill", gravity: "face" },
            { quality: "auto", fetch_format: "auto" },
          ],
        });

        const imageURL = imageUpload.secure_url;
        updateData.image = imageURL;

        // Delete old image from Cloudinary
        const oldPublicId = extractPublicId(existingMember.image);
        if (oldPublicId) {
          try {
            await cloudinary.uploader.destroy(oldPublicId);
          } catch (deleteError) {
            console.error("Error deleting old image:", deleteError);
            // Continue with update even if old image deletion fails
          }
        }

        // Clean up temp file
        deleteTempFile(imageFile.path);
      } catch (cloudinaryError) {
        deleteTempFile(imageFile.path);
        console.error("Cloudinary upload error:", cloudinaryError);
        return res.json({
          success: false,
          message: "Failed to upload image. Please try again.",
        });
      }
    }

    // Update team member
    const updatedMember = await teamMemberModel.findByIdAndUpdate(
      id,
      { ...updateData },
      { new: true }
    );

    res.json({
      success: true,
      message: "Team member updated successfully",
      member: updatedMember,
    });
  } catch (error) {
    // Clean up temp file on error
    if (req.file) deleteTempFile(req.file.path);

    console.error("Error updating team member:", error);

    // if (error.code === 11000) {
    //   return res.json({
    //     success: false,
    //     message: "A team member with this information already exists.",
    //   });
    // }

    res.json({
      success: false,
      message: "Failed to update team member. Please try again later.",
    });
  }
};

// Delete team member (Admin route) - DONE
export const deleteTeamMember = async (req, res) => {
  try {
    const { id } = req.params || req.body;

    // Support both params and body for ID (following userController pattern)
    const memberId = id || req.body.memberId;

    // Validate MongoDB ObjectId
    if (!mongoose.isValidObjectId(memberId)) {
      return res.json({
        success: false,
        message: "Invalid team member ID format.",
      });
    }

    // Find and delete the team member
    const deletedMember = await teamMemberModel.findByIdAndDelete(memberId);

    if (!deletedMember) {
      return res.json({
        success: false,
        message: "Team member not found.",
      });
    }

    // Delete image from Cloudinary
    try {
      const publicId = extractPublicId(deletedMember.image);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (cloudinaryError) {
      console.error("Error deleting image from Cloudinary:", cloudinaryError);
      // Don't fail the request if image deletion fails
    }

    res.json({
      success: true,
      message: "Team member deleted successfully",
      deletedMember: {
        id: deletedMember._id,
        name: deletedMember.name,
        position: deletedMember.position,
      },
    });
  } catch (error) {
    console.error("Error deleting team member:", error);
    res.json({
      success: false,
      message: "Failed to delete team member. Please try again later.",
    });
  }
};

// Toggle team member status (Admin route)
export const toggleTeamMemberStatus = async (req, res) => {
  try {
    const { memberId, isActive } = req.body;

    if (!memberId) {
      return res.json({
        success: false,
        message: "Member ID is required",
      });
    }

    // Validate MongoDB ObjectId
    if (!mongoose.isValidObjectId(memberId)) {
      return res.json({
        success: false,
        message: "Invalid team member ID format.",
      });
    }

    // Handle boolean conversion (following userController pattern)
    let activeStatus = isActive;
    if (typeof isActive !== "boolean") {
      if (isActive === "true") activeStatus = true;
      else if (isActive === "false") activeStatus = false;
      else {
        return res.json({
          success: false,
          message: "isActive must be boolean or true/false.",
        });
      }
    }

    const updatedMember = await teamMemberModel.findByIdAndUpdate(
      memberId,
      { isActive: activeStatus, updatedAt: new Date() },
      { new: true }
    );

    if (!updatedMember) {
      return res.json({
        success: false,
        message: "Team member not found.",
      });
    }

    res.json({
      success: true,
      message: `Team member ${
        activeStatus ? "activated" : "deactivated"
      } successfully`,
      member: updatedMember,
    });
  } catch (error) {
    console.error("Error toggling team member status:", error);
    res.json({
      success: false,
      message: "Failed to update team member status. Please try again later.",
    });
  }
};
