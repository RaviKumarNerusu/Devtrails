const Policy = require("../models/Policy");
const Claim = require("../models/Claim");
const User = require("../models/User");
const PartnerProfile = require("../models/PartnerProfile");
const { evaluateClaimEligibility } = require("./claimService");
const { getLocalDateOnly } = require("../utils/claimValidator");
const logger = require("../utils/logger");

let schedulerTimer = null;
let schedulerRunning = false;

const DEFAULT_SCAN_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_STARTUP_DELAY_MS = 5000;
const DEFAULT_BATCH_SIZE = 25;

function readNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function readBooleanEnv(name, fallback = true) {
  const value = process.env[name];
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return !(normalized === "false" || normalized === "0" || normalized === "off");
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function runClaimSweep() {
  if (schedulerRunning) {
    logger.debug("Claim scheduler skipped because previous run is still active");
    return;
  }

  schedulerRunning = true;
  const startedAt = Date.now();

  try {
    const today = getLocalDateOnly();

    const activePolicies = await Policy.find({ isActive: true }).select("userId").lean();
    const policyUserIds = Array.from(new Set(activePolicies.map((p) => String(p.userId)).filter(Boolean)));

    if (policyUserIds.length === 0) {
      logger.info("Claim scheduler run completed", {
        checkedUsers: 0,
        createdOrUpdatedClaims: 0,
        skippedUsers: 0,
        failedUsers: 0,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    const profiles = await PartnerProfile.find({
      userId: { $in: policyUserIds },
      city: { $exists: true, $ne: "" },
      planStatus: "active"
    })
      .select("userId city")
      .lean();

    const profileEligibleIds = Array.from(new Set(profiles.map((p) => String(p.userId)).filter(Boolean)));

    if (profileEligibleIds.length === 0) {
      logger.info("Claim scheduler run completed", {
        checkedUsers: policyUserIds.length,
        createdOrUpdatedClaims: 0,
        skippedUsers: policyUserIds.length,
        failedUsers: 0,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    const existingTodayClaims = await Claim.find({
      userId: { $in: profileEligibleIds },
      date: today
    })
      .select("userId")
      .lean();

    const alreadyDone = new Set(existingTodayClaims.map((c) => String(c.userId)));
    const pendingUserIds = profileEligibleIds.filter((id) => !alreadyDone.has(id));

    let createdOrUpdatedClaims = 0;
    let skippedUsers = policyUserIds.length - pendingUserIds.length;
    let failedUsers = 0;

    const batchSize = readNumberEnv("AUTO_CLAIM_SCHEDULER_BATCH_SIZE", DEFAULT_BATCH_SIZE);
    const batches = chunk(pendingUserIds, batchSize);

    for (const ids of batches) {
      const users = await User.find({ _id: { $in: ids } }).select("_id").lean();

      for (const user of users) {
        try {
          const result = await evaluateClaimEligibility(user);
          if (result?.claim) {
            createdOrUpdatedClaims += 1;
          } else {
            skippedUsers += 1;
          }
        } catch (error) {
          // Expected soft-fail paths are counted as skipped, not failed.
          if (error?.errorCode === "NO_ACTIVE_POLICY" || error?.errorCode === "PARTNER_PROFILE_INCOMPLETE") {
            skippedUsers += 1;
          } else {
            failedUsers += 1;
            logger.error("Claim scheduler evaluation failed", {
              userId: String(user._id),
              error: error.message,
              errorCode: error.errorCode || "SCHEDULER_EVAL_FAILED"
            });
          }
        }
      }
    }

    logger.info("Claim scheduler run completed", {
      checkedUsers: policyUserIds.length,
      createdOrUpdatedClaims,
      skippedUsers,
      failedUsers,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    logger.error("Claim scheduler run failed", {
      error: error.message,
      errorCode: error.errorCode || "SCHEDULER_RUN_FAILED",
      durationMs: Date.now() - startedAt
    });
  } finally {
    schedulerRunning = false;
  }
}

function startClaimAutomationScheduler() {
  if (!readBooleanEnv("AUTO_CLAIM_SCHEDULER_ENABLED", true)) {
    logger.info("Claim scheduler disabled by environment");
    return;
  }

  if (schedulerTimer) {
    return;
  }

  const scanIntervalMs = readNumberEnv("AUTO_CLAIM_SCAN_INTERVAL_MS", DEFAULT_SCAN_INTERVAL_MS);
  const startupDelayMs = readNumberEnv("AUTO_CLAIM_SCHEDULER_STARTUP_DELAY_MS", DEFAULT_STARTUP_DELAY_MS);

  setTimeout(() => {
    runClaimSweep().catch(() => {});
  }, startupDelayMs);

  schedulerTimer = setInterval(() => {
    runClaimSweep().catch(() => {});
  }, scanIntervalMs);

  logger.info("Claim scheduler started", {
    scanIntervalMs,
    startupDelayMs
  });
}

function stopClaimAutomationScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info("Claim scheduler stopped");
  }
}

module.exports = {
  startClaimAutomationScheduler,
  stopClaimAutomationScheduler,
  runClaimSweep
};
