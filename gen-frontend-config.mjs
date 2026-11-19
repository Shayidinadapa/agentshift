// Generate frontend/config.js from compiled artifacts + deploy plan.
// Minimal ABIs only (what the UI calls). Usage: node gen-frontend-config.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const planPath = process.env.PLAN || "deploy-plan.json";
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, planPath), "utf8"));
const art = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "artifacts", `${n}.json`), "utf8"));

function pick(abi, names) {
  return abi.filter((f) => f.type === "function" && names.includes(f.name));
}

// Transfer event (needed to find a user's Worker tokenId via logs).
const TRANSFER_EVENT = {
  type: "event", name: "Transfer", anonymous: false,
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: true, name: "tokenId", type: "uint256" },
  ],
};

const config = {
  chainId: 56,
  chainName: "BNB Smart Chain",
  agentId: plan.agentId,
  contracts: {
    ShiftToken: {
      address: plan.contracts.ShiftToken.address,
      abi: pick(art("ShiftToken").abi, ["name", "symbol", "decimals", "totalSupply", "balanceOf", "transfer"]),
    },
    WorkerNFT: {
      address: plan.contracts.WorkerNFT.address,
      abi: [...pick(art("WorkerNFT").abi, ["name", "symbol", "balanceOf", "ownerOf", "nextTokenId", "mint", "agentId"]), TRANSFER_EVENT],
    },
    ShiftMine: {
      address: plan.contracts.ShiftMine.address,
      abi: pick(art("ShiftMine").abi, ["clockIn", "claim", "pendingReward", "ratePerDay", "shifts", "worker", "shift", "agentId", "BASE_RATE_PER_DAY", "SHIFT_DURATION", "STREAK_WINDOW"]),
    },
  },
  agentIdAbi: [
    { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  ],
};

fs.writeFileSync(
  path.join(__dirname, "frontend", "config.js"),
  "export const CONFIG = " + JSON.stringify(config, null, 2) + ";\n"
);
console.log("frontend/config.js written");
console.log("ShiftToken:", config.contracts.ShiftToken.address);
console.log("WorkerNFT:", config.contracts.WorkerNFT.address);
console.log("ShiftMine:", config.contracts.ShiftMine.address);
