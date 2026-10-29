import fs from "node:fs";
import path from "node:path";

const target = path.resolve("server/src/index.ts");

if (!fs.existsSync(target)) {
  console.error("Cannot find server/src/index.ts. Run from the project root.");
  process.exit(1);
}

let source = fs.readFileSync(target, "utf8");
const original = source;
const changes = [];

function addAdminGuard(label, regex, replacement) {
  const matches = [...source.matchAll(regex)];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected one matching route; found ${matches.length}. No file was changed.`);
  }
  source = source.replace(regex, replacement);
  changes.push(label);
}

addAdminGuard(
  "Settings updates",
  /app\.put\s*\(\s*("\/api\/settings")\s*,\s*requireAuth\s*,/g,
  (_m, route) => `app.put(\n  ${route},\n  requireAuth,\n  requireRole("admin"),`
);

addAdminGuard(
  "Logo uploads",
  /app\.post\s*\(\s*("\/api\/settings\/logo")\s*,\s*requireAuth\s*,\s*upload\.single\("logo"\)\s*,/g,
  (_m, route) => `app.post(\n  ${route},\n  requireAuth,\n  requireRole("admin"),\n  upload.single("logo"),`
);

for (const [method, route] of [
  ["post", "/api/products"],
  ["put", "/api/products/:id"],
  ["patch", "/api/products/:id"],
  ["delete", "/api/products/:id"]
]) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    String.raw`app\.${method}\s*\(\s*("${escaped}")\s*,\s*(?!requireAuth\s*,|requireRole\s*\()`,
    "g"
  );
  const matches = [...source.matchAll(regex)];

  if (matches.length > 1) {
    throw new Error(`${method.toUpperCase()} ${route}: multiple matching routes. No file was changed.`);
  }

  if (matches.length === 1) {
    source = source.replace(
      regex,
      (_m, routeText) =>
        `app.${method}(\n  ${routeText},\n  requireAuth,\n  requireRole("admin"),`
    );
    changes.push(`${method.toUpperCase()} ${route}`);
  }
}

if (source === original) {
  console.error("No changes made. Routes may already be guarded or differ from expected patterns.");
  process.exit(2);
}

const backup = `${target}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
fs.copyFileSync(target, backup);
fs.writeFileSync(target, source, "utf8");

console.log("Patch applied.");
console.log(`Backup: ${backup}`);
console.log(changes.join("\n"));
