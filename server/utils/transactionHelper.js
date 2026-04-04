/**
 * MongoDB transaction helper for atomic operations
 * Ensures claim creation and user stats updates are atomic
 */

const mongoose = require("mongoose");
const logger = require("./logger");

/**
 * Execute operation within a transaction
 * Automatically handles session creation and cleanup
 */
async function executeInTransaction(callback) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    logger.error("Transaction failed and rolled back", {
      error: error.message,
      code: error.code
    });
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Create claim atomically with user stats update
 */
async function createClaimWithUserUpdate(Claim, User, claimData, userStatsDelta) {
  return executeInTransaction(async (session) => {
    // Create claim
    const claim = await Claim.create([claimData], { session });

    if (!claim || claim.length === 0) {
      throw new Error("Failed to create claim");
    }

    // Update user stats
    const updateOp = { $set: {} };

    if (userStatsDelta.increment) {
      updateOp.$inc = userStatsDelta.increment;
    }

    if (userStatsDelta.set) {
      updateOp.$set = userStatsDelta.set;
    }

    const updatedUser = await User.findByIdAndUpdate(
      claimData.userId,
      updateOp,
      { new: true, session }
    );

    if (!updatedUser) {
      throw new Error("Failed to update user stats");
    }

    logger.info("Claim created with user stats update", {
      userId: claimData.userId.toString(),
      claimId: claim[0]._id.toString(),
      delta: userStatsDelta
    });

    return {
      claim: claim[0],
      user: updatedUser
    };
  });
}

/**
 * Update claim and user stats atomically (for status changes)
 */
async function updateClaimWithUserStats(Claim, User, claimId, claimUpdate, userStatsDelta) {
  return executeInTransaction(async (session) => {
    const updatedClaim = await Claim.findByIdAndUpdate(
      claimId,
      claimUpdate,
      { new: true, session }
    );

    if (!updatedClaim) {
      throw new Error("Claim not found");
    }

    const updateOp = {};
    if (userStatsDelta.increment) {
      updateOp.$inc = userStatsDelta.increment;
    }
    if (userStatsDelta.set) {
      updateOp.$set = userStatsDelta.set;
    }

    const updatedUser = await User.findByIdAndUpdate(
      updatedClaim.userId,
      updateOp,
      { new: true, session }
    );

    logger.info("Claim status updated with user stats", {
      claimId: claimId.toString(),
      userId: updatedClaim.userId.toString(),
      newStatus: updatedClaim.status
    });

    return {
      claim: updatedClaim,
      user: updatedUser
    };
  });
}

module.exports = {
  executeInTransaction,
  createClaimWithUserUpdate,
  updateClaimWithUserStats
};
