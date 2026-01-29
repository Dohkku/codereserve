// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CodeReserveEscrow
 * @notice Trustless escrow for GitHub PR deposits
 * @dev No admin functions - once deployed, rules cannot be changed
 *
 * Flow:
 * 1. Contributor deposits USDC to open a PR
 * 2. If PR is merged/approved: backend signs refund
 * 3. If PR is spam: backend signs slash (funds go to repo treasury)
 * 4. If backend disappears: anyone can claim after 30 days (claimTimeout)
 */
contract CodeReserveEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============================================
    // Constants
    // ============================================

    /// @notice Timeout after which depositor can reclaim funds (30 days)
    uint256 public constant TIMEOUT_DURATION = 30 days;

    /// @notice Domain separator for EIP-712 signatures
    bytes32 public immutable DOMAIN_SEPARATOR;

    /// @notice USDC token address
    IERC20 public immutable usdc;

    /// @notice Address authorized to sign refund/slash
    address public immutable signer;

    // ============================================
    // Types
    // ============================================

    enum DepositStatus {
        Active,
        Refunded,
        Slashed,
        TimedOut
    }

    struct Deposit {
        address depositor;
        uint256 amount;
        bytes32 repoId;      // keccak256 of repo full name (e.g., "owner/repo")
        uint256 prNumber;
        address treasury;    // Where slashed funds go
        uint256 timestamp;
        DepositStatus status;
    }

    // ============================================
    // State
    // ============================================

    /// @notice All deposits by ID
    mapping(uint256 => Deposit) public deposits;

    /// @notice Next deposit ID
    uint256 public nextDepositId;

    /// @notice Used signatures (prevents replay)
    mapping(bytes32 => bool) public usedSignatures;

    // ============================================
    // Events
    // ============================================

    event DepositCreated(
        uint256 indexed depositId,
        address indexed depositor,
        bytes32 indexed repoId,
        uint256 prNumber,
        uint256 amount,
        address treasury
    );

    event DepositRefunded(uint256 indexed depositId, address indexed depositor, uint256 amount);
    event DepositSlashed(uint256 indexed depositId, address indexed treasury, uint256 amount);
    event DepositTimedOut(uint256 indexed depositId, address indexed depositor, uint256 amount);

    // ============================================
    // Errors
    // ============================================

    error InvalidAmount();
    error InvalidAddress();
    error DepositNotActive();
    error InvalidSignature();
    error SignatureAlreadyUsed();
    error TimeoutNotReached();
    error SignatureExpired();

    // ============================================
    // Constructor
    // ============================================

    /**
     * @param _usdc USDC token address
     * @param _signer Address that can sign refund/slash authorizations
     */
    constructor(address _usdc, address _signer) {
        if (_usdc == address(0) || _signer == address(0)) revert InvalidAddress();

        usdc = IERC20(_usdc);
        signer = _signer;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("CodeReserveEscrow"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    // ============================================
    // External Functions
    // ============================================

    /**
     * @notice Create a deposit for a PR
     * @param repoId Hash of repository full name
     * @param prNumber Pull request number
     * @param treasury Address to receive slashed funds
     * @param amount Amount of USDC to deposit
     * @return depositId The ID of the created deposit
     */
    function deposit(
        bytes32 repoId,
        uint256 prNumber,
        address treasury,
        uint256 amount
    ) external nonReentrant returns (uint256 depositId) {
        if (amount == 0) revert InvalidAmount();
        if (treasury == address(0)) revert InvalidAddress();

        depositId = nextDepositId++;

        deposits[depositId] = Deposit({
            depositor: msg.sender,
            amount: amount,
            repoId: repoId,
            prNumber: prNumber,
            treasury: treasury,
            timestamp: block.timestamp,
            status: DepositStatus.Active
        });

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit DepositCreated(depositId, msg.sender, repoId, prNumber, amount, treasury);
    }

    /**
     * @notice Refund deposit to contributor (requires backend signature)
     * @param depositId ID of the deposit
     * @param deadline Signature expiration timestamp
     * @param signature Backend signature authorizing refund
     */
    function refund(
        uint256 depositId,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        if (block.timestamp > deadline) revert SignatureExpired();

        Deposit storage dep = deposits[depositId];
        if (dep.status != DepositStatus.Active) revert DepositNotActive();

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(
                    keccak256("Refund(uint256 depositId,uint256 deadline)"),
                    depositId,
                    deadline
                ))
            )
        );

        if (usedSignatures[messageHash]) revert SignatureAlreadyUsed();

        address recoveredSigner = messageHash.recover(signature);
        if (recoveredSigner != signer) revert InvalidSignature();

        usedSignatures[messageHash] = true;
        dep.status = DepositStatus.Refunded;

        usdc.safeTransfer(dep.depositor, dep.amount);

        emit DepositRefunded(depositId, dep.depositor, dep.amount);
    }

    /**
     * @notice Slash deposit (send to treasury) for spam PRs
     * @param depositId ID of the deposit
     * @param deadline Signature expiration timestamp
     * @param signature Backend signature authorizing slash
     */
    function slash(
        uint256 depositId,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        if (block.timestamp > deadline) revert SignatureExpired();

        Deposit storage dep = deposits[depositId];
        if (dep.status != DepositStatus.Active) revert DepositNotActive();

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(
                    keccak256("Slash(uint256 depositId,uint256 deadline)"),
                    depositId,
                    deadline
                ))
            )
        );

        if (usedSignatures[messageHash]) revert SignatureAlreadyUsed();

        address recoveredSigner = messageHash.recover(signature);
        if (recoveredSigner != signer) revert InvalidSignature();

        usedSignatures[messageHash] = true;
        dep.status = DepositStatus.Slashed;

        usdc.safeTransfer(dep.treasury, dep.amount);

        emit DepositSlashed(depositId, dep.treasury, dep.amount);
    }

    /**
     * @notice Claim deposit after timeout (if backend is unresponsive)
     * @dev Can be called by anyone after 30 days, funds go to original depositor
     * @param depositId ID of the deposit
     */
    function claimTimeout(uint256 depositId) external nonReentrant {
        Deposit storage dep = deposits[depositId];
        if (dep.status != DepositStatus.Active) revert DepositNotActive();
        if (block.timestamp < dep.timestamp + TIMEOUT_DURATION) revert TimeoutNotReached();

        dep.status = DepositStatus.TimedOut;

        usdc.safeTransfer(dep.depositor, dep.amount);

        emit DepositTimedOut(depositId, dep.depositor, dep.amount);
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get deposit details
     * @param depositId ID of the deposit
     */
    function getDeposit(uint256 depositId) external view returns (Deposit memory) {
        return deposits[depositId];
    }

    /**
     * @notice Check if a deposit can be claimed via timeout
     * @param depositId ID of the deposit
     */
    function canClaimTimeout(uint256 depositId) external view returns (bool) {
        Deposit storage dep = deposits[depositId];
        return dep.status == DepositStatus.Active &&
               block.timestamp >= dep.timestamp + TIMEOUT_DURATION;
    }

    /**
     * @notice Get time remaining until timeout claim is available
     * @param depositId ID of the deposit
     * @return remaining Seconds until timeout (0 if already claimable)
     */
    function timeUntilTimeout(uint256 depositId) external view returns (uint256 remaining) {
        Deposit storage dep = deposits[depositId];
        uint256 timeoutAt = dep.timestamp + TIMEOUT_DURATION;
        if (block.timestamp >= timeoutAt) return 0;
        return timeoutAt - block.timestamp;
    }
}
