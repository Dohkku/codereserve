// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CodeReserveEscrow} from "../src/CodeReserveEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract CodeReserveEscrowTest is Test {
    CodeReserveEscrow public escrow;
    MockERC20 public usdc;

    address public signer;
    uint256 public signerPrivateKey;

    address public depositor = address(0x1);
    address public treasury = address(0x2);
    address public randomUser = address(0x3);

    bytes32 public constant REPO_ID = keccak256("owner/repo");
    uint256 public constant PR_NUMBER = 42;
    uint256 public constant DEPOSIT_AMOUNT = 5_000_000; // 5 USDC

    function setUp() public {
        // Create signer keypair
        signerPrivateKey = 0xA11CE;
        signer = vm.addr(signerPrivateKey);

        // Deploy mock USDC
        usdc = new MockERC20("USD Coin", "USDC", 6);

        // Deploy escrow
        escrow = new CodeReserveEscrow(address(usdc), signer);

        // Fund depositor
        usdc.mint(depositor, 1_000_000_000); // 1000 USDC
        vm.prank(depositor);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ============================================
    // Deposit Tests
    // ============================================

    function test_Deposit() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        assertEq(depositId, 0);
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT_AMOUNT);

        CodeReserveEscrow.Deposit memory dep = escrow.getDeposit(depositId);
        assertEq(dep.depositor, depositor);
        assertEq(dep.amount, DEPOSIT_AMOUNT);
        assertEq(dep.repoId, REPO_ID);
        assertEq(dep.prNumber, PR_NUMBER);
        assertEq(dep.treasury, treasury);
        assertEq(uint256(dep.status), 0); // Active
    }

    function test_Deposit_MultiplePRs() public {
        vm.startPrank(depositor);

        uint256 id1 = escrow.deposit(REPO_ID, 1, treasury, DEPOSIT_AMOUNT);
        uint256 id2 = escrow.deposit(REPO_ID, 2, treasury, DEPOSIT_AMOUNT);
        uint256 id3 = escrow.deposit(keccak256("other/repo"), 1, treasury, DEPOSIT_AMOUNT);

        vm.stopPrank();

        assertEq(id1, 0);
        assertEq(id2, 1);
        assertEq(id3, 2);
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT_AMOUNT * 3);
    }

    function test_Deposit_RevertZeroAmount() public {
        vm.prank(depositor);
        vm.expectRevert(CodeReserveEscrow.InvalidAmount.selector);
        escrow.deposit(REPO_ID, PR_NUMBER, treasury, 0);
    }

    function test_Deposit_RevertZeroTreasury() public {
        vm.prank(depositor);
        vm.expectRevert(CodeReserveEscrow.InvalidAddress.selector);
        escrow.deposit(REPO_ID, PR_NUMBER, address(0), DEPOSIT_AMOUNT);
    }

    // ============================================
    // Refund Tests
    // ============================================

    function test_Refund() public {
        // Create deposit
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        uint256 balanceBefore = usdc.balanceOf(depositor);

        // Create refund signature
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _signRefund(depositId, deadline);

        // Execute refund
        escrow.refund(depositId, deadline, signature);

        // Verify
        assertEq(usdc.balanceOf(depositor), balanceBefore + DEPOSIT_AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);

        CodeReserveEscrow.Deposit memory dep = escrow.getDeposit(depositId);
        assertEq(uint256(dep.status), 1); // Refunded
    }

    function test_Refund_RevertExpiredSignature() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        uint256 deadline = block.timestamp - 1; // Already expired
        bytes memory signature = _signRefund(depositId, deadline);

        vm.expectRevert(CodeReserveEscrow.SignatureExpired.selector);
        escrow.refund(depositId, deadline, signature);
    }

    function test_Refund_RevertInvalidSignature() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _signRefundWithKey(depositId, deadline, 0xBAD);

        vm.expectRevert(CodeReserveEscrow.InvalidSignature.selector);
        escrow.refund(depositId, deadline, signature);
    }

    function test_Refund_RevertSignatureReplay() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _signRefund(depositId, deadline);

        escrow.refund(depositId, deadline, signature);

        // Create new deposit and try to use same signature
        usdc.mint(depositor, DEPOSIT_AMOUNT);
        vm.prank(depositor);
        escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        vm.expectRevert(CodeReserveEscrow.SignatureAlreadyUsed.selector);
        escrow.refund(depositId, deadline, signature);
    }

    function test_Refund_RevertNotActive() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _signRefund(depositId, deadline);

        escrow.refund(depositId, deadline, signature);

        // Try to refund again
        bytes memory signature2 = _signRefund(depositId, deadline + 1);
        vm.expectRevert(CodeReserveEscrow.DepositNotActive.selector);
        escrow.refund(depositId, deadline + 1, signature2);
    }

    // ============================================
    // Slash Tests
    // ============================================

    function test_Slash() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _signSlash(depositId, deadline);

        escrow.slash(depositId, deadline, signature);

        assertEq(usdc.balanceOf(treasury), DEPOSIT_AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);

        CodeReserveEscrow.Deposit memory dep = escrow.getDeposit(depositId);
        assertEq(uint256(dep.status), 2); // Slashed
    }

    function test_Slash_RevertInvalidSignature() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _signSlashWithKey(depositId, deadline, 0xBAD);

        vm.expectRevert(CodeReserveEscrow.InvalidSignature.selector);
        escrow.slash(depositId, deadline, signature);
    }

    function test_Slash_RevertNotActive() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        // Slash first
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _signSlash(depositId, deadline);
        escrow.slash(depositId, deadline, signature);

        // Try to slash again
        bytes memory signature2 = _signSlash(depositId, deadline + 1);
        vm.expectRevert(CodeReserveEscrow.DepositNotActive.selector);
        escrow.slash(depositId, deadline + 1, signature2);
    }

    // ============================================
    // Timeout Tests
    // ============================================

    function test_ClaimTimeout() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        uint256 balanceBefore = usdc.balanceOf(depositor);

        // Fast forward 30 days
        vm.warp(block.timestamp + 30 days);

        // Anyone can call claimTimeout
        vm.prank(randomUser);
        escrow.claimTimeout(depositId);

        // Funds go to original depositor
        assertEq(usdc.balanceOf(depositor), balanceBefore + DEPOSIT_AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);

        CodeReserveEscrow.Deposit memory dep = escrow.getDeposit(depositId);
        assertEq(uint256(dep.status), 3); // TimedOut
    }

    function test_ClaimTimeout_RevertTooEarly() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        // Only 29 days
        vm.warp(block.timestamp + 29 days);

        vm.expectRevert(CodeReserveEscrow.TimeoutNotReached.selector);
        escrow.claimTimeout(depositId);
    }

    function test_ClaimTimeout_RevertNotActive() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        // Refund first
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _signRefund(depositId, deadline);
        escrow.refund(depositId, deadline, signature);

        // Fast forward and try timeout
        vm.warp(block.timestamp + 30 days);

        vm.expectRevert(CodeReserveEscrow.DepositNotActive.selector);
        escrow.claimTimeout(depositId);
    }

    // ============================================
    // View Function Tests
    // ============================================

    function test_CanClaimTimeout() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        assertFalse(escrow.canClaimTimeout(depositId));

        vm.warp(block.timestamp + 30 days);

        assertTrue(escrow.canClaimTimeout(depositId));
    }

    function test_TimeUntilTimeout() public {
        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, PR_NUMBER, treasury, DEPOSIT_AMOUNT);

        assertEq(escrow.timeUntilTimeout(depositId), 30 days);

        vm.warp(block.timestamp + 10 days);
        assertEq(escrow.timeUntilTimeout(depositId), 20 days);

        vm.warp(block.timestamp + 25 days); // Total 35 days
        assertEq(escrow.timeUntilTimeout(depositId), 0);
    }

    // ============================================
    // Fuzz Tests
    // ============================================

    function testFuzz_Deposit(uint256 amount, uint256 prNumber) public {
        vm.assume(amount > 0 && amount <= 1_000_000_000);

        usdc.mint(depositor, amount);
        vm.prank(depositor);
        usdc.approve(address(escrow), amount);

        vm.prank(depositor);
        uint256 depositId = escrow.deposit(REPO_ID, prNumber, treasury, amount);

        CodeReserveEscrow.Deposit memory dep = escrow.getDeposit(depositId);
        assertEq(dep.amount, amount);
        assertEq(dep.prNumber, prNumber);
    }

    // ============================================
    // Helper Functions
    // ============================================

    function _signRefund(uint256 depositId, uint256 deadline) internal view returns (bytes memory) {
        return _signRefundWithKey(depositId, deadline, signerPrivateKey);
    }

    function _signRefundWithKey(
        uint256 depositId,
        uint256 deadline,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(keccak256("Refund(uint256 depositId,uint256 deadline)"), depositId, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signSlash(uint256 depositId, uint256 deadline) internal view returns (bytes memory) {
        return _signSlashWithKey(depositId, deadline, signerPrivateKey);
    }

    function _signSlashWithKey(
        uint256 depositId,
        uint256 deadline,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(keccak256("Slash(uint256 depositId,uint256 deadline)"), depositId, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
