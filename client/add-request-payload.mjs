const fs = await import("node:fs");

const path = "src/db/database.ts";
const source = fs.readFileSync(path, "utf8");

if (/requestPayload\??:\s*Record<string,\s*unknown>/.test(source)) {
  console.log("requestPayload already exists. No changes needed.");
  process.exit(0);
}

const marker = "export interface LocalSale {";
const count = source.split(marker).length - 1;

if (count !== 1) {
  throw new Error("Expected one LocalSale declaration. No changes made.");
}

const updated = source.replace(
  marker,
  marker + "\n  // Exact checkout payload retained for safe retries.\n  requestPayload?: Record<string, unknown>;"
);

fs.copyFileSync(path, path + ".before-request-payload.bak");
fs.writeFileSync(path, updated, "utf8");

console.log("Added requestPayload to LocalSale.");
console.log("Backup created.");
