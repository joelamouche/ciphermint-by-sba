// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {externalEuint64, FHE, euint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {CompliantERC20} from "./CompliantERC20.sol";
import {CompliantUBI} from "./CompliantUBI.sol";

/// @title CipherCentralBank
/// @notice CSBA vault shares with compounding SBA-per-share price (not 1:1). Two-step exit after 1 month.
/// @author CipherMint
contract CipherCentralBank is CompliantERC20 {
    /// @notice Underlying SBA token (CompliantUBI)
    CompliantUBI public immutable SBA;

    /// @notice Blocks per month (chain-specific)
    uint64 public immutable BLOCKS_PER_MONTH;

    /// @notice Monthly rate in basis points (e.g. 30 = 0.30% per month, compounded)
    uint64 public monthlyRateBps = 30;

    /// @notice Last block when share price was compounded
    uint64 public lastAccrualBlock;

    /// @notice SBA per 1 CSBA unit, scaled by 1e8 (starts 1:1)
    uint256 public sharePriceScaled = 1e8;

    /// @notice Pending exit: CSBA locked until unlock block
    struct PendingWithdraw {
        /// @notice Encrypted CSBA amount locked for withdrawal
        euint64 csbaAmountEnc;
        uint64 unlockBlock;
        bool active;
    }

    /// @notice Pending withdraw requests by user
    mapping(address user => PendingWithdraw pending) public pendingWithdrawals;

    /// @dev Caps per-call compounding iterations to avoid gas blow-ups; remaining time is applied on the next call.
    uint256 internal constant MAX_COMPOUND_STEPS = 480;

    error ZeroOwner();
    error ZeroAmount();
    error SbaTransferFailed();
    error PayoutFailed();
    error InvalidMonthlyRate();
    error NoPendingWithdraw();
    error WithdrawNotReady();
    error WithdrawAlreadyPending();

    /**
     * @notice Construct the central bank vault token
     * @param sba_ SBA token
     * @param checker Compliance checker for CSBA
     * @param blocksPerMonth_ Blocks per month for compounding steps
     */
    constructor(address sba_, address checker, uint64 blocksPerMonth_)
        CompliantERC20("CipherSBA Bills", "CSBA", checker)
    {
        SBA = CompliantUBI(sba_);
        if (sba_ == address(0)) revert ZeroOwner();
        if (blocksPerMonth_ == 0) revert TotalSupplyOverflow();
        BLOCKS_PER_MONTH = blocksPerMonth_;
        lastAccrualBlock = uint64(block.number);
    }

    /**
     * @notice Owner sets monthly rate (bps)
     * @param newMonthlyRateBps New monthly rate in basis points
     */
    function setMonthlyRateBps(uint64 newMonthlyRateBps) external onlyOwner {
        if (newMonthlyRateBps > 10_000) revert InvalidMonthlyRate();
        updateRate();
        monthlyRateBps = newMonthlyRateBps;
    }

    /// @notice Compound share price for elapsed full months (call on deposit / exit paths)
    function updateRate() public {
        if (lastAccrualBlock == 0) {
            lastAccrualBlock = uint64(block.number);
            return;
        }
        uint256 blocksElapsed = block.number - lastAccrualBlock;
        uint256 months = blocksElapsed / BLOCKS_PER_MONTH;
        if (months == 0) return;

        uint256 applied = months > MAX_COMPOUND_STEPS ? MAX_COMPOUND_STEPS : months;
        uint256 mult = 10_000 + uint256(monthlyRateBps);
        for (uint256 i = 0; i < applied; ++i) {
            sharePriceScaled = (sharePriceScaled * mult) / 10_000;
        }
        lastAccrualBlock += uint64(applied * BLOCKS_PER_MONTH);
    }

    /**
     * @notice Deposit SBA; mint CSBA shares at current compounded price
     * @param encryptedAmount Encrypted SBA amount
     * @param inputProof Zama proof for the encrypted input
     */
    function deposit(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        updateRate();

        // Verify the encrypted amount *in this contract context* (signer = msg.sender),
        // then pass an allowed euint64 into SBA.transferFrom(euint64) to avoid
        // FHEVM InvalidSigner() in the nested call (where msg.sender would be this bank).
        euint64 amountEnc = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allow(amountEnc, address(this));
        FHE.allow(amountEnc, address(SBA));

        bool ok = SBA.transferFrom(msg.sender, address(this), amountEnc);
        if (!ok) revert SbaTransferFailed();

        if (sharePriceScaled > type(uint64).max) revert TotalSupplyOverflow();
        euint64 depositAmount = FHE.mul(amountEnc, uint64(1e8));
        depositAmount = FHE.div(depositAmount, uint64(sharePriceScaled));
        euint64 bankBalance = balances[address(this)];
        ebool bankHasEnough = FHE.le(depositAmount, bankBalance);
        euint64 fromBank = FHE.select(bankHasEnough, depositAmount, bankBalance);
        euint64 toMint = FHE.sub(depositAmount, fromBank);
        _transfer(address(this), msg.sender, fromBank);
        _mintTo(msg.sender, toMint);
        _increaseTotalSupply(toMint);
    }

    /**
     * @notice Step 1: lock CSBA for exit; SBA can be claimed after one full month of blocks
     * @param encryptedAmount Encrypted CSBA amount to lock
     * @param inputProof Zama proof for the encrypted input
     */
    function requestWithdraw(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        if (pendingWithdrawals[msg.sender].active) revert WithdrawAlreadyPending();

        euint64 amt = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowThis(amt);
        _transfer(msg.sender, address(this), amt);

        pendingWithdrawals[msg.sender] = PendingWithdraw({
            csbaAmountEnc: amt,
            unlockBlock: uint64(block.number + BLOCKS_PER_MONTH),
            active: true
        });
    }

    /**
     * @notice Step 2: after unlock, receive SBA (mint shortfall if needed)
     */
    function completeWithdraw() external {
        PendingWithdraw storage p = pendingWithdrawals[msg.sender];
        if (!p.active) revert NoPendingWithdraw();
        if (block.number < p.unlockBlock) revert WithdrawNotReady();

        updateRate();

        // Keep withdrawn CSBA in bank inventory for re-issuance on future deposits.
        euint64 sbaOut = _sbaOutForShares(_takePendingWithdraw(p));
        _payoutSba(msg.sender, sbaOut);
    }

    /**
     * @notice Consume and clear the caller's pending withdrawal record
     * @param p Pending withdrawal storage reference
     * @return csbaAmount Encrypted CSBA amount that was locked
     */
    function _takePendingWithdraw(PendingWithdraw storage p) internal returns (euint64 csbaAmount) {
        csbaAmount = p.csbaAmountEnc;

        p.active = false;
        euint64 z = FHE.asEuint64(0);
        p.csbaAmountEnc = z;
        FHE.allowThis(z);
        FHE.allow(z, msg.sender);
        FHE.allow(z, owner());
        p.unlockBlock = 0;
    }

    function _sbaOutForShares(euint64 csbaAmount) internal returns (euint64 sbaOut) {
        if (sharePriceScaled > type(uint64).max) revert TotalSupplyOverflow();
        sbaOut = FHE.mul(csbaAmount, uint64(sharePriceScaled));
        sbaOut = FHE.div(sbaOut, uint64(1e8));
    }

    function _payoutSba(address to, euint64 sbaOut) internal {
        FHE.allow(sbaOut, address(SBA));
        if (!SBA.mint(to, sbaOut)) revert PayoutFailed();
    }

    /**
     * @dev Allow bank custody/release flows to bypass compliance gating.
     *      Non-bank transfers keep CompliantERC20's compliance checks.
     */
    function _transfer(address from, address to, euint64 amount) internal override returns (bool success) {
        if (from == address(this) || to == address(this)) {
            euint64 fromBal = balances[from];
            if (!FHE.isInitialized(fromBal)) {
                fromBal = FHE.asEuint64(0);
            }
            euint64 toBal = balances[to];
            if (!FHE.isInitialized(toBal)) {
                toBal = FHE.asEuint64(0);
            }

            euint64 actualAmount = FHE.select(FHE.le(amount, fromBal), amount, FHE.asEuint64(0));
            euint64 newFrom = FHE.sub(fromBal, actualAmount);
            euint64 newTo = FHE.add(toBal, actualAmount);

            balances[from] = newFrom;
            balances[to] = newTo;

            FHE.allowThis(newFrom);
            FHE.allowThis(newTo);
            FHE.allow(newFrom, from);
            FHE.allow(newTo, to);
            FHE.allow(newFrom, owner());
            FHE.allow(newTo, owner());
            FHE.allow(totalSupply, from);
            FHE.allow(totalSupply, to);

            emit Transfer(from, to);
            return true;
        }

        return super._transfer(from, to, amount);
    }
}
