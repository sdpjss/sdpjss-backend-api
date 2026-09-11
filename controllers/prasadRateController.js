import prasadRateModel from "../models/PrasadRateModel.js";

const parseYear = (value) => {
  const year = Number(value ?? new Date().getFullYear());
  return Number.isInteger(year) && year >= 1900 && year <= 9999 ? year : null;
};

const getPrasadRate = async (req, res) => {
  try {
    const year = parseYear(req.query.year);
    if (!year) {
      return res.status(400).json({ success: false, message: "Invalid year" });
    }

    const rate = await prasadRateModel
      .findOne({ year: { $lte: year } })
      .sort({ year: -1 })
      .lean();

    const normalizedRate = rate
      ? {
          ...rate,
          rupeesPer100Grams:
            rate.rupeesPer100Grams ||
            (rate.gramsPerRupee ? 100 / rate.gramsPerRupee : null),
          minimumPrasadGrams: rate.minimumPrasadGrams || 0,
          minimumCourierDonationAmount:
            rate.minimumCourierDonationAmount ?? 1210,
        }
      : null;
    return res.json({
      success: true,
      rate: normalizedRate,
      requestedYear: year,
      isFallback: Boolean(rate && rate.year !== year),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const upsertPrasadRate = async (req, res) => {
  try {
    const year = parseYear(req.body.year);
    const rupeesPer100Grams = Number(req.body.rupeesPer100Grams);
    const minimumPrasadGrams = Number(req.body.minimumPrasadGrams || 0);
    const minimumCourierDonationAmount = Number(
      req.body.minimumCourierDonationAmount
    );
    const roundingUnitGrams = Number(req.body.roundingUnitGrams || 1);
    if (
      !year ||
      !Number.isFinite(rupeesPer100Grams) ||
      rupeesPer100Grams <= 0 ||
      !Number.isFinite(minimumPrasadGrams) ||
      !Number.isInteger(minimumPrasadGrams) ||
      minimumPrasadGrams < 0 ||
      !Number.isFinite(minimumCourierDonationAmount) ||
      minimumCourierDonationAmount < 0 ||
      !Number.isFinite(roundingUnitGrams) ||
      !Number.isInteger(roundingUnitGrams) ||
      roundingUnitGrams < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Year, a positive price per 100 grams, non-negative Prasad and courier minimums, and a rounding unit of at least 1 gram are required.",
      });
    }

    const rate = await prasadRateModel.findOneAndUpdate(
      { year },
      {
        $set: {
          year,
          rupeesPer100Grams,
          minimumPrasadGrams,
          minimumCourierDonationAmount,
          roundingUnitGrams,
        },
        $unset: { gramsPerRupee: 1 },
      },
      { new: true, upsert: true, runValidators: true }
    );
    return res.json({ success: true, message: "Prasad rate saved", rate });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export { getPrasadRate, upsertPrasadRate };
