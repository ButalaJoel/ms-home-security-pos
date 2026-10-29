const fs = await import("node:fs");

const path = "src/index.ts";
const source = fs.readFileSync(path, "utf8");
const marker = '    const message = error instanceof Error ? error.message : "Unknown error";';

if (source.includes("IDEMPOTENCY_DUPLICATE_KEY_RECOVERY")) {
  console.log("Recovery is already installed.");
  process.exit(0);
}

const count = source.split(marker).length - 1;

if (count !== 1) {
  throw new Error("Expected exactly one matching sale error handler. No source files changed.");
}

const replacement = [
  "    // IDEMPOTENCY_DUPLICATE_KEY_RECOVERY",
  "    // Recover the original sale if concurrent requests hit the unique index.",
  "    const mongoError = error as { code?: number };",
  "    if (mongoError?.code === 11000 && clientSaleId) {",
  "      try {",
  "        const existing = await sales.findOne({ clientSaleId });",
  "        if (existing) {",
  "          res.status(200).json({",
  "            success: true,",
  '            message: "Sale was already completed.",',
  "            sale: { ...existing, id: String(existing._id), _id: String(existing._id) },",
  "          });",
  "          return;",
  "        }",
  "      } catch (lookupError) {",
  '        console.error("Could not retrieve sale after duplicate-key conflict:", lookupError);',
  "      }",
  "    }",
  "",
  marker
].join("\n");

fs.copyFileSync(path, path + ".before-duplicate-recovery.bak");
fs.writeFileSync(path, source.replace(marker, replacement), "utf8");

console.log("Duplicate-key recovery installed. Backup created.");
