// Precompute CREATE2 addresses + factory calldata for the v2 redeploy.
// v2 changes: ShiftToken split-mints 5M to the mine + 5M to darwinz at deploy;
// ShiftMine takes (worker, agentId, deployer) + one-time initialize(token).
// WorkerNFT v1 is REUSED (already deployed, independent of token/mine).
// Usage: node prep-deploy-v2.mjs  (writes deploy-plan-v2.json)
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const art = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "artifacts", `${n}.json`), "utf8"));

const FACTORY = "0xce0042B868300000d44A59004Da54A005ffdcf9f";
const SALT = "0x" + "00".repeat(32);
const DARWINZ = "0xaD8b6cd6085B35c43635487df9141294881Df50f";
const AGENT_ID = "0x60b9262456de011f7d15a54cdd8c48baaa8b022f";
const WORKER_V1 = "0x8837BD107a6E8812bDe0eeB6adEC089F53F9Bcc2";

const plan = { factory: FACTORY, salt: SALT, deployer: DARWINZ, agentId: AGENT_ID, workerV1: WORKER_V1, contracts: {} };

// 1. ShiftMine v2 (worker v1, agentId, deployer)
const mineFactory = new ethers.ContractFactory(art("ShiftMine").abi, art("ShiftMine").bytecode);
const mineInit = await mineFactory.getDeployTransaction(WORKER_V1, AGENT_ID, DARWINZ);
const mineAddr = ethers.getCreate2Address(FACTORY, SALT, ethers.keccak256(mineInit.data));
plan.contracts.ShiftMine = { address: mineAddr, initCode: mineInit.data, constructorArgs: [WORKER_V1, AGENT_ID, DARWINZ] };

// 2. ShiftToken v2 (mine, holder)
const tokenFactory = new ethers.ContractFactory(art("ShiftToken").abi, art("ShiftToken").bytecode);
const tokenInit = await tokenFactory.getDeployTransaction(mineAddr, DARWINZ);
const tokenAddr = ethers.getCreate2Address(FACTORY, SALT, ethers.keccak256(tokenInit.data));
plan.contracts.ShiftToken = { address: tokenAddr, initCode: tokenInit.data, constructorArgs: [mineAddr, DARWINZ] };

// WorkerNFT v1 (reused, already on-chain)
plan.contracts.WorkerNFT = { address: WORKER_V1, initCode: null, constructorArgs: null, reusedV1: true };

const iface = new ethers.Interface(["function deploy(bytes _initCode, bytes32 _salt) returns (address)"]);
for (const [name, c] of Object.entries(plan.contracts)) {
  if (!c.initCode) continue;
  c.factoryCalldata = iface.encodeFunctionData("deploy", [c.initCode, SALT]);
  c.initCodeHash = ethers.keccak256(c.initCode);
  console.log(`${name}: ${c.address} (init ${(c.initCode.length - 2) / 2} bytes, calldata ${(c.factoryCalldata.length - 2) / 2} bytes)`);
}

// 3. initialize(mine, token)
const mineIface = new ethers.Interface(["function initialize(address token_)"]);
plan.initialize = {
  to: mineAddr,
  calldata: mineIface.encodeFunctionData("initialize", [tokenAddr]),
  token: tokenAddr,
};
console.log(`initialize: ShiftMine.initialize(${tokenAddr})`);

fs.writeFileSync(path.join(__dirname, "deploy-plan-v2.json"), JSON.stringify(plan, null, 2));
console.log("OK — deploy-plan-v2.json written");
