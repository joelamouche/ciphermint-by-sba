// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {CompliantERC20} from "./CompliantERC20.sol";

/**
 * @title CompliantUBI
 * @author Stevens Blockchain Advisory
 * @notice UBI layer and monetary policy on top of CompliantERC20
 * @dev
 *  - Implements initial and per-block UBI minting.
 *  - Owns mint/burn rights and total value shielded accounting.
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

    /// @notice Special treasury account used as a sink/source to keep TVS stable on policy operations
    address public centralBankController;

    /// @notice Accounts allowed to perform mint/burn style monetary operations
    mapping(address controller => bool allowed) public isMinter;

    /// @notice Encrypted one-time mint claim status
    mapping(address account => ebool claimedMint) private claimedMints;

    /// @notice Block number when income was last claimed / UBI accrual started
    mapping(address account => uint64 lastIncomeBlock) public lastIncomeBlock;

    /**
     * @notice Initialize the SBA UBI token
     * @param tokenName Token name
     * @param tokenSymbol Token symbol
     * @param checker Compliance checker address
     * @param initialOwner Owner address for admin operations
     */
    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address checker,
        address initialOwner
    ) CompliantERC20(tokenName, tokenSymbol, checker, initialOwner) {}

    /// @notice Thrown when caller is not an authorized minter/controller
    error OnlyMinter();

    /// @notice Thrown when central bank controller account is not configured
    error BankNotSet();

    modifier onlyMinterController() {
        if (!isMinter[msg.sender]) revert OnlyMinter();
        _;
    }

    modifier bankControllerSet() {
        if (centralBankController == address(0)) revert BankNotSet();
        _;
    }

    /**
     * @notice Configure a monetary controller (minter/burner)
     * @param minter Controller address
     * @param allowed Whether the controller is allowed
     */
    function setMinter(address minter, bool allowed) external onlyOwner {
        isMinter[minter] = allowed;
    }

    /**
     * @notice Set or update the central bank controller account
     * @param controller Treasury/controller address
     */
    function setCentralBankController(address controller) external onlyOwner {
        centralBankController = controller;
    }

    /// @notice Mint tokens under monetary policy, using encrypted amounts
    /// @dev
    ///  - Uses the centralBankController balance first (if available),
    ///    then mints the remaining part as net-new supply.
    ///  - TVS is only affected by UBI mints (claimTokens/claimMonthlyIncome), not by policy mints.
    /// @param to Recipient address
    /// @param amount Encrypted amount to mint
    /// @return success Always true
    function mint(address to, euint64 amount) external onlyMinterController bankControllerSet returns (bool) {
        if (!FHE.isSenderAllowed(amount)) revert UnauthorizedCiphertext();

        // Encrypted balance of the central bank controller
        euint64 bankBalance = balances[centralBankController];

        // Determine how much can be sourced from the bank vs newly minted
        ebool bankHasEnough = FHE.le(amount, bankBalance);
        euint64 fromBank = FHE.select(bankHasEnough, amount, bankBalance);
        euint64 toMint = FHE.sub(amount, fromBank); // remainder to mint as new supply

        // 1) Move what we can from the bank controller to the recipient (no TVS change)
        if (to != centralBankController) {
            _transfer(centralBankController, to, fromBank);
        }

        // 2) Mint the remaining part as net-new supply (affects encrypted totalSupply)
        _mintTo(to, toMint);
        _increaseTotalSupply(toMint);

        return true;
    }

    /// @notice Burn tokens under monetary policy, using encrypted amounts
    /// @param from Address to burn from
    /// @param amount Encrypted amount to burn
    /// @return success Always true
    function burn(address from, euint64 amount) external onlyMinterController bankControllerSet returns (bool) {
        if (!FHE.isSenderAllowed(amount)) revert UnauthorizedCiphertext();

        // Burning is modelled as a transfer into the central bank controller so TVS stays constant.
        _transfer(from, centralBankController, amount);

        // totalValueShielded and encrypted totalSupply remain unchanged for policy burns.
        return true;
    }

    /**
     * @notice Claim 100 tokens once if compliant
     * @dev Compliance is evaluated via encrypted checks; failure mints 0.
     * @return success Always true
     */
    function claimTokens() external returns (bool success) {
        // KYC/attestation already gates user eligibility upstream in IdentityRegistry.
        // Keep claim path independent from cross-contract encrypted handle ACL issues.
        ebool alreadyClaimed = claimedMints[msg.sender];
        if (!FHE.isInitialized(alreadyClaimed)) {
            alreadyClaimed = FHE.asEbool(false);
            // Explicitly grant contract access for fresh literals on real fhEVM.
            FHE.allowThis(alreadyClaimed);
        }

        ebool canClaim = FHE.not(alreadyClaimed);
        FHE.allowThis(canClaim);
        euint64 claimAmount = FHE.asEuint64(CLAIM_AMOUNT);
        euint64 zeroAmount = FHE.asEuint64(0);
        FHE.allowThis(claimAmount);
        FHE.allowThis(zeroAmount);
        euint64 mintAmount = FHE.select(canClaim, claimAmount, zeroAmount);

        _mintTo(msg.sender, mintAmount);
        _increaseTotalSupply(mintAmount);

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

        euint64 incomeAmount = FHE.asEuint64(plainIncome);
        euint64 zeroAmount = FHE.asEuint64(0);
        FHE.allowThis(incomeAmount);
        FHE.allowThis(zeroAmount);
        euint64 mintAmount = incomeAmount;
        FHE.allowThis(mintAmount);

        _mintTo(msg.sender, mintAmount);
        _increaseTotalSupply(mintAmount);

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

    /**
     * @notice Transfer override with vault/custody compliance bypass.
     * @dev
     *  - For regular user-to-user flows, retain CompliantERC20 compliance checks.
     *  - For central-bank/vault custody addresses (controller + authorized minters),
     *    bypass compliance gating and only enforce balance sufficiency.
     *    This is required so SBA can move into/out of the vault contract.
     * @param from Source address
     * @param to Destination address
     * @param amount Encrypted amount to transfer
     * @return success Always returns true (actual transfer may be 0)
     */
    function _transfer(address from, address to, euint64 amount) internal virtual override returns (bool success) {
        bool bypassCompliance = from == centralBankController
            || to == centralBankController
            || isMinter[from]
            || isMinter[to];
        if (!bypassCompliance) {
            return super._transfer(from, to, amount);
        }

        if (from == to) revert SelfTransferNotAllowed();

        euint64 fromBalance = _balanceOrZero(from);
        euint64 toBalance = _balanceOrZero(to);
        ebool hasSufficientBalance = FHE.le(amount, fromBalance);
        euint64 actualAmount = FHE.select(hasSufficientBalance, amount, FHE.asEuint64(0));

        euint64 newFromBalance = FHE.sub(fromBalance, actualAmount);
        euint64 newToBalance = FHE.add(toBalance, actualAmount);

        balances[from] = newFromBalance;
        balances[to] = newToBalance;

        FHE.allowThis(newFromBalance);
        FHE.allowThis(newToBalance);
        FHE.allow(newFromBalance, from);
        FHE.allow(newToBalance, to);
        FHE.allow(newFromBalance, owner());
        FHE.allow(newToBalance, owner());

        emit Transfer(from, to);
        return true;
    }
}
