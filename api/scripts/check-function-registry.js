// src/index.ts is the package's `main`: the Functions host registers only what that file
// imports. A side-effect import is invisible to tsc — one naming a deleted module compiles
// clean, then the worker fails to load the entry point and the host registers ZERO
// functions. A whole API silently disappears with a green build.
//
// So the registry is checked here instead: every module under src/functions must be
// imported exactly once, and every import must name a module that exists.

const fs = require("node:fs");
const path = require("node:path");

const apiRoot = path.resolve(__dirname, "..");
const indexPath = path.join(apiRoot, "src", "index.ts");
const functionsDir = path.join(apiRoot, "src", "functions");

// Comment lines are stripped first, so the explanation above can name example imports
// without the checker treating them as real ones.
const source = fs
  .readFileSync(indexPath, "utf8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

const imported = [...source.matchAll(/import "\.\/functions\/([^"]+)"/g)].map((m) => m[1]);
const onDisk = fs
  .readdirSync(functionsDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.replace(/\.ts$/, ""));

const missing = onDisk.filter((f) => !imported.includes(f));
const phantom = imported.filter((i) => !onDisk.includes(i));
const duplicated = imported.filter((i, index) => imported.indexOf(i) !== index);

const problems = [];
if (missing.length) problems.push(`não importados em index.ts: ${missing.join(", ")}`);
if (phantom.length) problems.push(`importados mas inexistentes em src/functions: ${phantom.join(", ")}`);
if (duplicated.length) problems.push(`importados mais de uma vez: ${[...new Set(duplicated)].join(", ")}`);

if (problems.length) {
  console.error("Registro de funções inconsistente:");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nCorrija src/index.ts. Um import quebrado derruba TODAS as funções, não só a que falta.");
  process.exit(1);
}

console.log(`Registro de funções OK: ${onDisk.length} módulos, todos importados uma vez.`);
