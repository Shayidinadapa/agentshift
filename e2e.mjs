// End-to-end test on BSC mainnet with the user's two wallets.
// Each action: baw preview (must be clean) -> execute -> print tx hash.
// Usage: node e2e.mjs mint-darwinz|mint-heti|clockin-darwinz|clockin-heti|claim-darwinz|claim-heti|status
import { execSync } from "child_process";
import { ethers } from "ethers";

const BAW = "/home/hatch/workspace/npm-global/bin/baw";
const WORKER = "0x8837BD107a6E8812bDe0eeB6adEC089F53F9Bcc2";
const MINE = "0xa8aaCd3681e245EFA6C6292769150e948C07A17F";
const TOKEN = "0x9ca4E76EB3dA3cD20a80D3Be4CF262302295a854";
const DARWINZ = "0xaD8b6cd6085B35c43635487df9141294881Df50f";
const HETI = "0x824CE9E2c07d122f38F73b336Df932Af6B4EFcde";

const workerIface = new ethers.Interface(["function mint() returns (uint256)"]);
const mineIface = new ethers.Interface(["function clockIn(uint256 tokenId)", "function claim(uint256 tokenId)"]);

const ACTIONS = {
  "mint-darwinz": { dir: "/home/hatch/.baw", from: DARWINZ, to: WORKER, data: workerIface.encodeFunctionData("mint", []) },
  "mint-heti": { dir: "/home/hatch/.baw-heti", from: HETI, to: WORKER, data: workerIface.encodeFunctionData("mint", []) },
  "clockin-darwinz": { dir: "/home/hatch/.baw", from: DARWINZ, to: MINE, data: mineIface.encodeFunctionData("clockIn", [1]) },
  "clockin-heti": { dir: "/home/hatch/.baw-heti", from: HETI, to: MINE, data: mineIface.encodeFunctionData("clockIn", [2]) },
  "claim-darwinz": { dir: "/home/hatch/.baw", from: DARWINZ, to: MINE, data: mineIface.encodeFunctionData("claim", [1]) },
  "claim-heti": { dir: "/home/hatch/.baw-heti", from: HETI, to: MINE, data: mineIface.encodeFunctionData("claim", [2]) },
};

const which = process.argv[2];
if (which === "status") {
  const provider = new ethers.JsonRpcProvider("https://bsc-dataseed2.bnbchain.org");
  const worker = new ethers.Contract(WORKER, ["function nextTokenId() view returns (uint256)", "function ownerOf(uint256) view returns (address)", "function balanceOf(address) view returns (uint256)"], provider);
  const mine = new ethers.Contract(MINE, ["function pendingReward(uint256) view returns (uint256)", "function shifts(uint256) view returns (uint256 lastClockIn, uint256 lastUpdate, uint256 accrued, uint256 streak)", "function ratePerDay(uint256) view returns (uint256)"], provider);
  const token = new ethers.Contract(TOKEN, ["function balanceOf(address) view returns (uint256)"], provider);
  console.log("nextTokenId:", (await worker.nextTokenId()).toString());
  for (const [label, addr, id] of [["darwinz", DARWINZ, 1], ["heti", HETI, 2]]) {
    console.log(`${label}: workerBal=${await worker.balanceOf(addr)} ownerOf(${id})=${await worker.ownerOf(id).catch(() => "-")}`);
    const s = await mine.shifts(id).catch(() => null);
    if (s) console.log(`  shifts: streak=${s.streak} lastClockIn=${s.lastClockIn} pending=${ethers.formatEther(await mine.pendingReward(id))} rate/day=${ethers.formatEther(await mine.ratePerDay(id))}`);
    console.log(`  SHIFT balance: ${ethers.formatEther(await token.balanceOf(addr))}`);
  }
  console.log("mine SHIFT reserve:", ethers.formatEther(await token.balanceOf(MINE)));
  process.exit(0);
}

const a = ACTIONS[which];
if (!a) { console.error("unknown action:", which); process.exit(1); }
console.log("==", which, `from ${a.from} to ${a.to}`);

function run(cmd, env) {
  return execSync(cmd, { env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
}
const previewOut = run(`${BAW} contract-call preview --binanceChainId 56 --from ${a.from} --to ${a.to} --value 0 --inputData ${a.data} --json`, { BINANCE_BAW_DIR: a.dir });
const d = JSON.parse(previewOut).data || JSON.parse(previewOut);
console.log("requestId:", d.requestId, "| risks:", JSON.stringify(d.risks));
if (!d.requestId) { console.error("NO requestId — aborting"); process.exit(1); }
if (d.risks && Array.isArray(d.risks.riskDetails) && d.risks.riskDetails.length > 0) { console.error("RISKS NOT EMPTY — aborting"); process.exit(1); }
console.log("preview CLEAN — executing...");
const execOut = run(`${BAW} contract-call execute --requestId ${d.requestId} --json`, { BINANCE_BAW_DIR: a.dir });
console.log(execOut.slice(0, 800));
console.log("DONE", which);
