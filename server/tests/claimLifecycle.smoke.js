const assert = require("assert");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { connectDb } = require("../utils/connectDb");
const User = require("../models/User");
const Claim = require("../models/Claim");
const Policy = require("../models/Policy");
const PartnerProfile = require("../models/PartnerProfile");

const weatherModulePath = require.resolve("../services/openWeatherService");
const weatherSequence = [
  { name: "Bangalore", rain: { "1h": 0 }, weather: [{ main: "Clouds" }] },
  { name: "Bangalore", rain: { "1h": 0 }, weather: [{ main: "Clouds" }] },
  { name: "Bangalore", rain: { "1h": 10 }, weather: [{ main: "Rain" }] }
];
let weatherCallCount = 0;

require.cache[weatherModulePath] = {
  id: weatherModulePath,
  filename: weatherModulePath,
  loaded: true,
  exports: {
    fetchCurrentWeather: async () => {
      const next = weatherSequence[Math.min(weatherCallCount, weatherSequence.length - 1)];
      weatherCallCount += 1;
      return next;
    }
  }
};

const { createApp } = require("../src/app");

async function request(baseUrl, method, route, token, body, expectedStatus = null) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (expectedStatus && response.status !== expectedStatus) {
    throw new Error(`${method} ${route} -> expected ${expectedStatus}, got ${response.status}`);
  }

  if (!response.ok && !expectedStatus) {
    const message = data?.message || data?.error || text || `${method} ${route} failed`;
    throw new Error(`${method} ${route} -> ${response.status}: ${message}`);
  }

  return data;
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }

  await connectDb(process.env.MONGO_URI);

  const app = createApp();
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const email = `claim-smoke-${suffix}@example.com`;
  const password = "Passw0rd!";

  const cleanup = {
    userId: null,
    claimId: null
  };

  try {
    const register = await request(baseUrl, "POST", "/auth/register", null, {
      name: "Claim Smoke",
      email,
      password
    });

    const token = register?.data?.token || register?.token;
    assert.ok(token, "Register response did not include a token");
    cleanup.userId = register?.data?.user?.id || register?.data?.user?._id || null;

    const authHeaders = token;

    const profile = await request(baseUrl, "POST", "/partner/profile", authHeaders, {
      city: "Bangalore",
      pincode: "560001",
      avgDailyEarning: 1500,
      rainThresholdMm: 1
    });
    assert.strictEqual(profile?.profile?.city, "Bangalore");

    const policy = await request(baseUrl, "POST", "/policy/create", authHeaders, {
      coverageHours: 24,
      location: "Bangalore",
      isActive: true
    });
    assert.strictEqual(policy?.policy?.isActive, true);

    const firstAuto = await request(baseUrl, "POST", "/claim/auto", authHeaders, {});
    assert.strictEqual(firstAuto.status, "not_eligible");
    assert.ok(firstAuto.claim, "First auto response must include a claim");
    cleanup.claimId = firstAuto.claim._id;

    const afterFirstClaims = await request(baseUrl, "GET", "/claim/my", authHeaders);
    assert.strictEqual(afterFirstClaims.claims.length, 1, "Expected exactly one daily claim after first auto call");
    assert.strictEqual(afterFirstClaims.claims[0].status, "not_eligible");

    const secondAuto = await request(baseUrl, "POST", "/claim/auto", authHeaders, {});
    assert.strictEqual(secondAuto.status, "pending_approval");
    assert.strictEqual(secondAuto.claim._id, cleanup.claimId, "Expected the same claim document to be updated, not duplicated");

    const afterSecondClaims = await request(baseUrl, "GET", "/claim/my", authHeaders);
    assert.strictEqual(afterSecondClaims.claims.length, 1, "Expected a single claim document after update");
    assert.strictEqual(afterSecondClaims.claims[0].status, "pending_approval");

    const redeem = await request(baseUrl, "POST", "/claim/redeem", authHeaders, {
      claimId: cleanup.claimId
    }, 409);
    assert.strictEqual(redeem.errorCode, "MANUAL_REVIEW_REQUIRED");

    const afterRedeemAttemptClaims = await request(baseUrl, "GET", "/claim/my", authHeaders);
    assert.strictEqual(afterRedeemAttemptClaims.claims.length, 1, "Redeem attempt should not create duplicate claims");
    assert.strictEqual(afterRedeemAttemptClaims.claims[0].status, "pending_approval");

    const claimCount = await Claim.countDocuments({ userId: cleanup.userId });
    assert.strictEqual(claimCount, 1, "Database should contain exactly one claim for the day");

    console.log("CLAIM_LIFECYCLE_SMOKE_OK");
  } finally {
    if (cleanup.claimId) {
      await Claim.deleteMany({ _id: cleanup.claimId });
    }
    await Promise.all([
      cleanup.userId ? Policy.deleteMany({ userId: cleanup.userId }) : Promise.resolve(),
      cleanup.userId ? PartnerProfile.deleteMany({ userId: cleanup.userId }) : Promise.resolve(),
      User.deleteMany({ email })
    ]).catch(() => {});

    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
