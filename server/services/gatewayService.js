function randomId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function simulateInstantPayout({ amount, gateway = "razorpay-sandbox" }) {
  const startedAt = Date.now();

  // Simulated gateway latency and success profile.
  await new Promise((resolve) => setTimeout(resolve, 120));

  const normalizedAmount = Number(amount) || 0;
  const success = normalizedAmount > 0;

  return {
    gateway,
    transactionId: randomId("tx"),
    status: success ? "success" : "failed",
    amount: normalizedAmount,
    processedAt: new Date(),
    latencyMs: Date.now() - startedAt
  };
}

module.exports = {
  simulateInstantPayout
};
