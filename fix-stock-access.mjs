import fs from "node:fs";
import path from "node:path";

const target = path.resolve("server/src/index.ts");

if (!fs.existsSync(target)) {
  console.error("Cannot find server/src/index.ts.");
  process.exit(1);
}

let source = fs.readFileSync(target, "utf8");
const original = source;

if (!source.includes('import { requireAuth, requireRole } from "./authMiddleware.js";')) {
  console.error("Expected authentication middleware import was not found. No changes made.");
  process.exit(1);
}

// The products route group already applies requireAuth globally.
// Add only the administrator role check to the stock-adjustment write route.
const adjustmentRoute =
  /app\.post\(\s*("\/api\/products\/:id\/adjustments")\s*,\s*(?!requireRole\s*\()\s*async\s*\(/g;

const matches = [...source.matchAll(adjustmentRoute)];

if (matches.length !== 1) {
  console.error(
    `Expected exactly one unguarded stock-adjustment POST route; found ${matches.length}.`
  );
  console.error("No changes made. Review the route declaration before proceeding.");
  process.exit(1);
}

source = source.replace(
  adjustmentRoute,
  (_match, route) =>
    `app.post(\n  ${route},\n  requireRole("admin"),\n  async (`
);

// Correct the missing whitespace/newline introduced in two product handlers
// by the earlier installer. This changes formatting only.
source = source.replace(
  /requireRole\("admin"\),\s*async\s*\(/g,
  'requireRole("admin"),\n  async ('
);

if (source === original) {
  console.log("No changes required.");
  process.exit(0);
}

const backup =
  `${target}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;

fs.copyFileSync(target, backup);
fs.writeFileSync(target, source, "utf8");

console.log("Patch applied.");
console.log(`Backup created: ${backup}`);
console.log("Administrator-only stock adjustments added.");
console.log("Product handler formatting normalized.");
