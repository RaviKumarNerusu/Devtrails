const jwt = require("jsonwebtoken");
const User = require("../models/User");

function getTokenFromReq(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

async function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing. Set it in environment variables.");
  const decoded = jwt.verify(token, secret);
  const user = await User.findById(decoded.id).select("-password");
  return user || null;
}

const protect = {
  required: async (req, res, next) => {
    try {
      const token = getTokenFromReq(req);
      if (!token) {
        res.status(401);
        throw new Error("Not authorized, token missing");
      }
      const decodedUser = await verifyToken(token);
      if (!decodedUser) {
        res.status(401);
        throw new Error("Not authorized, invalid token");
      }
      req.user = decodedUser;
      next();
    } catch (err) {
      res.status(401);
      next(err);
    }
  },
  optional: async (req, res, next) => {
    try {
      const token = getTokenFromReq(req);
      if (!token) return next();
      const user = await verifyToken(token);
      if (user) req.user = user;
      next();
    } catch (err) {
      // optional auth should never block the request
      next();
    }
  },
  insurer: (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();
    if (role === "insurer" || role === "admin") {
      return next();
    }

    const err = new Error("Insurer access required");
    err.statusCode = 403;
    err.errorCode = "INSURER_ACCESS_REQUIRED";
    return next(err);
  }
};

module.exports = { protect };

