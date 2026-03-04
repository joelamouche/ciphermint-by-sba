// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {CompliantERC20} from "./CompliantERC20.sol";

/**
 * @title CompliantUBI
 * @notice UBI layer on top of CompliantERC20
 * @dev Implements initial and per-block UBI minting on top of compliant transfers.
 */
contract CompliantUBI is CompliantERC20 {
    /// @notice Scale factor for 8 decimal places
    uint64 public constant DECIMALS_FACTOR = 1e8;

    /// @notice One-time claim amount in base units (100 SBA with 8 decimals)
    uint64 public constant CLAIM_AMOUNT = 100 * DECIMALS_FACTOR;

    /// @notice Target income per "month" in base units (10 SBA with 8 decimals)
    uint64 public constant MONTHLY_INCOME = 10 * DECIMALS_FACTOR;

    /// @notice Approximate number of blocks per month (used for per-block accrual)
    uint64 public constant BLOCKS_PER_MONTH = 216_000;

    /// @notice Total value shielded (sum of all balances, plaintext units)
    uint256 public totalValueShielded;

    /// @notice Encrypted one-time mint claim status
    mapping(address account => ebool claimedMint) private claimedMints;

    /// @notice Block number when income was last claimed / UBI accrual started
    mapping(address account => uint64 lastIncomeBlock) public lastIncomeBlock;

    constructor(string memory tokenName, string memory tokenSymbol, address checker)
        CompliantERC20(tokenName, tokenSymbol, checker)
    {}

    /**
     * @notice Claim 100 tokens once if compliant
     * @dev Compliance is evaluated via encrypted checks; failure mints 0.
     * @return success Always true
     */
    function claimTokens() external returns (bool success) {
        if (address(complianceChecker) == address(0)) revert ComplianceCheckerNotSet();

        ebool isCompliant = complianceChecker.checkCompliance(msg.sender);
        ebool alreadyClaimed = claimedMints[msg.sender];
        if (!FHE.isInitialized(alreadyClaimed)) {
            alreadyClaimed = FHE.asEbool(false);
        }

        ebool canClaim = FHE.and(isCompliant, FHE.not(alreadyClaimed));
        euint64 mintAmount = FHE.select(canClaim, FHE.asEuint64(CLAIM_AMOUNT), FHE.asEuint64(0));

        _mintTo(msg.sender, mintAmount);

        // Update total value shielded based on claim amount (plaintext)
        totalValueShielded += CLAIM_AMOUNT;

        ebool newClaimed = FHE.or(alreadyClaimed, canClaim);
        claimedMints[msg.sender] = newClaimed;
        FHE.allowThis(newClaimed);
        FHE.allow(newClaimed, msg.sender);

        // Initialize UBI accrual window on first interaction
        if (lastIncomeBlock[msg.sender] == 0) {
            lastIncomeBlock[msg.sender] = uint64(block.number);
        }

        return true;
    }

    /**
     * @notice Claim accrued income if compliant
     * @dev Uses per-block linear accrual based on BLOCKS_PER_MONTH; failure to meet compliance mints 0.
     * @return success Always true
     */
    function claimMonthlyIncome() external returns (bool success) {
        if (address(complianceChecker) == address(0)) revert ComplianceCheckerNotSet();

        uint64 lastBlock = lastIncomeBlock[msg.sender];
        // Not enrolled / no accrual started yet (must have called claimTokens first)
        if (lastBlock == 0) {
            return true;
        }

        if (block.number < lastBlock) {
            return true;
        }

        uint256 blocksElapsed = block.number - lastBlock;
        if (blocksElapsed == 0) {
            return true;
        }

        // Per-block linear accrual with same approximate monthly/annual rate
        uint64 plainIncome = uint64((uint256(MONTHLY_INCOME) * blocksElapsed) / BLOCKS_PER_MONTH);
        if (plainIncome == 0) {
            return true;
        }

        ebool isCompliant = complianceChecker.checkCompliance(msg.sender);

        euint64 incomeAmount = FHE.asEuint64(plainIncome);
        euint64 mintAmount = FHE.select(isCompliant, incomeAmount, FHE.asEuint64(0));

        _mintTo(msg.sender, mintAmount);

        // Update total value shielded based on accrued income (plaintext)
        totalValueShielded += plainIncome;

        // Reset accrual window to current block to avoid residual fractional income
        lastIncomeBlock[msg.sender] = uint64(block.number);

        return true;
    }

    /**
     * @notice Get encrypted claim status for an account
     * @param account Address to query
     * @return Encrypted boolean indicating whether the account has claimed
     */
    function hasClaimedMint(address account) external view returns (ebool) {
        return claimedMints[account];
    }

    /**
     * @notice Get the total value shielded (sum of all balances, plaintext)
     * @return Total value shielded
     */
    function getTotalValueShielded() external view returns (uint256) {
        return totalValueShielded;
    }

    /**
     * @notice Get currently claimable income for an account (per-block accrual)
     * @param account Address to query
     * @return Plaintext amount of income claimable right now
     */
    function claimableMonthlyIncome(address account) external view returns (uint256) {
        uint64 lastBlock = lastIncomeBlock[account];
        if (lastBlock == 0 || block.number < lastBlock) return 0;

        uint256 blocksElapsed = block.number - lastBlock;
        if (blocksElapsed == 0) return 0;

        uint256 income = (uint256(MONTHLY_INCOME) * blocksElapsed) / BLOCKS_PER_MONTH;
        return income;
    }
}

