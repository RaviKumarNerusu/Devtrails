const crypto = require("crypto");
const Razorpay = require("razorpay");

const PLAN_MAP = {
  lite: { name: "Lite Cover", pricePerWeek: 49 },
  standard: { name: "Standard Cover", pricePerWeek: 99 },
  max: { name: "Max Cover", pricePerWeek: 149 }
};

function normalizePlanId(value) {
  const key = String(value || "standard").trim().toLowerCase();
  return PLAN_MAP[key] ? key : "standard";
}

function getPlan(planIdOrName) {
  const id = normalizePlanId(planIdOrName);
  return { id, ...PLAN_MAP[id] };
}

function getClient() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    const error = new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
    error.statusCode = 500;
    throw error;
  }

  return new Razorpay({ key_id, key_secret });
}

async function createOrder(req, res, next) {
  try {
    const plan = getPlan(req.body?.planId || req.body?.selectedPlanId || req.body?.name);
    const amount = Math.round(Number(plan.pricePerWeek) * 100);
    const razorpay = getClient();
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `plan_${plan.id}_${Date.now()}`,
      notes: {
        planId: plan.id,
        planName: plan.name,
        source: "devtrails"
      }
    });

    res.json({
      success: true,
      data: {
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: order.id,
        amount,
        currency: order.currency,
        plan
      },
      message: "Razorpay order created"
    });
  } catch (err) {
    next(err);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400);
      throw new Error("Missing Razorpay payment verification fields");
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      res.status(500);
      throw new Error("Razorpay secret key is missing");
    }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      res.status(400);
      throw new Error("Invalid Razorpay signature");
    }

    res.json({
      success: true,
      data: {
        verified: true,
        razorpay_order_id,
        razorpay_payment_id
      },
      message: "Payment verified"
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrder,
  verifyPayment
};