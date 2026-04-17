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
  // User A: below threshold, then above threshold
  { name: "Pune", rain: { "1h": 2 }, weather: [{ main: "Clouds" }] },
  { name: "Pune", rain: { "1h": 20 }, weather: [{ main: "Rain" }] },
  // User B: repeated same-day checks (mix of below/above)
  { name: "Mumbai", rain: { "1h": 1 }, weather: [{ main: "Clouds" }] },
  { name: "Mumbai", rain: { "1h": 8 }, weather: [{ main: "Rain" }] },
  { name: "Mumbai", rain: { "1h": 0 }, weather: [{ main: "Clouds" }] }
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

  return { status: response.status, data };
}

async function registerUser(baseUrl, payload) {
  const response = await request(baseUrl, "POST", "/auth/register", null, payload);
  const token = response.data?.data?.token || response.data?.token;
  const userId = response.data?.data?.user?.id || response.data?.data?.user?._id;
  return { token, userId, payload };
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

  const cleanup = {
    userIds: [],
    emails: []
  };

  try {
    // Case 1: new user without city/profile completion should fail gracefully
    const userNoCity = await registerUser(baseUrl, {
      name: "No City User",
      email: `nocity-${suffix}@example.com`,
      password: "Passw0rd!"
    });
    cleanup.userIds.push(userNoCity.userId);
    cleanup.emails.push(userNoCity.payload.email);

    const autoNoCity = await request(baseUrl, "POST", "/claim/auto", userNoCity.token, {}, 400);
    assert.strictEqual(autoNoCity.data?.errorCode, "PARTNER_PROFILE_INCOMPLETE");

    // Case 2: new user with profile but no policy should be blocked from claim creation
    const userProfileNoPolicy = await registerUser(baseUrl, {
      name: "Profile No Policy",
      email: `profile-nopolicy-${suffix}@example.com`,
      password: "Passw0rd!",
      city: "Pune",
      rainThresholdMm: 10
    });
    cleanup.userIds.push(userProfileNoPolicy.userId);
    cleanup.emails.push(userProfileNoPolicy.payload.email);

    const autoProfileNoPolicy = await request(baseUrl, "POST", "/claim/auto", userProfileNoPolicy.token, {}, 400);
    assert.strictEqual(autoProfileNoPolicy.data?.errorCode, "NO_ACTIVE_POLICY");

    // Activate policy explicitly and retry claim flow
    const policyActivated = await request(baseUrl, "POST", "/policy/create", userProfileNoPolicy.token, {
      coverageHours: 24,
      location: "Pune",
      isActive: true
    });
    assert.strictEqual(policyActivated.data?.policy?.isActive, true);

    const autoAfterPolicy = await request(baseUrl, "POST", "/claim/auto", userProfileNoPolicy.token, {});
    assert.strictEqual(autoAfterPolicy.data.success, true);
    assert.ok(["not_eligible", "eligible", "pending_approval"].includes(autoAfterPolicy.data.status));
    assert.ok(autoAfterPolicy.data.claim?._id);

    const autoProfileSecond = await request(baseUrl, "POST", "/claim/auto", userProfileNoPolicy.token, {});
    assert.strictEqual(autoProfileSecond.data.success, true);
    assert.ok(["not_eligible", "eligible", "pending_approval"].includes(autoProfileSecond.data.status));
    assert.strictEqual(autoProfileSecond.data.claim._id, autoAfterPolicy.data.claim._id);

    const policyCreated = await Policy.findOne({ userId: userProfileNoPolicy.userId, isActive: true }).lean();
    assert.ok(policyCreated, "Expected active policy after explicit policy activation");

    // Case 3: repeated calls same day must not create duplicates
    const userMultiCall = await registerUser(baseUrl, {
      name: "Multi Call User",
      email: `multicall-${suffix}@example.com`,
      password: "Passw0rd!",
      city: "Mumbai",
      rainThresholdMm: 5
    });
        await request(baseUrl, "POST", "/policy/create", userMultiCall.token, {
          coverageHours: 24,
          location: "Mumbai",
          isActive: true
        });

    cleanup.userIds.push(userMultiCall.userId);
    cleanup.emails.push(userMultiCall.payload.email);

    const [call1, call2, call3] = await Promise.all([
      request(baseUrl, "POST", "/claim/auto", userMultiCall.token, {}),
      request(baseUrl, "POST", "/claim/auto", userMultiCall.token, {}),
      request(baseUrl, "POST", "/claim/auto", userMultiCall.token, {})
    ]);

    assert.ok(call1.data.claim?._id);
    assert.ok(call2.data.claim?._id);
    assert.ok(call3.data.claim?._id);

    const multiClaimCount = await Claim.countDocuments({ userId: userMultiCall.userId });
    assert.strictEqual(multiClaimCount, 1, "Expected exactly one claim per day for repeated calls");

    // Case 4: insurer endpoint visibility and auth
    const insurerUser = await registerUser(baseUrl, {
      name: "Insurer",
      email: `insurer-${suffix}@example.com`,
      password: "Passw0rd!",
      city: "Delhi"
    });
    cleanup.userIds.push(insurerUser.userId);
    cleanup.emails.push(insurerUser.payload.email);

    await User.updateOne({ _id: insurerUser.userId }, { $set: { role: "insurer" } });

    // Partner should not access insurer endpoint
    const partnerForbidden = await request(baseUrl, "GET", "/claim/all?page=1&limit=10", userMultiCall.token, null, 403);
    assert.strictEqual(partnerForbidden.data?.errorCode, "INSURER_ACCESS_REQUIRED");

    // Insurer should see full claim history (eligible + not_eligible)
    const insurerClaims = await request(baseUrl, "GET", "/claim/all?page=1&limit=50", insurerUser.token, null, 200);
    assert.strictEqual(insurerClaims.data.success, true);
    assert.ok(Array.isArray(insurerClaims.data.claims));
    assert.ok(insurerClaims.data.claims.length >= 2, "Expected insurer endpoint to return multiple claims");

    const statusSet = new Set(insurerClaims.data.claims.map((c) => c.status));
    assert.ok(statusSet.size >= 1, "Expected claim history to contain at least one status");
    assert.ok(
      [...statusSet].some((s) => ["eligible", "pending_approval", "approved", "not_eligible", "claimed", "rejected"].includes(s)),
      "Expected claim history to include valid lifecycle statuses"
    );

    console.log("CLAIM_LIFECYCLE_EXTENDED_SMOKE_OK");
  } finally {
    await Promise.all([
      cleanup.userIds.length ? Claim.deleteMany({ userId: { $in: cleanup.userIds } }) : Promise.resolve(),
      cleanup.userIds.length ? Policy.deleteMany({ userId: { $in: cleanup.userIds } }) : Promise.resolve(),
      cleanup.userIds.length ? PartnerProfile.deleteMany({ userId: { $in: cleanup.userIds } }) : Promise.resolve(),
      cleanup.emails.length ? User.deleteMany({ email: { $in: cleanup.emails } }) : Promise.resolve()
    ]).catch(() => {});

    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
