const fs = await import("node:fs");

const path = "src/index.ts";
const backup = "src/index.ts.before-duplicate-recovery.bak";
let source = fs.readFileSync(path, "utf8");
const original = fs.readFileSync(backup, "utf8");

const badMarker = "    // IDEMPOTENCY_DUPLICATE_KEY_RECOVERY";
const errorMarker = '    const message = error instanceof Error ? error.message : "Unknown error";';

if (source.includes(badMarker)) {
  const start = source.indexOf(badMarker);
  const end = source.indexOf(errorMarker, start);

  if (end < 0) {
    throw new Error("Could not locate the end of the faulty patch. No changes made.");
  }

  source = source.slice(0, start) + source.slice(end);
}

if (source.includes(badMarker)) {
  throw new Error("Faulty patch remains. No changes made.");
}

const catchMarker = '  } catch (error) {\n    const message = error instanceof Error ? error.message : "Unknown error";';
const count = source.split(catchMarker).length - 1;

if (count !== 1) {
  throw new Error("Expected one sale catch block. No changes made.");
}

const replacement = [
  "  } catch (error) {",
  "    // IDEMPOTENCY_DUPLICATE_KEY_RECOVERY",
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
  "    const message = error instanceof Error ? error.message : \\"Unknown error\\";"
].join("\n");

fs.writeFileSync(path, source.replace(catchMarker, replacement), "utf8");
console.log("Moved recovery code into the sale endpoint catch block.");
