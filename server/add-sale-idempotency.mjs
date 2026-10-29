import fs from "node:fs";

const file = "./src/index.ts";
let source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

function replaceOnce(input, search, replacement, label) {
  const first = input.indexOf(search);
  if (first < 0 || input.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Cannot uniquely find ${label}. No changes written.`);
  }
  return input.slice(0, first) + replacement + input.slice(first + search.length);
}

const original = source;

source = replaceOnce(
  source,
  'app.post("/api/sales", async (req: Request, res: Response) => {\n  const session = client.startSession();\n\n  try {\n    const items = req.body?.items as SaleItemInput[] | undefined;',
  'app.post("/api/sales", async (req: Request, res: Response) => {\n  const session = client.startSession();\n\n  try {\n    const clientSaleId = typeof req.body?.clientSaleId === "string" ? req.body.clientSaleId.trim() : "";\n    if (clientSaleId.length > 120) {\n      res.status(400).json({ success: false, message: "Invalid sale request ID." });\n      return;\n    }\n    const items = req.body?.items as SaleItemInput[] | undefined;',
  "sales endpoint start"
);

source = replaceOnce(
  source,
  '    const sales = db.collection("sales");\n    const now = new Date();',
  '    const sales = db.collection("sales");\n\n    // Return the original result when a checkout is retried with the same ID.\n    if (clientSaleId) {\n      const existing = await sales.findOne({ clientSaleId });\n      if (existing) {\n        res.status(200).json({\n          success: true,\n          message: "Sale was already completed.",\n          sale: { ...existing, id: String(existing._id), _id: String(existing._id) },\n        });\n        return;\n      }\n    }\n\n    const now = new Date();',
  "sales collection"
);

source = replaceOnce(
  source,
  "      const saleDocument = {\n  receiptNumber,",
  "      const saleDocument = {\n  ...(clientSaleId ? { clientSaleId } : {}),\n  receiptNumber,",
  "sale document"
);

source = replaceOnce(
  source,
  '    const db = await connectToDatabase();\n\n    configureAuthDatabase(db);',
  '    const db = await connectToDatabase();\n    await db.collection("sales").createIndex({ clientSaleId: 1 }, { unique: true, sparse: true });\n\n    configureAuthDatabase(db);',
  "server startup"
);

if (source === original) throw new Error("No changes were produced.");

const backup = file + ".before-idempotency.bak";
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
fs.writeFileSync(file, source, "utf8");

console.log("Added basic sale request ID support.");
console.log("Backup:", backup);
console.log("Next: build and test before enabling offline checkout.");
