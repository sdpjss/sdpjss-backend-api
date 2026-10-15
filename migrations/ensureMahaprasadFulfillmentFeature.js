import featureModel from "../models/FeatureModel.js";

const FEATURE_LINK = "/mahaprasad-fulfillment";

const ensureMahaprasadFulfillmentFeature = async () => {
  const existingFeature = await featureModel.findOne({ link: FEATURE_LINK });

  if (!existingFeature) {
    await featureModel.create({
      featureName: "Mahaprasad Fulfilment",
      access: "admin",
      link: FEATURE_LINK,
      iconName: "donation_list",
      isActive: true,
    });
    console.log("Created Mahaprasad Fulfilment admin feature");
    return;
  }

  existingFeature.featureName = "Mahaprasad Fulfilment";
  existingFeature.access = "admin";
  existingFeature.iconName = "donation_list";
  await existingFeature.save();
};

export default ensureMahaprasadFulfillmentFeature;
