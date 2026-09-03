import khandanModel from "../models/KhandanModel.js";

// Helper function to generate next khandanid
const generateNextKhandanId = async () => {
  try {
    // Find the last khandan sorted by khandanid in descending order
    const lastKhandan = await khandanModel
      .findOne({})
      .sort({ khandanid: -1 })
      .select("khandanid");

    if (!lastKhandan) {
      // If no khandan exists, start with FA001
      return "FA001";
    }

    const lastId = lastKhandan.khandanid;

    // Extract parts: F + A + 001
    const prefix = lastId.substring(0, 1); // 'F'
    const letter = lastId.substring(1, 2); // 'A', 'B', 'C', etc.
    const number = parseInt(lastId.substring(2)); // 001, 002, etc.

    // If number is less than 999, just increment the number
    if (number < 999) {
      const nextNumber = (number + 1).toString().padStart(3, "0");
      return `${prefix}${letter}${nextNumber}`;
    }

    // If number is 999, increment the letter and reset number to 001
    const nextLetter = String.fromCharCode(letter.charCodeAt(0) + 1);

    // Check if we've exceeded 'Z'
    if (nextLetter > "Z") {
      throw new Error("Maximum khandanid limit reached (FZ999)");
    }

    return `${prefix}${nextLetter}001`;
  } catch (error) {
    console.error("Error generating khandanid:", error);
    throw new Error("Failed to generate khandanid", { cause: error });
  }
};

