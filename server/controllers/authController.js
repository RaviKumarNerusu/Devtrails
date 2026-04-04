const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/responseHandler");
const { registerUser, loginUser } = require("../services/authService");

const register = asyncHandler(async (req, res) => {
  const { name, email, password, city, pincode, rainThresholdMm } = req.body || {};
  const result = await registerUser({ name, email, password, city, pincode, rainThresholdMm });
  return sendSuccess(res, result, "User registered successfully", 201);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const result = await loginUser({ email, password });
  return sendSuccess(res, result, "Login successful");
});

module.exports = { register, login };


