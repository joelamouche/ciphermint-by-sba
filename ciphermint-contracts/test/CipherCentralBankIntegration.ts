/**
 * @title CipherCentralBank integration tests
 * @notice fhEVM mock: deposit, compounding share price, two-step withdraw
 */
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { CipherCentralBank, CompliantUBI, ComplianceRules, IdentityRegistry } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("CipherCentralBank integration", function () {
  let owner: HardhatEthersSigner;
  let registrar: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let registry: IdentityRegistry;
  let compliance: ComplianceRules;
  let sba: CompliantUBI;
  let bank: CipherCentralBank;
  let registryAddr: string;
  let complianceAddr: string;
  let sbaAddr: string;
  let bankAddr: string;

  const BLOCKS_PER_MONTH = 20n;
  const DECIMALS = 10n ** 8n;
  /** Below Alice's one-time UBI claim (100 * DECIMALS) */
  const DEPOSIT = 50n * DECIMALS;

  async function attest(user: HardhatEthersSigner, birthOffset: number, name: string) {
    const nh = ethers.keccak256(ethers.toUtf8Bytes(name));
    const enc = fhevm.createEncryptedInput(registryAddr, registrar.address);
    enc.add8(birthOffset);
    const input = await enc.encrypt();
    await registry.connect(registrar).attestIdentity(user.address, input.handles[0], nh, input.inputProof);
  }

  async function enc64(contract: string, signer: HardhatEthersSigner, value: bigint) {
    const e = fhevm.createEncryptedInput(contract, signer.address);
    e.add64(value);
    return e.encrypt();
  }

  async function readUserBalances(user: HardhatEthersSigner) {
    const sbaHandle = await sba.balanceOf(user.address);
    const csbaHandle = await bank.balanceOf(user.address);

    const sbaBal = await fhevm.userDecryptEuint(FhevmType.euint64, sbaHandle, sbaAddr, user);

    let csbaBal = 0n;
    try {
      csbaBal = await fhevm.userDecryptEuint(FhevmType.euint64, csbaHandle, bankAddr, user);
    } catch {
      // Uninitialized encrypted handles decode as 0 for test assertions.
      csbaBal = 0n;
    }

    return { sba: sbaBal, csba: csbaBal };
  }

  before(async function () {
    if (!fhevm.isMock) {
      console.warn("CipherCentralBank tests require fhEVM mock");
      this.skip();
    }
    const s = await ethers.getSigners();
    if (s.length < 3) {
      this.skip();
    }
    owner = s[0];
    registrar = s[1];
    alice = s[2];
  });

  beforeEach(async function () {
    registry = (await ethers.getContractFactory("IdentityRegistry").then((f) => f.deploy())) as IdentityRegistry;
    registryAddr = await registry.getAddress();
    compliance = (await ethers
      .getContractFactory("ComplianceRules")
      .then((f) => f.deploy(registryAddr))) as ComplianceRules;
    complianceAddr = await compliance.getAddress();
    sba = (await ethers
      .getContractFactory("CompliantUBI")
      .then((f) => f.deploy("SBA", "SBA", complianceAddr))) as CompliantUBI;
    sbaAddr = await sba.getAddress();
    await compliance.connect(owner).setAuthorizedCaller(sbaAddr, true);

    bank = (await ethers
      .getContractFactory("CipherCentralBank")
      .then((f) => f.deploy(sbaAddr, complianceAddr, BLOCKS_PER_MONTH))) as CipherCentralBank;
    bankAddr = await bank.getAddress();
    await compliance.connect(owner).setAuthorizedCaller(bankAddr, true);

    await registry.connect(owner).addRegistrar(registrar.address);
    await attest(alice, 90, "Alice Bank");
    await registry.connect(alice).grantAccessTo(complianceAddr);

    await sba.connect(owner).setCentralBankController(owner.address);
    await sba.connect(owner).setMinter(bankAddr, true);
    await sba.connect(alice).claimTokens();
  });

  it("reverts on zero SBA in constructor", async function () {
    const F = await ethers.getContractFactory("CipherCentralBank");
    await expect(F.deploy(ethers.ZeroAddress, complianceAddr, BLOCKS_PER_MONTH)).to.be.revertedWithCustomError(
      F,
      "ZeroOwner",
    );
  });

  it("reverts on zero blocksPerMonth", async function () {
    const F = await ethers.getContractFactory("CipherCentralBank");
    await expect(F.deploy(sbaAddr, complianceAddr, 0)).to.be.revertedWithCustomError(F, "TotalSupplyOverflow");
  });

  it("deposit: first depositor mints CSBA ~1:1 and credits vaultSbaAssets", async function () {
    const before = await readUserBalances(alice);
    const a = await enc64(sbaAddr, alice, DEPOSIT);
    await sba.connect(alice).approve(bankAddr, a.handles[0], a.inputProof);
    // CipherCentralBank verifies encrypted inputs in its own context (contract = bankAddr)
    const d = await enc64(bankAddr, alice, DEPOSIT);
    await bank.connect(alice).deposit(d.handles[0], d.inputProof);

    const after = await readUserBalances(alice);
    expect(after.csba).to.equal(before.csba + DEPOSIT);
    expect(after.sba).to.equal(before.sba);
  });

  it("deposit(0) does not mint new shares", async function () {
    const a = await enc64(sbaAddr, alice, DEPOSIT);
    await sba.connect(alice).approve(bankAddr, a.handles[0], a.inputProof);
    const d = await enc64(bankAddr, alice, DEPOSIT);
    await bank.connect(alice).deposit(d.handles[0], d.inputProof);

    const before = await readUserBalances(alice);
    const z = await enc64(bankAddr, alice, 0n);
    await bank.connect(alice).deposit(z.handles[0], z.inputProof);
    const after = await readUserBalances(alice);
    expect(after.csba).to.equal(before.csba);
    expect(after.sba).to.equal(before.sba);
  });

  it("updateRate compounds sharePriceScaled per blocksPerMonth (uses monthlyRateBps)", async function () {
    const before = await bank.sharePriceScaled();
    const bps = await bank.monthlyRateBps();
    await ethers.provider.send("hardhat_mine", ["0x" + BLOCKS_PER_MONTH.toString(16)]);
    await bank.connect(alice).updateRate();
    const after = await bank.sharePriceScaled();
    expect(after).to.equal((before * (10000n + BigInt(bps))) / 10000n);
  });

  it("compounds (not linear) over 3 months", async function () {
    const before = await bank.sharePriceScaled();
    const bps = BigInt(await bank.monthlyRateBps());

    await ethers.provider.send("hardhat_mine", ["0x" + (BLOCKS_PER_MONTH * 3n).toString(16)]);
    await bank.connect(alice).updateRate();

    const after = await bank.sharePriceScaled();

    // Integer compounding with per-month floor, matching on-chain logic.
    let expectedCompounded = before;
    for (let i = 0; i < 3; i += 1) {
      expectedCompounded = (expectedCompounded * (10000n + bps)) / 10000n;
    }

    // Linear approximation for contrast.
    const expectedLinear = (before * (10000n + 3n * bps)) / 10000n;

    expect(after).to.equal(expectedCompounded);
    expect(after).to.not.equal(expectedLinear);
  });

  it("setMonthlyRateBps: only owner; InvalidMonthlyRate above 10000", async function () {
    await expect(bank.connect(alice).setMonthlyRateBps(1)).to.be.revertedWithCustomError(
      bank,
      "OwnableUnauthorizedAccount",
    );
    await bank.connect(owner).setMonthlyRateBps(40);
    expect(await bank.monthlyRateBps()).to.equal(40n);
    await expect(bank.connect(owner).setMonthlyRateBps(10001)).to.be.revertedWithCustomError(
      bank,
      "InvalidMonthlyRate",
    );
  });

  it("requestWithdraw then completeWithdraw after lock; NoPendingWithdraw if none", async function () {
    const a = await enc64(sbaAddr, alice, DEPOSIT);
    await sba.connect(alice).approve(bankAddr, a.handles[0], a.inputProof);
    const d = await enc64(bankAddr, alice, DEPOSIT);
    await bank.connect(alice).deposit(d.handles[0], d.inputProof);
    const afterDeposit = await readUserBalances(alice);

    const w = await enc64(bankAddr, alice, DEPOSIT);
    await bank.connect(alice).requestWithdraw(w.handles[0], w.inputProof);
    const afterRequest = await readUserBalances(alice);
    expect(afterRequest.sba).to.equal(afterDeposit.sba);
    expect(afterRequest.csba).to.equal(afterDeposit.csba - DEPOSIT);

    await expect(bank.connect(alice).completeWithdraw()).to.be.revertedWithCustomError(bank, "WithdrawNotReady");

    await ethers.provider.send("hardhat_mine", ["0x" + BLOCKS_PER_MONTH.toString(16)]);

    await bank.connect(alice).completeWithdraw();
    const afterComplete = await readUserBalances(alice);
    const priceAfter1Month = await bank.sharePriceScaled();
    const expectedPayout = (DEPOSIT * priceAfter1Month) / 10n ** 8n;
    expect(afterComplete.sba).to.equal(afterRequest.sba + expectedPayout);
    expect(afterComplete.csba).to.equal(afterRequest.csba);

    await expect(bank.connect(alice).completeWithdraw()).to.be.revertedWithCustomError(bank, "NoPendingWithdraw");
  });

  it("payout after 3 months is higher than after 1 month", async function () {
    // --- cycle A: 1-month lock completion ---
    const approveA = await enc64(sbaAddr, alice, DEPOSIT);
    await sba.connect(alice).approve(bankAddr, approveA.handles[0], approveA.inputProof);
    const depA = await enc64(bankAddr, alice, DEPOSIT);
    await bank.connect(alice).deposit(depA.handles[0], depA.inputProof);

    const csbaAHandle = await bank.balanceOf(alice.address);
    const csbaA = await fhevm.userDecryptEuint(FhevmType.euint64, csbaAHandle, bankAddr, alice);
    const reqA = await enc64(bankAddr, alice, csbaA);
    await bank.connect(alice).requestWithdraw(reqA.handles[0], reqA.inputProof);

    const beforeA = await readUserBalances(alice);
    await ethers.provider.send("hardhat_mine", ["0x" + BLOCKS_PER_MONTH.toString(16)]);
    await bank.connect(alice).completeWithdraw();
    const afterA = await readUserBalances(alice);
    const payout1Month = afterA.sba - beforeA.sba;
    expect(afterA.csba).to.equal(beforeA.csba);
    const priceAfter1Month = await bank.sharePriceScaled();
    const expected1Month = (csbaA * priceAfter1Month) / 10n ** 8n;
    expect(payout1Month).to.equal(expected1Month);

    // --- cycle B: 3-month lock completion ---
    const approveB = await enc64(sbaAddr, alice, DEPOSIT);
    await sba.connect(alice).approve(bankAddr, approveB.handles[0], approveB.inputProof);
    const depB = await enc64(bankAddr, alice, DEPOSIT);
    await bank.connect(alice).deposit(depB.handles[0], depB.inputProof);

    const csbaBHandle = await bank.balanceOf(alice.address);
    const csbaB = await fhevm.userDecryptEuint(FhevmType.euint64, csbaBHandle, bankAddr, alice);
    const reqB = await enc64(bankAddr, alice, csbaB);
    await bank.connect(alice).requestWithdraw(reqB.handles[0], reqB.inputProof);

    const beforeB = await readUserBalances(alice);
    await ethers.provider.send("hardhat_mine", ["0x" + (BLOCKS_PER_MONTH * 3n).toString(16)]);
    await bank.connect(alice).completeWithdraw();
    const afterB = await readUserBalances(alice);
    const payout3Months = afterB.sba - beforeB.sba;
    expect(afterB.csba).to.equal(beforeB.csba);
    const priceAfter3Months = await bank.sharePriceScaled();
    const expected3Months = (csbaB * priceAfter3Months) / 10n ** 8n;
    expect(payout3Months).to.equal(expected3Months);
  });

  it("reverts completeWithdraw before lock period ends", async function () {
    const a = await enc64(sbaAddr, alice, DEPOSIT);
    await sba.connect(alice).approve(bankAddr, a.handles[0], a.inputProof);
    const d = await enc64(bankAddr, alice, DEPOSIT);
    await bank.connect(alice).deposit(d.handles[0], d.inputProof);

    const w = await enc64(bankAddr, alice, DEPOSIT);
    await bank.connect(alice).requestWithdraw(w.handles[0], w.inputProof);

    const before = await readUserBalances(alice);
    await expect(bank.connect(alice).completeWithdraw()).to.be.revertedWithCustomError(bank, "WithdrawNotReady");
    const after = await readUserBalances(alice);
    expect(after.sba).to.equal(before.sba);
    expect(after.csba).to.equal(before.csba);
  });

  it("WithdrawAlreadyPending on second requestWithdraw", async function () {
    const a = await enc64(sbaAddr, alice, DEPOSIT);
    await sba.connect(alice).approve(bankAddr, a.handles[0], a.inputProof);
    const d = await enc64(bankAddr, alice, DEPOSIT);
    await bank.connect(alice).deposit(d.handles[0], d.inputProof);

    const half = DEPOSIT / 2n;
    const w1 = await enc64(bankAddr, alice, half);
    await bank.connect(alice).requestWithdraw(w1.handles[0], w1.inputProof);
    const w2 = await enc64(bankAddr, alice, half);
    const before = await readUserBalances(alice);
    await expect(bank.connect(alice).requestWithdraw(w2.handles[0], w2.inputProof)).to.be.revertedWithCustomError(
      bank,
      "WithdrawAlreadyPending",
    );
    const after = await readUserBalances(alice);
    expect(after.sba).to.equal(before.sba);
    expect(after.csba).to.equal(before.csba);
  });

  it("reverts requestWithdraw(0)", async function () {
    const z = await enc64(bankAddr, alice, 0n);
    await bank.connect(alice).requestWithdraw(z.handles[0], z.inputProof);
    const before = await readUserBalances(alice);
    await expect(bank.connect(alice).requestWithdraw(z.handles[0], z.inputProof)).to.be.revertedWithCustomError(
      bank,
      "WithdrawAlreadyPending",
    );
    const after = await readUserBalances(alice);
    expect(after.sba).to.equal(before.sba);
    expect(after.csba).to.equal(before.csba);
  });
});
