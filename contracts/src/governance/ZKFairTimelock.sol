// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title ZKFairTimelock
 * @notice Timelock controller for ZKFair governance with enhanced security features
 * @dev Extends OpenZeppelin TimelockController with additional safety mechanisms
 */
contract ZKFairTimelock is TimelockController {
    // Custom errors
    error OperationBlacklisted();
    error CallerBlacklisted();
    error InvalidDelay();
    error DailyLimitExceeded();
    
    // Operation categories for different delay requirements
    enum OperationCategory {
        ROUTINE,        // 2 days delay
        SIGNIFICANT,    // 7 days delay
        CRITICAL        // 14 days delay
    }
    
    // State variables
    mapping(bytes32 => OperationCategory) public operationCategories;
    mapping(bytes32 => bool) public blacklistedOperations;
    mapping(address => bool) public blacklistedCallers;
    
    // Daily operation limits for security
    uint256 public constant DAILY_OPERATION_LIMIT = 10;
    uint256 public currentDay;
    uint256 public operationsToday;
    
    // Enhanced delay requirements
    uint256 public constant ROUTINE_DELAY = 2 days;
    uint256 public constant SIGNIFICANT_DELAY = 7 days;
    uint256 public constant CRITICAL_DELAY = 14 days;
    
    // Emergency multisig that can cancel operations
    address public emergencyMultisig;
    
    // Events
    event OperationCategorized(bytes32 indexed id, OperationCategory category);
    event OperationBlacklistedUpdated(bytes32 indexed id, bool blacklisted);
    event CallerBlacklistedUpdated(address indexed caller, bool blacklisted);
    event EmergencyMultisigUpdated(address indexed oldMultisig, address indexed newMultisig);
    event EmergencyCancellation(bytes32 indexed id, address indexed canceller);
    
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin,
        address _emergencyMultisig
    ) TimelockController(minDelay, proposers, executors, admin) {
        require(_emergencyMultisig != address(0), "Invalid emergency multisig");
        emergencyMultisig = _emergencyMultisig;
        currentDay = block.timestamp / 1 days;
    }
    
    /**
     * @notice Schedule an operation with automatic categorization
     * @dev Overrides parent to add categorization and validation
     */
    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) public override onlyRole(PROPOSER_ROLE) {
        bytes32 id = hashOperation(target, value, data, predecessor, salt);
        
        // Check blacklists
        if (blacklistedOperations[id]) revert OperationBlacklisted();
        if (blacklistedCallers[target]) revert CallerBlacklisted();
        
        // Auto-categorize based on target and value
        OperationCategory category = _categorizeOperation(target, value, data);
        operationCategories[id] = category;
        
        // Enforce minimum delay based on category
        uint256 minRequiredDelay = _getMinimumDelay(category);
        if (delay < minRequiredDelay) revert InvalidDelay();
        
        // Check daily limit
        _updateDailyLimit();
        if (operationsToday >= DAILY_OPERATION_LIMIT) revert DailyLimitExceeded();
        operationsToday++;
        
        super.schedule(target, value, data, predecessor, salt, delay);
        emit OperationCategorized(id, category);
    }
    
    /**
     * @notice Emergency cancellation by multisig
     * @param id Operation ID to cancel
     */
    function emergencyCancel(bytes32 id) external {
        require(msg.sender == emergencyMultisig, "Only emergency multisig");
        require(isOperationPending(id), "Operation not pending");
        
        cancel(id);
        emit EmergencyCancellation(id, msg.sender);
    }
    
    /**
     * @notice Blacklist an operation hash
     * @param id Operation ID to blacklist
     * @param blacklisted Whether to blacklist or unblacklist
     */
    function setOperationBlacklisted(bytes32 id, bool blacklisted) 
        external 
        onlyRole(TIMELOCK_ADMIN_ROLE) 
    {
        blacklistedOperations[id] = blacklisted;
        emit OperationBlacklistedUpdated(id, blacklisted);
    }
    
    /**
     * @notice Blacklist a caller address
     * @param caller Address to blacklist
     * @param blacklisted Whether to blacklist or unblacklist
     */
    function setCallerBlacklisted(address caller, bool blacklisted) 
        external 
        onlyRole(TIMELOCK_ADMIN_ROLE) 
    {
        blacklistedCallers[caller] = blacklisted;
        emit CallerBlacklistedUpdated(caller, blacklisted);
    }
    
    /**
     * @notice Update emergency multisig address
     * @param newMultisig New emergency multisig address
     */
    function updateEmergencyMultisig(address newMultisig) 
        external 
        onlyRole(TIMELOCK_ADMIN_ROLE) 
    {
        require(newMultisig != address(0), "Invalid multisig address");
        address oldMultisig = emergencyMultisig;
        emergencyMultisig = newMultisig;
        emit EmergencyMultisigUpdated(oldMultisig, newMultisig);
    }
    
    /**
     * @notice Categorize operation based on target and data
     * @param target Target address
     * @param value ETH value
     * @param data Call data
     * @return category Operation category
     */
    function _categorizeOperation(
        address target,
        uint256 value,
        bytes calldata data
    ) private pure returns (OperationCategory) {
        // Critical operations: high value transfers, admin functions
        if (value > 100 ether) {
            return OperationCategory.CRITICAL;
        }
        
        // Check function selector for admin operations
        if (data.length >= 4) {
            bytes4 selector = bytes4(data[:4]);
            
            // Common admin function selectors (customize based on your contracts)
            if (selector == bytes4(keccak256("upgradeToAndCall(address,bytes)")) ||
                selector == bytes4(keccak256("setAdmin(address)")) ||
                selector == bytes4(keccak256("pause()")) ||
                selector == bytes4(keccak256("unpause()"))) {
                return OperationCategory.CRITICAL;
            }
            
            // Parameter changes
            if (selector == bytes4(keccak256("setParameter(bytes32,uint256)")) ||
                selector == bytes4(keccak256("setFee(uint256)"))) {
                return OperationCategory.SIGNIFICANT;
            }
        }
        
        // Default to routine
        return OperationCategory.ROUTINE;
    }
    
    /**
     * @notice Get minimum delay for operation category
     * @param category Operation category
     * @return Minimum delay in seconds
     */
    function _getMinimumDelay(OperationCategory category) private pure returns (uint256) {
        if (category == OperationCategory.CRITICAL) {
            return CRITICAL_DELAY;
        } else if (category == OperationCategory.SIGNIFICANT) {
            return SIGNIFICANT_DELAY;
        } else {
            return ROUTINE_DELAY;
        }
    }
    
    /**
     * @notice Update daily operation counter
     */
    function _updateDailyLimit() private {
        uint256 today = block.timestamp / 1 days;
        if (today > currentDay) {
            currentDay = today;
            operationsToday = 0;
        }
    }
    
    /**
     * @notice Get operation details including category
     * @param id Operation ID
     * @return target Target address
     * @return value ETH value
     * @return data Call data
     * @return category Operation category
     */
    function getOperationDetails(bytes32 id) 
        external 
        view 
        returns (
            address target,
            uint256 value,
            bytes memory data,
            OperationCategory category
        ) 
    {
        require(isOperation(id), "Operation doesn't exist");
        // Note: This is a simplified version. In production, you'd need to store
        // operation details separately to retrieve them
        category = operationCategories[id];
    }
}