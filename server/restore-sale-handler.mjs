const fs = await import("node:fs");

const path = "src/index.ts";
const backup = "src/index.ts.before-duplicate-recovery.bak";

if (!fs.existsSync(backup)) {
  throw new Error("Backup not found. No source files changed.");
}

let current = fs.readFileSync(path, "utf8");
const original = fs.readFileSync(backup, "utf8");

const badMarker = "    // IDEMPOTENCY_DUPLICATE_KEY_RECOVERY";
const messageMarker = '    const message = error instanceof Error ? error.message : "Unknown error";';

if (!current.includes(badMarker)) {
  console.log("Faulty recovery patch not found; no restoration needed.");
  process.exit(0);
}

const badStart = current.indexOf(badMarker);
const badEnd = current.indexOf(messageMarker, badStart);

if (badEnd < 0) {
  throw new Error("Could not safely identify the faulty patch. No changes made.");
}

current = current.slice(0, badStart) + current.slice(badEnd);

fs.writeFileSync(path, current, "utf8");
console.log("Removed the faulty recovery patch. Existing backup preserved.");
