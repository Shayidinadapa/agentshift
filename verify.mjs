// Verify the 3 deployed contracts on Sourcify via the v2 std-json endpoint.
// Builds a COMPLETE standard JSON (own sources + every OpenZeppelin file
// they transitively import), submits, and polls until each job completes.
// Usage: node verify.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = path.join(__dirname, "contracts");
const planPath = process.env.PLAN || "deploy-plan.json";
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, planPath), "utf8"));

const COMPILER = "0.8.26+commit.8a97fa7a";
// Creator tx hashes per deployment version (v1 + v2).
const CREATOR_TX = {
  ShiftToken: "0x4fdcd3b4749d63f2c710c1189bb096455460ded6fa8e747e1f6f03d52af4cd21",
  WorkerNFT: "0x3f600dc998ccf5510525d391a53605c2125bcd431e878a1916f87e377446412d",
  ShiftMine: "0x6f1854be03f481d98eb3d176d85f97269f11551c236bd46bb141c36cd3aed2aa",
};

// --- collect the full source graph (own files + transitive OZ imports) ---
const sources = {};
function addSource(key, absPath) {
  if (sources[key]) return;
  const content = fs.readFileSync(absPath, "utf8");
  sources[key] = { content };
  const dir = path.posix.dirname(key);
  for (const m of content.matchAll(/from\s+["']([^"']+)["']/g)) {
    const imp = m[1];
    if (imp.startsWith("@openzeppelin/")) {
      addSource(imp, path.join(__dirname, "node_modules", imp));
    } else if (imp.startsWith("./") || imp.startsWith("../")) {
      const resolved = path.posix.normalize(path.posix.join(dir, imp));
      // resolved key is relative to node_modules for OZ files, or contracts dir for own files
      let abs;
      if (resolved.startsWith("@openzeppelin/")) abs = path.join(__dirname, "node_modules", resolved);
      else abs = path.join(CONTRACTS_DIR, path.basename(resolved));
      addSource(resolved, abs);
    }
  }
}
for (const f of ["ShiftToken.sol", "WorkerNFT.sol", "ShiftMine.sol"]) {
  addSource(f, path.join(CONTRACTS_DIR, f));
}
console.log(`collected ${Object.keys(sources).length} source files`);

const stdJson = {
  language: "Solidity",
  sources,
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
};
fs.writeFileSync(path.join(__dirname, "standard.json"), JSON.stringify(stdJson));

async function pollJob(verificationId) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`https://sourcify.dev/server/v2/verify/${verificationId}`);
    const j = await res.json();
    if (j.isJobCompleted) return j;
  }
  return { timeout: true };
}

for (const [name, c] of Object.entries(plan.contracts)) {
  if (c.reusedV1) { console.log(`== ${name} at ${c.address} — reused v1, already verified, skipping`); continue; }
  console.log(`== verifying ${name} at ${c.address} ...`);
  const body = {
    stdJsonInput: stdJson,
    compilerVersion: COMPILER,
    contractIdentifier: `${name}.sol:${name}`,
    creatorTxHash: CREATOR_TX[name],
  };
  const res = await fetch(`https://sourcify.dev/server/v2/verify/56/${c.address}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`   HTTP ${res.status}:`, text.slice(0, 200));
  let j;
  try { j = JSON.parse(text); } catch { continue; }
  if (j.verificationId) {
    const done = await pollJob(j.verificationId);
    if (done.timeout) console.log("   job timed out (still pending)");
    else if (done.error) console.log("   job FAILED:", JSON.stringify(done.error).slice(0, 400));
    else console.log("   job done:", JSON.stringify(done.contract));
  }
}

console.log("== final status");
for (const [name, c] of Object.entries(plan.contracts)) {
  const res = await fetch(`https://sourcify.dev/server/v2/contract/56/${c.address}`);
  const j = await res.json();
  console.log(`${name}: match=${j.match} creation=${j.creationMatch} runtime=${j.runtimeMatch}`);
}
