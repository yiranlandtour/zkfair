// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/governance/ZKFairTreasury.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1000000 * 10**18);
    }
}

contract ZKFairTreasuryTest is Test {
    ZKFairTreasury public treasury;
    MockERC20 public token;
    
    address public admin = address(0x1);
    address public treasurer1 = address(0x2);
    address public treasurer2 = address(0x3);
    address public budgetManager = address(0x4);
    address public executor = address(0x5);
    address public recipient = address(0x6);
    
    // Events to test
    event BudgetAllocated(ZKFairTreasury.BudgetCategory indexed category, address indexed token, uint256 amount, uint256 period);
    event PaymentRequestCreated(uint256 indexed requestId, address indexed recipient, uint256 amount);
    event PaymentRequestApproved(uint256 indexed requestId, address indexed approver);
    event PaymentExecuted(uint256 indexed requestId, address indexed recipient, uint256 amount);
    event PaymentRequestCancelled(uint256 indexed requestId);
    event EmergencyWithdrawalInitiated(address indexed recipient, uint256 initiatedAt);
    event EmergencyWithdrawalExecuted(address indexed recipient);
    event FundsDeposited(address indexed token, uint256 amount, address indexed depositor);
    
    function setUp() public {
        vm.startPrank(admin);
        
        // Deploy treasury
        treasury = new ZKFairTreasury(admin);
        
        // Deploy mock token
        token = new MockERC20("Mock Token", "MOCK");
        
        // Setup roles
        treasury.grantRole(treasury.TREASURER_ROLE(), treasurer1);
        treasury.grantRole(treasury.TREASURER_ROLE(), treasurer2);
        treasury.grantRole(treasury.BUDGET_MANAGER_ROLE(), budgetManager);
        treasury.grantRole(treasury.EXECUTOR_ROLE(), executor);
        
        vm.stopPrank();
    }
    
    function testInitialState() public {
        assertTrue(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(treasury.hasRole(treasury.TREASURER_ROLE(), admin));
        assertTrue(treasury.hasRole(treasury.BUDGET_MANAGER_ROLE(), admin));
        assertEq(treasury.APPROVAL_THRESHOLD(), 2);
        assertEq(treasury.EMERGENCY_DELAY(), 3 days);
    }
    
    function testDepositETH() public {
        uint256 depositAmount = 10 ether;
        
        vm.deal(admin, depositAmount);
        vm.prank(admin);
        
        vm.expectEmit(true, false, false, true);
        emit FundsDeposited(address(0), depositAmount, admin);
        
        treasury.deposit{value: depositAmount}(address(0), depositAmount);
        
        assertEq(address(treasury).balance, depositAmount);
    }
    
    function testDepositERC20() public {
        uint256 depositAmount = 1000 * 10**18;
        
        vm.startPrank(admin);
        token.approve(address(treasury), depositAmount);
        
        vm.expectEmit(true, false, false, true);
        emit FundsDeposited(address(token), depositAmount, admin);
        
        treasury.deposit(address(token), depositAmount);
        
        assertEq(token.balanceOf(address(treasury)), depositAmount);
        vm.stopPrank();
    }
    
    function testBudgetAllocation() public {
        vm.prank(budgetManager);
        
        uint256 budgetAmount = 10000 * 10**18;
        uint256 period = 30 days;
        
        vm.expectEmit(true, true, false, true);
        emit BudgetAllocated(ZKFairTreasury.BudgetCategory.DEVELOPMENT, address(token), budgetAmount, period);
        
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            address(token),
            budgetAmount,
            period
        );
        
        (uint256 allocated, uint256 spent, uint256 budgetPeriod, uint256 lastReset) = 
            treasury.budgets(ZKFairTreasury.BudgetCategory.DEVELOPMENT, address(token));
        
        assertEq(allocated, budgetAmount);
        assertEq(spent, 0);
        assertEq(budgetPeriod, period);
        assertGt(lastReset, 0);
    }
    
    function testCreatePaymentRequest() public {
        // Setup budget first
        vm.prank(budgetManager);
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            address(token),
            10000 * 10**18,
            30 days
        );
        
        // Create payment request
        vm.prank(executor);
        
        uint256 paymentAmount = 1000 * 10**18;
        string memory description = "Development work payment";
        
        vm.expectEmit(true, true, false, true);
        emit PaymentRequestCreated(0, recipient, paymentAmount);
        
        uint256 requestId = treasury.createPaymentRequest(
            recipient,
            address(token),
            paymentAmount,
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            description
        );
        
        assertEq(requestId, 0);
        
        (
            address reqRecipient,
            address reqToken,
            uint256 reqAmount,
            ZKFairTreasury.BudgetCategory reqCategory,
            string memory reqDescription,
            bool executed,
            bool cancelled,
            uint256 approvals
        ) = treasury.paymentRequests(requestId);
        
        assertEq(reqRecipient, recipient);
        assertEq(reqToken, address(token));
        assertEq(reqAmount, paymentAmount);
        assertEq(uint256(reqCategory), uint256(ZKFairTreasury.BudgetCategory.DEVELOPMENT));
        assertEq(reqDescription, description);
        assertFalse(executed);
        assertFalse(cancelled);
        assertEq(approvals, 0);
    }
    
    function testApprovePaymentRequest() public {
        // Setup and create payment request
        vm.prank(budgetManager);
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            address(token),
            10000 * 10**18,
            30 days
        );
        
        vm.prank(executor);
        uint256 requestId = treasury.createPaymentRequest(
            recipient,
            address(token),
            1000 * 10**18,
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            "Payment"
        );
        
        // First approval
        vm.prank(treasurer1);
        vm.expectEmit(true, true, false, false);
        emit PaymentRequestApproved(requestId, treasurer1);
        treasury.approvePaymentRequest(requestId);
        
        (, , , , , , , uint256 approvals) = treasury.paymentRequests(requestId);
        assertEq(approvals, 1);
        assertTrue(treasury.hasApprovedPayment(requestId, treasurer1));
        
        // Try to approve again with same treasurer
        vm.prank(treasurer1);
        vm.expectRevert("Already approved");
        treasury.approvePaymentRequest(requestId);
    }
    
    function testAutoExecuteOnThreshold() public {
        // Setup
        vm.prank(budgetManager);
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            address(token),
            10000 * 10**18,
            30 days
        );
        
        // Fund treasury
        vm.prank(admin);
        token.transfer(address(treasury), 10000 * 10**18);
        
        vm.prank(executor);
        uint256 paymentAmount = 1000 * 10**18;
        uint256 requestId = treasury.createPaymentRequest(
            recipient,
            address(token),
            paymentAmount,
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            "Payment"
        );
        
        // First approval
        vm.prank(treasurer1);
        treasury.approvePaymentRequest(requestId);
        
        // Second approval should trigger auto-execution
        uint256 recipientBalanceBefore = token.balanceOf(recipient);
        
        vm.prank(treasurer2);
        vm.expectEmit(true, true, false, true);
        emit PaymentExecuted(requestId, recipient, paymentAmount);
        treasury.approvePaymentRequest(requestId);
        
        assertEq(token.balanceOf(recipient), recipientBalanceBefore + paymentAmount);
        
        (, , , , , bool executed, , ) = treasury.paymentRequests(requestId);
        assertTrue(executed);
    }
    
    function testManualExecutePayment() public {
        // Setup
        vm.prank(budgetManager);
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            address(token),
            10000 * 10**18,
            30 days
        );
        
        // Fund treasury
        vm.prank(admin);
        token.transfer(address(treasury), 10000 * 10**18);
        
        vm.prank(executor);
        uint256 paymentAmount = 1000 * 10**18;
        uint256 requestId = treasury.createPaymentRequest(
            recipient,
            address(token),
            paymentAmount,
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            "Payment"
        );
        
        // Get approvals
        vm.prank(treasurer1);
        treasury.approvePaymentRequest(requestId);
        vm.prank(treasurer2);
        treasury.approvePaymentRequest(requestId);
        
        // Manual execution
        uint256 recipientBalanceBefore = token.balanceOf(recipient);
        
        vm.prank(executor);
        treasury.executePayment(requestId);
        
        assertEq(token.balanceOf(recipient), recipientBalanceBefore + paymentAmount);
    }
    
    function testCancelPaymentRequest() public {
        // Setup and create payment request
        vm.prank(budgetManager);
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            address(token),
            10000 * 10**18,
            30 days
        );
        
        vm.prank(executor);
        uint256 requestId = treasury.createPaymentRequest(
            recipient,
            address(token),
            1000 * 10**18,
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            "Payment"
        );
        
        // Cancel
        vm.prank(treasurer1);
        vm.expectEmit(true, false, false, false);
        emit PaymentRequestCancelled(requestId);
        treasury.cancelPaymentRequest(requestId);
        
        (, , , , , , bool cancelled, ) = treasury.paymentRequests(requestId);
        assertTrue(cancelled);
        
        // Cannot approve cancelled request
        vm.prank(treasurer2);
        vm.expectRevert("Request cancelled");
        treasury.approvePaymentRequest(requestId);
    }
    
    function testBudgetExceeded() public {
        // Setup small budget
        vm.prank(budgetManager);
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            address(token),
            1000 * 10**18,
            30 days
        );
        
        // Try to create payment exceeding budget
        vm.prank(executor);
        vm.expectRevert("Exceeds budget");
        treasury.createPaymentRequest(
            recipient,
            address(token),
            2000 * 10**18,
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            "Payment"
        );
    }
    
    function testBudgetReset() public {
        // Setup budget
        vm.prank(budgetManager);
        uint256 budgetAmount = 1000 * 10**18;
        uint256 period = 1 days;
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            address(token),
            budgetAmount,
            period
        );
        
        // Fund treasury
        vm.prank(admin);
        token.transfer(address(treasury), 10000 * 10**18);
        
        // Use some budget
        vm.prank(executor);
        uint256 requestId = treasury.createPaymentRequest(
            recipient,
            address(token),
            500 * 10**18,
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            "Payment"
        );
        
        // Approve and execute
        vm.prank(treasurer1);
        treasury.approvePaymentRequest(requestId);
        vm.prank(treasurer2);
        treasury.approvePaymentRequest(requestId);
        
        // Check remaining budget
        uint256 remaining = treasury.getRemainingBudget(
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            address(token)
        );
        assertEq(remaining, 500 * 10**18);
        
        // Move to next period
        vm.warp(block.timestamp + period + 1);
        
        // Budget should be reset
        remaining = treasury.getRemainingBudget(
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            address(token)
        );
        assertEq(remaining, budgetAmount);
    }
    
    function testEmergencyWithdrawal() public {
        // Fund treasury
        uint256 ethAmount = 10 ether;
        uint256 tokenAmount = 1000 * 10**18;
        
        vm.deal(address(treasury), ethAmount);
        vm.prank(admin);
        token.transfer(address(treasury), tokenAmount);
        
        // Initiate emergency withdrawal
        address emergencyRecipient = address(0x999);
        
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit EmergencyWithdrawalInitiated(emergencyRecipient, block.timestamp);
        treasury.initiateEmergencyWithdrawal(emergencyRecipient);
        
        // Try to execute before delay
        address[] memory tokens = new address[](2);
        tokens[0] = address(0); // ETH
        tokens[1] = address(token);
        
        vm.prank(admin);
        vm.expectRevert("Delay not met");
        treasury.executeEmergencyWithdrawal(tokens);
        
        // Wait for delay
        vm.warp(block.timestamp + 3 days + 1);
        
        // Execute withdrawal
        uint256 recipientETHBefore = emergencyRecipient.balance;
        uint256 recipientTokenBefore = token.balanceOf(emergencyRecipient);
        
        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit EmergencyWithdrawalExecuted(emergencyRecipient);
        treasury.executeEmergencyWithdrawal(tokens);
        
        assertEq(emergencyRecipient.balance, recipientETHBefore + ethAmount);
        assertEq(token.balanceOf(emergencyRecipient), recipientTokenBefore + tokenAmount);
        assertEq(address(treasury).balance, 0);
        assertEq(token.balanceOf(address(treasury)), 0);
    }
    
    function testETHPaymentExecution() public {
        // Setup ETH budget
        vm.prank(budgetManager);
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.OPERATIONS,
            address(0),
            10 ether,
            30 days
        );
        
        // Fund treasury with ETH
        vm.deal(address(treasury), 10 ether);
        
        // Create ETH payment request
        vm.prank(executor);
        uint256 paymentAmount = 1 ether;
        uint256 requestId = treasury.createPaymentRequest(
            recipient,
            address(0),
            paymentAmount,
            ZKFairTreasury.BudgetCategory.OPERATIONS,
            "ETH Payment"
        );
        
        // Approve and execute
        vm.prank(treasurer1);
        treasury.approvePaymentRequest(requestId);
        
        uint256 recipientBalanceBefore = recipient.balance;
        
        vm.prank(treasurer2);
        treasury.approvePaymentRequest(requestId);
        
        assertEq(recipient.balance, recipientBalanceBefore + paymentAmount);
    }
    
    function testReceiveETH() public {
        uint256 amount = 5 ether;
        vm.deal(admin, amount);
        
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit FundsDeposited(address(0), amount, admin);
        
        (bool success, ) = payable(address(treasury)).call{value: amount}("");
        assertTrue(success);
        
        assertEq(address(treasury).balance, amount);
    }
    
    function testAccessControl() public {
        // Non-budget manager cannot allocate budget
        vm.prank(treasurer1);
        vm.expectRevert();
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            address(token),
            1000 * 10**18,
            30 days
        );
        
        // Non-executor cannot create payment request
        vm.prank(treasurer1);
        vm.expectRevert();
        treasury.createPaymentRequest(
            recipient,
            address(token),
            100 * 10**18,
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            "Payment"
        );
        
        // Non-treasurer cannot approve payment
        vm.prank(executor);
        vm.expectRevert();
        treasury.approvePaymentRequest(0);
        
        // Non-admin cannot initiate emergency withdrawal
        vm.prank(treasurer1);
        vm.expectRevert();
        treasury.initiateEmergencyWithdrawal(recipient);
    }
    
    function testMultipleBudgetCategories() public {
        vm.startPrank(budgetManager);
        
        // Allocate different budgets for different categories
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.DEVELOPMENT,
            address(token),
            5000 * 10**18,
            30 days
        );
        
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.MARKETING,
            address(token),
            3000 * 10**18,
            30 days
        );
        
        treasury.allocateBudget(
            ZKFairTreasury.BudgetCategory.GRANTS,
            address(token),
            2000 * 10**18,
            30 days
        );
        
        vm.stopPrank();
        
        // Check each budget is separate
        assertEq(
            treasury.getRemainingBudget(ZKFairTreasury.BudgetCategory.DEVELOPMENT, address(token)),
            5000 * 10**18
        );
        assertEq(
            treasury.getRemainingBudget(ZKFairTreasury.BudgetCategory.MARKETING, address(token)),
            3000 * 10**18
        );
        assertEq(
            treasury.getRemainingBudget(ZKFairTreasury.BudgetCategory.GRANTS, address(token)),
            2000 * 10**18
        );
    }
}