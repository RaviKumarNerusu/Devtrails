const jwt = require("jsonwebtoken");
const User = require("../models/User");
const PartnerProfile = require("../models/PartnerProfile");

function signToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is missing. Set it in environment variables.");
  }
  return jwt.sign({ id: userId }, secret, { expiresIn: "7d" });
}

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role || "partner",
    wallet_balance: Number(user?.wallet_balance || 0),
    risk_score: Number(user?.risk_score ?? user?.riskScore ?? 0)
  };
}

async function registerUser({ name, email, password, city, pincode, rainThresholdMm }) {
  if (!name || !email || !password) {
    const error = new Error("name, email, password are required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    const error = new Error("Email already registered");
    error.statusCode = 409;
    throw error;
  }

  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    password: String(password)
  });

  try {
    await PartnerProfile.findOneAndUpdate(
      { userId: user._id },
      {
        $setOnInsert: {
          userId: user._id,
          city: String(city || "").trim(),
          pincode: String(pincode || "").trim(),
          rainThresholdMm: Number.isFinite(Number(rainThresholdMm)) ? Number(rainThresholdMm) : 15,
          planStatus: "inactive"
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (profileError) {
    await User.deleteOne({ _id: user._id }).catch(() => {});
    const error = new Error("Failed to initialize partner profile");
    error.statusCode = 500;
    error.errorCode = "PARTNER_PROFILE_INIT_FAILED";
    throw error;
  }

  const token = signToken(user._id);
  return { user: sanitizeUser(user), token };
}

async function loginUser({ email, password }) {
  if (!email || !password) {
    const error = new Error("email and password are required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  const ok = await user.matchPassword(String(password));
  if (!ok) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  const token = signToken(user._id);
  return { user: sanitizeUser(user), token };
}

module.exports = {
  registerUser,
  loginUser
};

