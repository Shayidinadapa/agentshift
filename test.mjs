// Local end-to-end tests on an in-process ganache chain.
// Usage: node test.mjs
import ganache from "ganache";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const art = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "artifacts", `${n}.json`), "utf8"));

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  PASS", label); }
  else { fail++; console.log("  FAIL", label); }
}
async function expectRevert(fn, label) {
  // Use staticCall: a reverting tx can still resolve at broadcast time on
  // ganache, so simulate the call instead — a revert throws deterministically.
  try { await fn(); fail++; console.log("  FAIL", label, "(did NOT revert)"); }
  catch (e) { pass++; console.log("  PASS", label, "— reverted:", (e?.shortMessage || e?.message || "").slice(0, 80)); }
}
async function increaseTime(provider, secs) {
  await provider.send("evm_increaseTime", [secs]);
  await provider.send("evm_mine", []);
}
const fmt = (v) => ethers.formatEther(v);

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const server = ganache.server({ chain: { chainId: 56 }, wallet: { deterministic: true }, logging: { quiet: true } });
await server.listen(8545);
try {
  const [deployer, alice, bob, carol] = await Promise.all([0, 1, 2, 3].map((i) => provider.getSigner(i)));
  const [dAddr, aAddr, bAddr, cAddr] = await Promise.all([deployer, alice, bob, carol].map((s) => s.getAddress()));
  console.log("deployer:", dAddr, "| alice:", aAddr, "| bob:", bAddr, "| carol:", cAddr);

  const deploy = async (name, args, signer) => {
    const a = art(name);
    const f = new ethers.ContractFactory(a.abi, a.bytecode, signer || deployer);
    const c = await f.deploy(...args);
    await c.waitForDeployment();
    return c;
  };

  console.log("\n== deploy");
  const mockId = await deploy("MockAgentID", []);
  const worker = await deploy("WorkerNFT", [await mockId.getAddress()]);
  const mine = await deploy("ShiftMine", [await worker.getAddress(), await mockId.getAddress(), dAddr]);
  await expectRevert(() => mine.connect(alice).clockIn.staticCall(1), "clockIn sebelum initialize ditolak");
  const token = await deploy("ShiftToken", [await mine.getAddress(), dAddr]);
  await (await mine.initialize(await token.getAddress())).wait();
  ok((await mine.initialized()) === true, "mine initialized");
  ok((await token.balanceOf(await mine.getAddress())) === ethers.parseEther("5000000"), "mine funded 5,000,000 SHIFT via split-mint");
  ok((await token.balanceOf(dAddr)) === ethers.parseEther("5000000"), "deployer holds remaining 5,000,000 SHIFT");
  ok((await token.totalSupply()) === ethers.parseEther("10000000"), "SHIFT total supply 10,000,000");

  console.log("\n== mint gating");
  await expectRevert(() => worker.connect(alice).mint.staticCall(), "mint tanpa Agent ID ditolak");
  await (await mockId.mint(aAddr)).wait();
  await (await mockId.mint(cAddr)).wait();
  const tx1 = await worker.connect(alice).mint();
  const rc1 = await tx1.wait();
  ok(rc1.status === 1, "alice mint Worker (punya Agent ID)");
  ok((await worker.ownerOf(1)) === aAddr, "tokenId 1 milik alice");
  ok((await worker.balanceOf(aAddr)) === 1n, "alice balance 1");
  await expectRevert(() => worker.connect(alice).mint.staticCall(), "mint kedua di wallet sama ditolak");
  await expectRevert(() => worker.connect(alice).transferFrom.staticCall(aAddr, bAddr, 1), "transfer Worker ditolak (soulbound)");
  await expectRevert(() => worker.connect(bob).mint.staticCall(), "bob tanpa Agent ID tetap ditolak");

  console.log("\n== clock-in & streak");
  await expectRevert(() => mine.connect(bob).clockIn.staticCall(1), "clockIn oleh bukan pemilik ditolak");
  await (await mine.connect(alice).clockIn(1)).wait();
  let s = await mine.shifts(1);
  ok(s.streak === 1n, "streak 1 setelah clock-in pertama");
  ok((await mine.ratePerDay(1)) === ethers.parseEther("100"), "rate 100 SHIFT/hari di streak 1");
  await expectRevert(() => mine.connect(alice).clockIn.staticCall(1), "clock-in kedua di hari sama ditolak");
  await increaseTime(provider, 12 * 3600);
  const p12 = await mine.pendingReward(1);
  ok(p12 > ethers.parseEther("49") && p12 < ethers.parseEther("51"), `pending ~50 SHIFT setelah 12 jam (dapat ${fmt(p12)})`);
  await increaseTime(provider, 13 * 3600); // total 25 jam sejak clock-in
  const p25 = await mine.pendingReward(1);
  ok(p25 > ethers.parseEther("99") && p25 < ethers.parseEther("101"), `pending mentok ~100 SHIFT setelah shift 24 jam habis (dapat ${fmt(p25)})`);

  console.log("\n== claim & streak lanjut");
  const balBefore = await token.balanceOf(aAddr);
  await (await mine.connect(alice).claim(1)).wait();
  const balAfter = await token.balanceOf(aAddr);
  ok(balAfter - balBefore > ethers.parseEther("99") && balAfter - balBefore < ethers.parseEther("101"), `claim ~100 SHIFT (dapat ${fmt(balAfter - balBefore)})`);
  ok((await mine.pendingReward(1)) === 0n, "pending 0 setelah claim");
  await expectRevert(() => mine.connect(alice).claim.staticCall(1), "claim kosong ditolak");
  // clock-in hari ke-2, 25 jam setelah yang pertama (dalam jendela 48 jam) -> streak 2
  await (await mine.connect(alice).clockIn(1)).wait();
  s = await mine.shifts(1);
  ok(s.streak === 2n, "streak 2 setelah clock-in hari ke-2");
  ok((await mine.ratePerDay(1)) === ethers.parseEther("105"), "rate 105 SHIFT/hari di streak 2");
  await increaseTime(provider, 25 * 3600); // total 50 jam
  const p2 = await mine.pendingReward(1);
  ok(p2 > ethers.parseEther("104") && p2 < ethers.parseEther("106"), `pending ~105 SHIFT (dapat ${fmt(p2)})`);
  await increaseTime(provider, 3 * 24 * 3600); // total 122 jam, bolos 3 hari
  const pStill = await mine.pendingReward(1);
  ok(pStill > ethers.parseEther("104") && pStill < ethers.parseEther("106"), `pending tetap ~105 (tidak nambah di luar shift) (dapat ${fmt(pStill)})`);

  console.log("\n== streak reset kalau bolos");
  const balBefore2 = await token.balanceOf(aAddr);
  await (await mine.connect(alice).claim(1)).wait();
  const balAfter2 = await token.balanceOf(aAddr);
  ok(balAfter2 - balBefore2 > ethers.parseEther("104") && balAfter2 - balBefore2 < ethers.parseEther("106"), `claim ~105 SHIFT (dapat ${fmt(balAfter2 - balBefore2)})`);
  // clock-in lagi 97 jam setelah clock-in terakhir (>48 jam) -> streak reset
  await (await mine.connect(alice).clockIn(1)).wait();
  s = await mine.shifts(1);
  ok(s.streak === 1n, "streak reset ke 1 setelah bolos >48 jam");
  ok((await mine.ratePerDay(1)) === ethers.parseEther("100"), "rate kembali 100 SHIFT/hari");

  console.log("\n== reserve habis: claim dibayar sisanya saja");
  // carol: worker baru, clock-in, lalu kuras reserve mine sampai kecil
  await (await worker.connect(carol).mint()).wait(); // tokenId 2
  await (await mine.connect(carol).clockIn(2)).wait();
  await increaseTime(provider, 25 * 3600);
  // pindahkan hampir semua reserve keluar dengan claim alice dulu? tidak bisa — pakai akun deployer:
  // cara sederhana: deploy mine kedua dengan reserve kecil
  const mine2 = await deploy("ShiftMine", [await worker.getAddress(), await mockId.getAddress(), dAddr]);
  await (await mine2.initialize(await token.getAddress())).wait();
  await (await token.transfer(await mine2.getAddress(), ethers.parseEther("10"))).wait();
  await (await mine2.connect(carol).clockIn(2)).wait();
  await increaseTime(provider, 25 * 3600);
  const pend = await mine2.pendingReward(2);
  ok(pend > ethers.parseEther("99"), `pending carol di mine2 ~100 (dapat ${fmt(pend)})`);
  const cBefore = await token.balanceOf(cAddr);
  await (await mine2.connect(carol).claim(2)).wait();
  const cAfter = await token.balanceOf(cAddr);
  ok(cAfter - cBefore === ethers.parseEther("10"), `claim dibayar sisa reserve 10 SHIFT saja (dapat ${fmt(cAfter - cBefore)})`);
  ok((await mine2.pendingReward(2)) > ethers.parseEther("89"), "sisa pending tidak hilang (masih bisa diklaim kalau reserve diisi)");

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
} finally {
  await server.close();
}
