// Deploy ONE contract (or fund the mine / initialize it) via baw + EIP-2470 factory.
// Preview MUST be clean (risks empty) or the script aborts before executing.
// Usage: PLAN=deploy-plan-v2.json node deploy-one.mjs ShiftToken|WorkerNFT|ShiftMine|fund|init
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const planPath = process.env.PLAN || "deploy-plan.json";
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, planPath), "utf8"));
const which = process.argv[2];
if (!["ShiftToken", "WorkerNFT", "ShiftMine", "fund", "init"].includes(which)) {
  console.error("usage: node deploy-one.mjs ShiftToken|WorkerNFT|ShiftMine|fund|init");
  process.exit(1);
}

const BAW = "/home/hatch/workspace/npm-global/bin/baw";
const ENV = { ...process.env, BINANCE_BAW_DIR: "/home/hatch/.baw" };
const DARWINZ = plan.deployer;

let to, inputData, label;
if (which === "fund") {
  to = plan.contracts.ShiftToken.address;
  inputData = plan.fundMine.calldata;
  label = "fund ShiftMine with 5,000,000 SHIFT";
} else if (which === "init") {
  to = plan.initialize.to;
  inputData = plan.initialize.calldata;
  label = `initialize ShiftMine with token ${plan.initialize.token}`;
} else {
  to = plan.factory;
  inputData = plan.contracts[which].factoryCalldata;
  label = `deploy ${which} -> ${plan.contracts[which].address}`;
}
console.log("== ", label);

function run(cmd) {
  return execSync(cmd, { env: ENV, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
}

const previewCmd = `${BAW} contract-call preview --binanceChainId 56 --from ${DARWINZ} --to ${to} --value 0 --inputData ${inputData} --json`;
console.log("previewing...");
const previewOut = run(previewCmd);
const preview = JSON.parse(previewOut);
const data = preview.data || preview;
console.log("preview keys:", Object.keys(data).join(","));
console.log("requestId:", data.requestId);
console.log("risks:", JSON.stringify(data.risks));
if (data.simulation) console.log("simulation:", JSON.stringify(data.simulation).slice(0, 500));
if (!data.requestId) { console.error("NO requestId — aborting"); process.exit(1); }
const risks = data.risks || [];
if (Array.isArray(risks) && risks.length > 0) { console.error("RISKS NOT EMPTY — aborting"); process.exit(1); }

console.log("preview CLEAN — executing...");
const execOut = run(`${BAW} contract-call execute --requestId ${data.requestId} --json`);
console.log(execOut.slice(0, 2000));
console.log("DONE", which);
