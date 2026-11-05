// Catalogue fixes agreed with management:
//   Skimmex      -> 20 kg sack, coverage 1 kg per half square metre
//   Aquaphob     -> Part A 20 kg sack + Part B 5 L jerrycan
//   Epoxy Self Levelling -> 3 L kit: base 2 L + hardener 1 L
//   "Industrial Coatings" -> "Industrial / Protective Coatings" everywhere it appears as a title
// Run from the project root:  node fix-catalogue.mjs
// Edits: src/data/products.catalogue.js and any src file that contains the exact words "Industrial Coatings".
// Writes nothing if any check fails. Undo: git checkout .
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const FILE = "src/data/products.catalogue.js";
const problems = [], report = [];
if (!fs.existsSync(FILE)) { console.log("\nNothing was changed. Cannot find " + FILE); process.exit(1); }

const original = fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
const mod = await import(pathToFileURL(path.resolve(FILE)).href + "?v=" + Date.now());
const data = { CATEGORIES: structuredClone(mod.CATEGORIES), PRODUCTS: structuredClone(mod.PRODUCTS) };

// Only the CATEGORIES and PRODUCTS blocks are rewritten; comments and everything else stay exactly as they are.
// Safety: each block must round-trip exactly, otherwise it has been hand-edited and rewriting could lose changes.
const region = name => {
  const open = "export const " + name + " = ";
  const a = original.indexOf("\n" + open) + 1;
  if (a === 0) return null;
  const close = original[a + open.length] === "[" ? "\n];" : "\n};";
  const b = original.indexOf(close, a);
  return b === -1 ? null : { a, b: b + close.length };
};
const regions = {};
for (const name of ["CATEGORIES", "PRODUCTS"]) {
  const r = region(name);
  if (!r) { problems.push("Could not find " + name + " in " + FILE); continue; }
  regions[name] = r;
  if (original.slice(r.a, r.b) !== "export const " + name + " = " + JSON.stringify(data[name], null, 2) + ";") problems.push(name + " in " + FILE + " has been hand-edited in a way this script cannot safely rewrite. Send the file to Claude.");
}

const find = id => data.PRODUCTS.find(p => p.id === id);
const setSize = (p, size, coverage) => { p.packSizes = [size]; p.sizes = [{ size, coverage }]; if (coverage !== undefined) p.coverage = coverage; };

const sk = find("skimmex");
if (!sk) problems.push("Skimmex not found"); else if (sk.packSizes.join() === "20kg") problems.push("Skimmex already says 20kg (already fixed?)"); else { setSize(sk, "20kg", "1kg/0.5 Sqm"); report.push("Skimmex: 20kg sack, coverage 1kg/0.5 Sqm"); }

const aq = find("aquaphob");
if (!aq) problems.push("Aquaphob not found"); else { setSize(aq, "Part A 20kg sack + Part B 5L jerrycan", aq.coverage); aq.kit = true; report.push("Aquaphob: Part A 20kg sack + Part B 5L jerrycan"); }

const ep = find("epoxy-self-levelling");
if (!ep) problems.push("Epoxy Self Levelling not found"); else { setSize(ep, "Base 2L + Hardener 1L", ep.coverage); ep.kit = true; report.push("Epoxy Self Levelling: 3L kit, Base 2L + Hardener 1L (coverage figure unchanged, still to be confirmed)"); }

const ind = data.CATEGORIES.industrial;
if (!ind) problems.push("Industrial category not found"); else if (ind.label === "Industrial / Protective Coatings") problems.push("Category already renamed"); else { ind.label = "Industrial / Protective Coatings"; report.push('Category label: "Industrial / Protective Coatings"'); }

// Rename the visible title wherever it appears in the code.
const hits = {}, edits = {};
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(jsx?|css)$/.test(e.name) ? [path.join(dir, e.name)] : []);
for (const f of walk("src")) {
  if (path.resolve(f) === path.resolve(FILE)) continue;
  const t = fs.readFileSync(f, "utf8");
  const n = t.split("Industrial Coatings").length - 1;
  if (n) { hits[f] = n; edits[f] = t.split("Industrial Coatings").join("Industrial / Protective Coatings"); }
}
try {
  const esbuild = createRequire(import.meta.url)("esbuild");
  for (const [f, c] of Object.entries(edits)) { try { esbuild.transformSync(c, { loader: f.endsWith(".css") ? "css" : "jsx" }); } catch (e) { problems.push("Syntax problem in " + f + ": " + String(e.message).split("\n")[0]); } }
} catch { report.push("esbuild not found, so no syntax check here; run npx eslint src afterwards"); }

if (problems.length) { console.log("\nNothing was changed. Problems:"); problems.forEach(p => console.log("  - " + p)); process.exit(1); }
{
  let out = original;
  for (const name of ["PRODUCTS", "CATEGORIES"].sort((x, y) => regions[y].a - regions[x].a)) out = out.slice(0, regions[name].a) + "export const " + name + " = " + JSON.stringify(data[name], null, 2) + ";" + out.slice(regions[name].b);
  fs.writeFileSync(FILE, out);
}
for (const [f, c] of Object.entries(edits)) fs.writeFileSync(f, c);
console.log("\nDone.");
report.forEach(r => console.log("  - " + r));
for (const [f, n] of Object.entries(hits)) console.log("  - Renamed " + n + " title(s) in " + f);
console.log("\nCheck by eye: the Skimmex mixing note still says 6-8 kgs of water per bag. Confirm the water amount for a 20 kg sack with the factory.");
console.log("\nNext:\n  1. npx eslint src\n  2. npm run dev and look at Skimmex, Aquaphob, Epoxy Self Levelling and the Industrial / Protective menu\nUndo anytime with:  git checkout .");