// Helper function to get monthly khandan data
const getMonthlyKhandanData = async (year) => {
  try {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    const monthlyData = await khandanModel.aggregate([
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

    return monthlyData.map((item) => ({
      month: item._id.month,
      count: item.count,
    }));
  } catch (error) {
    console.error("Error getting monthly khandan data:", error);
    throw new Error("Failed to get monthly khandan data", { cause: error });
  }
};

// API to get all khandans
const getAllKhandans = async (req, res) => {
  try {
    const khandans = await khandanModel
      .find({})
      .select("khandanid name gotra contact address")
      .sort({ name: 1 }); // Sort alphabetically by name

    if (!khandans || khandans.length === 0) {
      return res.json({
        success: false,
        message: "No khandans found",
        khandans: [],
      });
    }

    res.json({
      success: true,
      message: "Khandans fetched successfully",
      khandans: khandans,
    });
  } catch (error) {
    console.error("Error fetching khandans:", error);
    res.json({
      success: false,
      message: "Failed to fetch khandans: " + error.message,
      khandans: [],
    });
  }
};

// API to get khandan list with count (for admin)
const getKhandanList = async (req, res) => {
  try {
    const khandanList = await khandanModel.find({}).sort({ name: 1 });
    const count = khandanList.length;

    res.json({
      success: true,
      khandanList,
      count,
      message: "Khandan list retrieved successfully",
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get khandan count with monthly breakdown (for admin)
const getKhandanCount = async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year ? parseInt(year) : new Date().getFullYear();

    const totalCount = await khandanModel.countDocuments();
    const monthlyData = await getMonthlyKhandanData(currentYear);

    // Format monthly data for frontend
    const months = [
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

    const formattedMonthlyData = months.map((month, index) => {
      const data = monthlyData.find((item) => item.month === index + 1);
      return {
        month,
        families: data ? data.count : 0,
      };
    });

    res.json({
      success: true,
      totalCount,
      monthlyData: formattedMonthlyData,
      year: currentYear,
      message: "Khandan count retrieved successfully",
    });
  } catch (error) {
    console.log("Error in getKhandanCount:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to get a specific khandan by ID
const getKhandanById = async (req, res) => {
  try {
    const { khandanId } = req.params;

    if (!khandanId) {
      return res.json({
        success: false,
        message: "Khandan ID is required",
      });
    }

    const khandan = await khandanModel.findById(khandanId);

    if (!khandan) {
      return res.json({
        success: false,
        message: "Khandan not found",
      });
    }

    res.json({
      success: true,
      message: "Khandan fetched successfully",
      khandan: khandan,
    });
  } catch (error) {
    console.error("Error fetching khandan:", error);
    res.json({
      success: false,
      message: "Failed to fetch khandan: " + error.message,
    });
  }
};

// API to get a specific khandan by khandanid
const getKhandanByKhandanId = async (req, res) => {
  try {
    const { khandanid } = req.params;

    if (!khandanid) {
      return res.json({
        success: false,
        message: "Khandan ID is required",
      });
    }

    const khandan = await khandanModel.findOne({ khandanid: khandanid });

    if (!khandan) {
      return res.json({
        success: false,
        message: "Khandan not found",
      });
    }

    res.json({
      success: true,
      message: "Khandan fetched successfully",
      khandan: khandan,
    });
  } catch (error) {
    console.error("Error fetching khandan:", error);
    res.json({
      success: false,
      message: "Failed to fetch khandan: " + error.message,
    });
  }
};

// API to create a new khandan (admin only)
const createKhandan = async (req, res) => {
  try {
    const { name, gotra, contact, address } = req.body;

    // Validate required fields
    if (!name) {
      return res.json({
        success: false,
        message: "Khandan name is required",
      });
    }

    if (!gotra) {
      return res.json({
        success: false,
        message: "Gotra is required",
      });
    }

    // Check if khandan already exists by name
    const existingKhandan = await khandanModel.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });

    if (existingKhandan) {
      return res.json({
        success: false,
        message: "Khandan with this name already exists",
      });
    }

    // Generate next khandanid
    const khandanid = await generateNextKhandanId();

    // Create new khandan
    const newKhandan = new khandanModel({
      khandanid,
      name,
      gotra,
      contact: contact || {
        mobileno: {
          code: "+91",
          number: "0000000000",
        },
      },
      address: address || {
        currlocation: "",
        country: "",
        state: "",
        district: "",
        city: "",
        postoffice: "",
        pin: "",
        landmark: "",
        street: "",
        apartment: "",
        floor: "",
        room: "",
      },
    });

    const savedKhandan = await newKhandan.save();

    res.json({
      success: true,
      message: "Khandan created successfully",
      khandan: savedKhandan,
    });
  } catch (error) {
    console.error("Error creating khandan:", error);
    res.json({
      success: false,
      message: "Failed to create khandan: " + error.message,
    });
  }
};

// API to update a khandan (admin only)
const updateKhandan = async (req, res) => {
  try {
    const { khandanId } = req.params;
    const { name, gotra, contact, address } = req.body;

    if (!khandanId) {
      return res.json({
        success: false,
        message: "Khandan ID is required",
      });
    }

    // Check if khandan exists
    const existingKhandan = await khandanModel.findById(khandanId);
    if (!existingKhandan) {
      return res.json({
        success: false,
        message: "Khandan not found",
      });
    }

    // If name is being updated, check for duplicates
    if (name && name !== existingKhandan.name) {
      const duplicateKhandan = await khandanModel.findOne({
        name: { $regex: new RegExp(`^${name}$`, "i") },
        _id: { $ne: khandanId }, // Exclude current khandan
      });

      if (duplicateKhandan) {
        return res.json({
          success: false,
          message: "Khandan with this name already exists",
        });
      }
    }

    // Prepare update data (khandanid should not be updated)
    const updateData = {};
    if (name) updateData.name = name;
    if (gotra) updateData.gotra = gotra;
    if (contact)
      updateData.contact = { ...existingKhandan.contact, ...contact };
    if (address)
      updateData.address = { ...existingKhandan.address, ...address };

    // Update khandan
    const updatedKhandan = await khandanModel.findByIdAndUpdate(
      khandanId,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Khandan updated successfully",
      khandan: updatedKhandan,
    });
  } catch (error) {
    console.error("Error updating khandan:", error);
    res.json({
      success: false,
      message: "Failed to update khandan: " + error.message,
    });
  }
};

// API to delete a khandan (admin only)
const deleteKhandan = async (req, res) => {
  try {
    const { khandanId } = req.params;

    if (!khandanId) {
      return res.json({
        success: false,
        message: "Khandan ID is required",
      });
    }

    const deletedKhandan = await khandanModel.findByIdAndDelete(khandanId);

    if (!deletedKhandan) {
      return res.json({
        success: false,
        message: "Khandan not found",
      });
    }

    res.json({
      success: true,
      message: "Khandan deleted successfully",
      deletedKhandan: {
        khandanid: deletedKhandan.khandanid,
        name: deletedKhandan.name,
        gotra: deletedKhandan.gotra,
      },
    });
  } catch (error) {
    console.error("Error deleting khandan:", error);
    res.json({
      success: false,
      message: "Failed to delete khandan: " + error.message,
    });
  }
};

export {
  getAllKhandans,
  getKhandanList,
  getKhandanCount,
  getKhandanById,
  getKhandanByKhandanId,
  createKhandan,
  updateKhandan,
  deleteKhandan,
};
