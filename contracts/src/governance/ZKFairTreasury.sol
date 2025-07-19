// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ZKFairTreasury
 * @notice Treasury contract for managing protocol funds with budget allocation
 * @dev Implements role-based access control and spending limits
 */
contract ZKFairTreasury is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Roles
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");
    bytes32 public constant BUDGET_MANAGER_ROLE = keccak256("BUDGET_MANAGER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    
    // Budget categories
    enum BudgetCategory {
        DEVELOPMENT,
        MARKETING,
        OPERATIONS,
        GRANTS,
        EMERGENCY
    }
    
    // Budget allocation structure
    struct Budget {
        uint256 allocated;
        uint256 spent;
        uint256 period; // Budget period in seconds
        uint256 lastReset; // Last time budget was reset
    }
    
    // Payment request structure
    struct PaymentRequest {
        address recipient;
        address token;
        uint256 amount;
        BudgetCategory category;
        string description;
        bool executed;
        bool cancelled;
        uint256 approvals;
        mapping(address => bool) hasApproved;
    }
    
    // State variables
    mapping(BudgetCategory => mapping(address => Budget)) public budgets; // category => token => budget
    mapping(uint256 => PaymentRequest) public paymentRequests;
    uint256 public nextRequestId;
    uint256 public constant APPROVAL_THRESHOLD = 2; // Number of approvals needed
    
    // Emergency withdrawal delay
    uint256 public constant EMERGENCY_DELAY = 3 days;
    uint256 public emergencyWithdrawalInitiated;
    address public emergencyWithdrawalRecipient;
    
    // Events
    event BudgetAllocated(BudgetCategory indexed category, address indexed token, uint256 amount, uint256 period);
    event PaymentRequestCreated(uint256 indexed requestId, address indexed recipient, uint256 amount);
    event PaymentRequestApproved(uint256 indexed requestId, address indexed approver);
    event PaymentExecuted(uint256 indexed requestId, address indexed recipient, uint256 amount);
    event PaymentRequestCancelled(uint256 indexed requestId);
    event EmergencyWithdrawalInitiated(address indexed recipient, uint256 initiatedAt);
    event EmergencyWithdrawalExecuted(address indexed recipient);
    event FundsDeposited(address indexed token, uint256 amount, address indexed depositor);
    
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TREASURER_ROLE, admin);
        _grantRole(BUDGET_MANAGER_ROLE, admin);
    }
    
    /**
     * @notice Deposit funds to treasury
     * @param token Token address (address(0) for ETH)
     * @param amount Amount to deposit
     */
    function deposit(address token, uint256 amount) external payable nonReentrant {
        if (token == address(0)) {
            require(msg.value == amount, "Incorrect ETH amount");
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }
        
        emit FundsDeposited(token, amount, msg.sender);
    }
    
    /**
     * @notice Allocate budget for a category
     * @param category Budget category
     * @param token Token address
     * @param amount Budget amount
     * @param period Budget period in seconds
     */
    function allocateBudget(
        BudgetCategory category,
        address token,
        uint256 amount,
        uint256 period
    ) external onlyRole(BUDGET_MANAGER_ROLE) {
        require(period > 0, "Invalid period");
        
        Budget storage budget = budgets[category][token];
        
        // Reset budget if period has passed
        if (block.timestamp >= budget.lastReset + budget.period) {
            budget.spent = 0;
            budget.lastReset = block.timestamp;
        }
        
        budget.allocated = amount;
        budget.period = period;
        
        if (budget.lastReset == 0) {
            budget.lastReset = block.timestamp;
        }
        
        emit BudgetAllocated(category, token, amount, period);
    }
    
    /**
     * @notice Create a payment request
     * @param recipient Payment recipient
     * @param token Token address
     * @param amount Payment amount
     * @param category Budget category
     * @param description Payment description
     */
    function createPaymentRequest(
        address recipient,
        address token,
        uint256 amount,
        BudgetCategory category,
        string memory description
    ) external onlyRole(EXECUTOR_ROLE) returns (uint256) {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        require(bytes(description).length > 0, "Description required");
        
        // Check budget availability
        Budget storage budget = budgets[category][token];
        _updateBudget(budget);
        require(budget.spent + amount <= budget.allocated, "Exceeds budget");
        
        uint256 requestId = nextRequestId++;
        PaymentRequest storage request = paymentRequests[requestId];
        
        request.recipient = recipient;
        request.token = token;
        request.amount = amount;
        request.category = category;
        request.description = description;
        
        emit PaymentRequestCreated(requestId, recipient, amount);
        
        return requestId;
    }
    
    /**
     * @notice Approve a payment request
     * @param requestId Payment request ID
     */
    function approvePaymentRequest(uint256 requestId) external onlyRole(TREASURER_ROLE) {
        PaymentRequest storage request = paymentRequests[requestId];
        require(!request.executed, "Already executed");
        require(!request.cancelled, "Request cancelled");
        require(!request.hasApproved[msg.sender], "Already approved");
        
        request.hasApproved[msg.sender] = true;
        request.approvals++;
        
        emit PaymentRequestApproved(requestId, msg.sender);
        
        // Auto-execute if threshold reached
        if (request.approvals >= APPROVAL_THRESHOLD) {
            _executePayment(requestId);
        }
    }
    
    /**
     * @notice Execute an approved payment
     * @param requestId Payment request ID
     */
    function executePayment(uint256 requestId) external nonReentrant onlyRole(EXECUTOR_ROLE) {
        PaymentRequest storage request = paymentRequests[requestId];
        require(!request.executed, "Already executed");
        require(!request.cancelled, "Request cancelled");
        require(request.approvals >= APPROVAL_THRESHOLD, "Insufficient approvals");
        
        _executePayment(requestId);
    }
    
    /**
     * @notice Cancel a payment request
     * @param requestId Payment request ID
     */
    function cancelPaymentRequest(uint256 requestId) external onlyRole(TREASURER_ROLE) {
        PaymentRequest storage request = paymentRequests[requestId];
        require(!request.executed, "Already executed");
        require(!request.cancelled, "Already cancelled");
        
        request.cancelled = true;
        emit PaymentRequestCancelled(requestId);
    }
    
    /**
     * @notice Initiate emergency withdrawal
     * @param recipient Emergency recipient address
     */
    function initiateEmergencyWithdrawal(address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(recipient != address(0), "Invalid recipient");
        
        emergencyWithdrawalInitiated = block.timestamp;
        emergencyWithdrawalRecipient = recipient;
        
        emit EmergencyWithdrawalInitiated(recipient, block.timestamp);
    }
    
    /**
     * @notice Execute emergency withdrawal after delay
     * @param tokens Array of token addresses to withdraw
     */
    function executeEmergencyWithdrawal(address[] calldata tokens) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        require(emergencyWithdrawalInitiated > 0, "Not initiated");
        require(block.timestamp >= emergencyWithdrawalInitiated + EMERGENCY_DELAY, "Delay not met");
        require(emergencyWithdrawalRecipient != address(0), "Invalid recipient");
        
        address recipient = emergencyWithdrawalRecipient;
        
        // Reset emergency state
        emergencyWithdrawalInitiated = 0;
        emergencyWithdrawalRecipient = address(0);
        
        // Withdraw all specified tokens
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) {
                // Withdraw ETH
                uint256 balance = address(this).balance;
                if (balance > 0) {
                    (bool success, ) = recipient.call{value: balance}("");
                    require(success, "ETH transfer failed");
                }
            } else {
                // Withdraw ERC20
                uint256 balance = IERC20(tokens[i]).balanceOf(address(this));
                if (balance > 0) {
                    IERC20(tokens[i]).safeTransfer(recipient, balance);
                }
            }
        }
        
        emit EmergencyWithdrawalExecuted(recipient);
    }
    
    /**
     * @notice Get remaining budget for a category
     * @param category Budget category
     * @param token Token address
     * @return remaining Remaining budget amount
     */
    function getRemainingBudget(BudgetCategory category, address token) 
        external 
        view 
        returns (uint256) 
    {
        Budget memory budget = budgets[category][token];
        
        // Check if budget needs reset
        if (block.timestamp >= budget.lastReset + budget.period) {
            return budget.allocated;
        }
        
        return budget.allocated > budget.spent ? budget.allocated - budget.spent : 0;
    }
    
    /**
     * @notice Check if address has approved a payment request
     * @param requestId Payment request ID
     * @param approver Address to check
     * @return Whether the address has approved
     */
    function hasApprovedPayment(uint256 requestId, address approver) 
        external 
        view 
        returns (bool) 
    {
        return paymentRequests[requestId].hasApproved[approver];
    }
    
    /**
     * @notice Update budget if period has passed
     * @param budget Budget to update
     */
    function _updateBudget(Budget storage budget) private {
        if (block.timestamp >= budget.lastReset + budget.period) {
            budget.spent = 0;
            budget.lastReset = block.timestamp;
        }
    }
    
    /**
     * @notice Execute a payment
     * @param requestId Payment request ID
     */
    function _executePayment(uint256 requestId) private {
        PaymentRequest storage request = paymentRequests[requestId];
        request.executed = true;
        
        // Update budget
        Budget storage budget = budgets[request.category][request.token];
        budget.spent += request.amount;
        
        // Transfer funds
        if (request.token == address(0)) {
            (bool success, ) = request.recipient.call{value: request.amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(request.token).safeTransfer(request.recipient, request.amount);
        }
        
        emit PaymentExecuted(requestId, request.recipient, request.amount);
    }
    
    /**
     * @notice Receive ETH
     */
    receive() external payable {
        emit FundsDeposited(address(0), msg.value, msg.sender);
    }
}