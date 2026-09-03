import jwt from "jsonwebtoken";

//family authentication middleware..
const authFamily = async (req, res, next) => {
  try {
    const { token } = req.headers;
    if (!token) {
      return res.json({
        success: false,
        message: "Not Authorized Family Login Again",
      });
    }
    const token_decode = jwt.verify(token, process.env.JWT_SECRET);

    req.body.famId = token_decode.id;

    next();
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

export default authFamily;
