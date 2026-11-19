// Compile all contracts with solc-js. Writes artifacts/<Name>.json {abi, bytecode}.
// Usage: node compile.mjs
import solc from "solc";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = path.join(__dirname, "contracts");
const OUT_DIR = path.join(__dirname, "artifacts");

function findImports(importPath) {
  try {
    let full;
    if (importPath.startsWith("@openzeppelin/")) {
      full = path.join(__dirname, "node_modules", importPath);
    } else if (importPath.startsWith("./") || importPath.startsWith("../")) {
      full = path.resolve(CONTRACTS_DIR, importPath);
    } else {
      full = path.join(__dirname, "node_modules", importPath);
    }
    return { contents: fs.readFileSync(full, "utf8") };
  } catch (e) {
    return { error: `import not found: ${importPath}` };
  }
}

const sources = {};
for (const f of fs.readdirSync(CONTRACTS_DIR)) {
  if (f.endsWith(".sol")) sources[f] = { content: fs.readFileSync(path.join(CONTRACTS_DIR, f), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
if (output.errors) {
  for (const e of output.errors) {
    if (e.severity === "error") console.error("ERROR:", e.formattedMessage);
    else console.log("warn:", e.formattedMessage.split("\n")[0]);
  }
  if (output.errors.some((e) => e.severity === "error")) process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [file, contracts] of Object.entries(output.contracts)) {
  for (const [name, c] of Object.entries(contracts)) {
    const bytecode = "0x" + c.evm.bytecode.object;
    const deployed = "0x" + c.evm.deployedBytecode.object;
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify({ contractName: name, sourceName: file, abi: c.abi, bytecode, deployedBytecode: deployed }, null, 2));
    console.log(`${name}: bytecode ${(bytecode.length - 2) / 2} bytes, deployed ${(deployed.length - 2) / 2} bytes`);
  }
}
console.log("OK — artifacts in", OUT_DIR);
