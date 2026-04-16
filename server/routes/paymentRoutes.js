const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { createOrder, verifyPayment } = require("../controllers/paymentController");

const router = express.Router();

router.post("/razorpay/order", protect.required, createOrder);
router.post("/razorpay/verify", protect.required, verifyPayment);

module.exports = router;