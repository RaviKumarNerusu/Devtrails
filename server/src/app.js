const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { notFound, errorHandler } = require("../middleware/errorMiddleware");

const authRoutes = require("../routes/authRoutes");
const weatherRoutes = require("../routes/weatherRoutes");
const historyRoutes = require("../routes/historyRoutes");
const favoriteRoutes = require("../routes/favoriteRoutes");
const partnerRoutes = require("../routes/partnerRoutes");
const compensationRoutes = require("../routes/compensationRoutes");
const planRoutes = require("../routes/planRoutes");
const supportRoutes = require("../routes/supportRoutes");
const policyRoutes = require("../routes/policyRoutes");
const claimRoutes = require("../routes/claimRoutes");
const premiumRoutes = require("../routes/premiumRoutes");
const triggerRoutes = require("../routes/triggerRoutes");
const paymentRoutes = require("../routes/paymentRoutes");
const dashboardRoutes = require("../routes/dashboardRoutes");
const adminRoutes = require("../routes/adminRoutes");
const chatbotRoutes = require("../routes/chatbotRoutes");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(morgan("dev"));

  /**
   * Health check endpoint
   */
  app.get("/api/health", (req, res) => {
    res.json({
      success: true,
      data: { service: "smart-weather-dashboard-server" },
      message: "OK"
    });
  });

  /**
   * API Routes
   */
  app.use("/api/auth", authRoutes);
  app.use("/api/weather", weatherRoutes);
  app.use("/api/history", historyRoutes);
  app.use("/api/favorite", favoriteRoutes);
  app.use("/api/partner", partnerRoutes);
  app.use("/api/compensation", compensationRoutes);
  app.use("/api/plan", planRoutes);
  app.use("/api/support", supportRoutes);
  app.use("/api/policy", policyRoutes);
  app.use("/api/claim", claimRoutes); // Production-grade claim automation
  app.use("/api/premium", premiumRoutes);
  app.use("/api/trigger", triggerRoutes);
  app.use("/api/payment", paymentRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/chatbot", chatbotRoutes);

  /**
   * Error handling middleware (must be last)
   */
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

