const { activatePlanForUser } = require("../services/planService");

async function activatePlan(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401);
      throw new Error("Not authorized");
    }

    const { name, validTill } = req.body || {};

    if (!name || typeof name !== "string") {
      res.status(400);
      throw new Error("Plan name is required");
    }

    const validDate = validTill ? new Date(validTill) : null;
    if (!validDate || Number.isNaN(validDate.getTime())) {
      res.status(400);
      throw new Error("validTill is required and must be a valid date/timestamp");
    }

    const { profile, policy } = await activatePlanForUser({
      userId,
      name,
      validTill: validDate
    });

    res.json({ profile, policy });
  } catch (err) {
    next(err);
  }
}

module.exports = { activatePlan };

