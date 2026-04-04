const mongoose = require("mongoose");

let isConnected = false;

async function connectDb(mongoUri) {
  if (!mongoUri) {
    throw new Error("MONGO_URI is missing. Set it in your environment variables.");
  }

  if (isConnected) return mongoose.connection;

  mongoose.set("strictQuery", true);

  await mongoose.connect(mongoUri, {
    autoIndex: true
  });

  isConnected = true;
  return mongoose.connection;
}

module.exports = { connectDb };

