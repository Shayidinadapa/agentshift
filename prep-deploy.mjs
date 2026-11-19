// Precompute CREATE2 addresses + factory calldata for mainnet deployment.
// Factory: EIP-2470 Singleton Factory 0xce0042B868300000d44A59004Da54A005ffdcf9f
// deploy(bytes _initCode, bytes32 _salt), salt = 0x00..0.
// Usage: node prep-deploy.mjs  (writes deploy-plan.json)
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
const RESERVE = ethers.parseEther("5000000");

const plan = { factory: FACTORY, salt: SALT, deployer: DARWINZ, agentId: AGENT_ID, contracts: {} };

// 1. ShiftToken(initialHolder = darwinz)
const tokenFactory = new ethers.ContractFactory(art("ShiftToken").abi, art("ShiftToken").bytecode);
const tokenInit = await tokenFactory.getDeployTransaction(DARWINZ);
const tokenAddr = ethers.getCreate2Address(FACTORY, SALT, ethers.keccak256(tokenInit.data));
plan.contracts.ShiftToken = { address: tokenAddr, initCode: tokenInit.data, constructorArgs: [DARWINZ] };

// 2. WorkerNFT(agentId)
const workerFactory = new ethers.ContractFactory(art("WorkerNFT").abi, art("WorkerNFT").bytecode);
const workerInit = await workerFactory.getDeployTransaction(AGENT_ID);
const workerAddr = ethers.getCreate2Address(FACTORY, SALT, ethers.keccak256(workerInit.data));
plan.contracts.WorkerNFT = { address: workerAddr, initCode: workerInit.data, constructorArgs: [AGENT_ID] };

// 3. ShiftMine(worker, shift, agentId)
const mineFactory = new ethers.ContractFactory(art("ShiftMine").abi, art("ShiftMine").bytecode);
const mineInit = await mineFactory.getDeployTransaction(workerAddr, tokenAddr, AGENT_ID);
const mineAddr = ethers.getCreate2Address(FACTORY, SALT, ethers.keccak256(mineInit.data));
plan.contracts.ShiftMine = { address: mineAddr, initCode: mineInit.data, constructorArgs: [workerAddr, tokenAddr, AGENT_ID] };

// Factory calldata: deploy(bytes _initCode, bytes32 _salt)
const iface = new ethers.Interface(["function deploy(bytes _initCode, bytes32 _salt) returns (address)"]);
for (const [name, c] of Object.entries(plan.contracts)) {
  c.factoryCalldata = iface.encodeFunctionData("deploy", [c.initCode, SALT]);
  c.initCodeHash = ethers.keccak256(c.initCode);
  console.log(`${name}: ${c.address} (init ${(c.initCode.length - 2) / 2} bytes, calldata ${(c.factoryCalldata.length - 2) / 2} bytes)`);
}

// 4. Fund ShiftMine: transfer 5,000,000 SHIFT from darwinz to mine
const tokenIface = new ethers.Interface(["function transfer(address to, uint256 amount) returns (bool)"]);
plan.fundMine = {
  to: tokenAddr,
  calldata: tokenIface.encodeFunctionData("transfer", [mineAddr, RESERVE]),
  amount: RESERVE.toString(),
};
console.log(`fundMine: transfer 5,000,000 SHIFT -> ${mineAddr}`);

fs.writeFileSync(path.join(__dirname, "deploy-plan.json"), JSON.stringify(plan, null, 2));
console.log("OK — deploy-plan.json written");
