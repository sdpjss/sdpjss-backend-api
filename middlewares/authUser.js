import jwt from "jsonwebtoken";

//user authentication middleware..
const authUser = async (req, res, next) => {
  try {
    const { utoken } = req.headers;
    if (!utoken) {
      return res.json({
        success: false,
        message: "Not Authorized User, Login Again",
      });
    }
    const token_decode = jwt.verify(utoken, process.env.JWT_SECRET);

    req.body.userId = token_decode.id;

    next();
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

export default authUser;
