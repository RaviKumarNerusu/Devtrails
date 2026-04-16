const crypto = require("crypto");
const Razorpay = require("razorpay");
const Payment = require("../models/Payment");
const { executeInTransaction } = require("../utils/transactionHelper");
const { activatePlanForUser, normalizePlan } = require("../services/planService");

const PLAN_LOOKUP = {
  lite: { name: "Lite Cover", pricePerWeek: 49 },
  standard: { name: "Standard Cover", pricePerWeek: 99 },
  max: { name: "Max Cover", pricePerWeek: 149 }
};

function getPlan(planIdOrName) {
  const normalized = normalizePlan(planIdOrName?.planId || planIdOrName?.selectedPlanId || planIdOrName?.name || planIdOrName);
  const id = normalized.key;
  return { id, ...PLAN_LOOKUP[id] };
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

    await Payment.create({
      userId: req.user._id,
      planId: plan.id,
      planName: plan.name,
      gateway: "razorpay",
      orderId: order.id,
      amount,
      currency: order.currency || "INR",
      status: "created",
      notes: {
        planId: plan.id,
        planName: plan.name,
        source: "devtrails"
      },
      gatewayResponse: order
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
    const requestPlan = getPlan(req.body || {});

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

    const result = await executeInTransaction(async (session) => {
      const payment = await Payment.findOneAndUpdate(
        { orderId: razorpay_order_id, userId: req.user._id },
        {
          $set: {
            paymentId: razorpay_payment_id,
            signature: razorpay_signature,
            status: "verified",
            verifiedAt: new Date(),
            paidAt: new Date(),
            planId: requestPlan.id,
            planName: requestPlan.name,
            gatewayResponse: {
              razorpay_order_id,
              razorpay_payment_id,
              razorpay_signature
            }
          }
        },
        { new: true, session }
      );

      if (!payment) {
        const error = new Error("Payment order not found");
        error.statusCode = 404;
        throw error;
      }

      const activation = await activatePlanForUser({
        userId: req.user._id,
        name: payment.planName,
        validTill: Date.now() + 7 * 24 * 60 * 60 * 1000,
        session
      });

      const activatedPayment = await Payment.findByIdAndUpdate(
        payment._id,
        {
          $set: {
            status: "activated",
            activatedAt: new Date(),
            gatewayResponse: {
              razorpay_order_id,
              razorpay_payment_id,
              razorpay_signature,
              planId: activation.plan.key,
              policyId: activation.policy?._id || null
            }
          }
        },
        { new: true, session }
      );

      return { payment: activatedPayment, activation };
    });

    res.json({
      success: true,
      data: {
        verified: true,
        payment: result.payment,
        profile: result.activation.profile,
        policy: result.activation.policy
      },
      message: "Payment verified and plan activated"
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrder,
  verifyPayment
};