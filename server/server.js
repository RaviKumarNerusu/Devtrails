require("dotenv").config();

const { createApp } = require("./src/app");
const { connectDb } = require("./config/db");
const { startClaimAutomationScheduler } = require("./services/claimAutomationScheduler");

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDb(process.env.MONGO_URI);
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startClaimAutomationScheduler();
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

