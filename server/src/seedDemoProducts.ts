
/**
 * MS Home Security POS
 * Seeds the initial demo catalogue into MongoDB.
 *
 * Run from the server folder:
 * npm.cmd run seed:products
 *
 * Existing SKUs are preserved, so rerunning this script
 * will not reset prices or stock that you have already changed.
 */

import "dotenv/config";
import { connectToDatabase } from "./db.js";

const demoProducts = [
  {
    name: "Hikvision 4MP ColorVu Dome Camera",
    sku: "CAM-HIK-4CV",
    category: "CCTV Cameras",
    brand: "Hikvision",
    costPrice: 280000,
    sellingPrice: 385000,
    quantity: 18,
    reorderLevel: 5,
  },
  {
    name: "Dahua 8-Channel XVR Recorder",
    sku: "DVR-DAH-8CH",
    category: "DVR & NVR Systems",
    brand: "Dahua",
    costPrice: 420000,
    sellingPrice: 575000,
    quantity: 7,
    reorderLevel: 3,
  },
  {
    name: "ZKTeco F18 Biometric Terminal",
    sku: "ACC-ZKT-F18",
    category: "Access Control",
    brand: "ZKTeco",
    costPrice: 510000,
    sellingPrice: 690000,
    quantity: 3,
    reorderLevel: 5,
  },
  {
    name: "Seagate SkyHawk 2TB Surveillance HDD",
    sku: "HDD-SKY-2TB",
    category: "Storage Devices",
    brand: "Seagate",
    costPrice: 255000,
    sellingPrice: 330000,
    quantity: 0,
    reorderLevel: 4,
  },
  {
    name: "Cat6 Outdoor Network Cable — 305m",
    sku: "NET-CAT6-305",
    category: "Networking Equipment",
    brand: "Giganet",
    costPrice: 390000,
    sellingPrice: 485000,
    quantity: 11,
    reorderLevel: 4,
  },
  {
    name: "12V 10A CCTV Power Supply Box",
    sku: "PWR-12V-10A",
    category: "Power Supplies",
    brand: "SecuPower",
    costPrice: 95000,
    sellingPrice: 145000,
    quantity: 4,
    reorderLevel: 5,
  },
  {
    name: "Tuya Wi-Fi Smart Door Lock",
    sku: "LCK-TYA-WF1",
    category: "Smart Locks",
    brand: "Tuya",
    costPrice: 480000,
    sellingPrice: 650000,
    quantity: 9,
    reorderLevel: 3,
  },
  {
    name: "Motorola T82 Extreme Twin Pack",
    sku: "WKT-MOT-T82",
    category: "Walkie-talkies",
    brand: "Motorola",
    costPrice: 620000,
    sellingPrice: 790000,
    quantity: 6,
    reorderLevel: 2,
  },
];

async function seedProducts() {
  const db = await connectToDatabase();
  const products = db.collection("products");
  const now = new Date();

  // A unique SKU prevents two catalogue entries representing
  // the same product. This index also protects against duplicates
  // from concurrent requests or future scripts.
  await products.createIndex({ sku: 1 }, { unique: true });

  let inserted = 0;
  let skipped = 0;

  for (const product of demoProducts) {
    const existing = await products.findOne({ sku: product.sku });

    if (existing) {
      console.log(`Skipped existing SKU: ${product.sku}`);
      skipped++;
      continue;
    }

    await products.insertOne({
      ...product,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    inserted++;
    console.log(`Added: ${product.name}`);
  }

  console.log("\nProduct seeding complete.");
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Catalogue size: ${await products.countDocuments()}`);

  process.exitCode = 0;
}

seedProducts().catch((error) => {
  console.error("Product seeding failed:", error);
  process.exitCode = 1;
});
