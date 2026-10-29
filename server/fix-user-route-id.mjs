import fs from "node:fs";

const file = "src/userRoutes.ts";
let source = fs.readFileSync(file, "utf8");

const old = `    const { id } = req.params;
    if (!ObjectId.isValid(id)) {`;

const replacement = `    const paramId = req.params.id;
    const id = Array.isArray(paramId) ? paramId[0] : paramId;
    if (typeof id !== "string" || !ObjectId.isValid(id)) {`;

if (!source.includes(old)) {
  throw new Error("Expected ID-validation code was not found. No changes made.");
}

const backup = `${file}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
fs.copyFileSync(file, backup);
source = source.replace(old, replacement);
fs.writeFileSync(file, source, "utf8");

console.log("Fixed user ID validation.");
console.log(`Backup created: ${backup}`);
