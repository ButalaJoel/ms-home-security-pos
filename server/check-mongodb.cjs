
require("dotenv").config();

const { MongoClient } = require("mongodb");

async function main() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("RESULT: MONGODB_URI is missing.");
    process.exitCode = 1;
    return;
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  try {
    console.log("Testing MongoDB connection...");

    await client.connect();

    console.log("Connection established. Testing database ping...");

    await client
      .db(process.env.DB_NAME || "ms_home_security_pos")
      .command({ ping: 1 });

    console.log("RESULT: SUCCESS — MongoDB connection and ping both work.");
  } catch (error) {
    console.error("RESULT: CONNECTION FAILED");
    console.error("Error name:", error.name);
    console.error("Error code:", error.code || "Not provided");
    console.error("Error message:", error.message);
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error("Unexpected diagnostic error:", error.message);
  process.exitCode = 1;
});
