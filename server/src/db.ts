
import { MongoClient, type Db } from "mongodb";

// Read the MongoDB connection string from server/.env.
const uri = process.env.MONGODB_URI;

// Use the configured database name, or fall back to the project database.
const dbName = process.env.DB_NAME || "ms_home_security_pos";

// Stop the server from starting if the connection string is missing.
if (!uri) {
  throw new Error("MONGODB_URI is missing from server/.env");
}

// Export the client so the POS sales API can use MongoDB transactions.
// The same client is used for normal database queries and sales transactions.
export const client = new MongoClient(uri);

// Cache the database connection so we do not reconnect for every request.
let database: Db | null = null;

/**
 * Connects to MongoDB and returns the configured database.
 * Reuses the existing connection when one has already been established.
 */
export async function connectToDatabase(): Promise<Db> {
  if (database) {
    return database;
  }

  // Establish the connection to MongoDB.
  await client.connect();

  // Select the database used by the POS system.
  database = client.db(dbName);

  // Verify that MongoDB is responding before returning the database.
  await database.command({ ping: 1 });

  console.log(`Connected to MongoDB database: ${dbName}`);

  return database;
}
