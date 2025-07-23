// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/governance/ZKFairTimelock.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ZKFairTimelockTest is Test {
    ZKFairTimelock public timelock;
    
    address public admin = address(0x1);
    address public proposer = address(0x2);
    address public executor = address(0x3);
    address public emergencyMultisig = address(0x4);
    address public target = address(0x5);
    
    uint256 constant MIN_DELAY = 2 days;
    
    // Events to test
    event OperationCategorized(bytes32 indexed id, ZKFairTimelock.OperationCategory category);
    event OperationBlacklistedUpdated(bytes32 indexed id, bool blacklisted);
    event CallerBlacklistedUpdated(address indexed caller, bool blacklisted);
    event EmergencyMultisigUpdated(address indexed oldMultisig, address indexed newMultisig);
    event EmergencyCancellation(bytes32 indexed id, address indexed canceller);
    
    function setUp() public {
        vm.startPrank(admin);
        
        address[] memory proposers = new address[](1);
        proposers[0] = proposer;
        
        address[] memory executors = new address[](1);
        executors[0] = executor;
        
        timelock = new ZKFairTimelock(
            MIN_DELAY,
            proposers,
            executors,
            admin,
            emergencyMultisig
        );
        
        vm.stopPrank();
    }
    
    function testInitialState() public {
        assertEq(timelock.getMinDelay(), MIN_DELAY);
        assertEq(timelock.emergencyMultisig(), emergencyMultisig);
        assertEq(timelock.ROUTINE_DELAY(), 2 days);
        assertEq(timelock.SIGNIFICANT_DELAY(), 7 days);
        assertEq(timelock.CRITICAL_DELAY(), 14 days);
        assertEq(timelock.DAILY_OPERATION_LIMIT(), 10);
    }
    
    function testScheduleRoutineOperation() public {
        vm.startPrank(proposer);
        
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", address(0x123), 1 ether);
        uint256 delay = 2 days;
        
        bytes32 id = timelock.hashOperation(target, 0, data, bytes32(0), bytes32(0));
        
        vm.expectEmit(true, false, false, true);
        emit OperationCategorized(id, ZKFairTimelock.OperationCategory.ROUTINE);
        
        timelock.schedule(target, 0, data, bytes32(0), bytes32(0), delay);
        
        assertTrue(timelock.isOperationPending(id));
        assertEq(uint256(timelock.operationCategories(id)), uint256(ZKFairTimelock.OperationCategory.ROUTINE));
        
        vm.stopPrank();
    }
    
    function testScheduleCriticalOperation() public {
        vm.startPrank(proposer);
        
        // High value operation (>100 ETH)
        bytes memory data = "";
        uint256 value = 101 ether;
        uint256 delay = 14 days;
        
        bytes32 id = timelock.hashOperation(target, value, data, bytes32(0), bytes32(0));
        
        vm.expectEmit(true, false, false, true);
        emit OperationCategorized(id, ZKFairTimelock.OperationCategory.CRITICAL);
        
        timelock.schedule(target, value, data, bytes32(0), bytes32(0), delay);
        
        assertEq(uint256(timelock.operationCategories(id)), uint256(ZKFairTimelock.OperationCategory.CRITICAL));
        
        vm.stopPrank();
    }
    
    function testScheduleWithInsufficientDelay() public {
        vm.startPrank(proposer);
        
        // Critical operation with insufficient delay
        bytes memory data = abi.encodeWithSignature("pause()");
        uint256 delay = 7 days; // Should require 14 days for critical
        
        vm.expectRevert(ZKFairTimelock.InvalidDelay.selector);
        timelock.schedule(target, 0, data, bytes32(0), bytes32(0), delay);
        
        vm.stopPrank();
    }
    
    function testDailyOperationLimit() public {
        vm.startPrank(proposer);
        
        bytes memory data = "";
        uint256 delay = 2 days;
        
        // Schedule 10 operations (the limit)
        for (uint256 i = 0; i < 10; i++) {
            timelock.schedule(target, i, data, bytes32(0), bytes32(uint256(i)), delay);
        }
        
        // 11th operation should fail
        vm.expectRevert(ZKFairTimelock.DailyLimitExceeded.selector);
        timelock.schedule(target, 11, data, bytes32(0), bytes32(uint256(11)), delay);
        
        // Move to next day
        vm.warp(block.timestamp + 1 days + 1);
        
        // Should be able to schedule again
        timelock.schedule(target, 11, data, bytes32(0), bytes32(uint256(11)), delay);
        
        vm.stopPrank();
    }
    
    function testBlacklistOperation() public {
        bytes memory data = "";
        bytes32 id = timelock.hashOperation(target, 0, data, bytes32(0), bytes32(0));
        
        // Blacklist the operation
        vm.prank(admin);
        timelock.setOperationBlacklisted(id, true);
        
        // Try to schedule blacklisted operation
        vm.prank(proposer);
        vm.expectRevert(ZKFairTimelock.OperationBlacklisted.selector);
        timelock.schedule(target, 0, data, bytes32(0), bytes32(0), 2 days);
        
        // Unblacklist
        vm.prank(admin);
        timelock.setOperationBlacklisted(id, false);
        
        // Should work now
        vm.prank(proposer);
        timelock.schedule(target, 0, data, bytes32(0), bytes32(0), 2 days);
    }
    
    function testBlacklistCaller() public {
        // Blacklist the target address
        vm.prank(admin);
        timelock.setCallerBlacklisted(target, true);
        
        // Try to schedule operation with blacklisted target
        vm.prank(proposer);
        vm.expectRevert(ZKFairTimelock.CallerBlacklisted.selector);
        timelock.schedule(target, 0, "", bytes32(0), bytes32(0), 2 days);
        
        // Unblacklist
        vm.prank(admin);
        timelock.setCallerBlacklisted(target, false);
        
        // Should work now
        vm.prank(proposer);
        timelock.schedule(target, 0, "", bytes32(0), bytes32(0), 2 days);
    }
    
    function testEmergencyCancellation() public {
        // Schedule an operation
        vm.prank(proposer);
        bytes memory data = "";
        bytes32 id = timelock.hashOperation(target, 0, data, bytes32(0), bytes32(0));
        timelock.schedule(target, 0, data, bytes32(0), bytes32(0), 2 days);
        
        // Emergency cancel
        vm.prank(emergencyMultisig);
        vm.expectEmit(true, true, false, false);
        emit EmergencyCancellation(id, emergencyMultisig);
        timelock.emergencyCancel(id);
        
        assertFalse(timelock.isOperationPending(id));
    }
    
    function testEmergencyCancellationUnauthorized() public {
        // Schedule an operation
        vm.prank(proposer);
        bytes memory data = "";
        bytes32 id = timelock.hashOperation(target, 0, data, bytes32(0), bytes32(0));
        timelock.schedule(target, 0, data, bytes32(0), bytes32(0), 2 days);
        
        // Try to emergency cancel from non-multisig
        vm.prank(admin);
        vm.expectRevert("Only emergency multisig");
        timelock.emergencyCancel(id);
    }
    
    function testUpdateEmergencyMultisig() public {
        address newMultisig = address(0x999);
        
        vm.prank(admin);
        vm.expectEmit(true, true, false, false);
        emit EmergencyMultisigUpdated(emergencyMultisig, newMultisig);
        timelock.updateEmergencyMultisig(newMultisig);
        
        assertEq(timelock.emergencyMultisig(), newMultisig);
    }
    
    function testExecuteOperation() public {
        // Schedule an operation
        vm.prank(proposer);
        bytes memory data = "";
        uint256 value = 1 ether;
        bytes32 id = timelock.hashOperation(target, value, data, bytes32(0), bytes32(0));
        timelock.schedule(target, value, data, bytes32(0), bytes32(0), 2 days);
        
        // Fund the timelock
        vm.deal(address(timelock), value);
        
        // Try to execute before delay
        vm.prank(executor);
        vm.expectRevert("TimelockController: operation is not ready");
        timelock.execute(target, value, data, bytes32(0), bytes32(0));
        
        // Wait for delay
        vm.warp(block.timestamp + 2 days + 1);
        
        // Execute
        uint256 targetBalanceBefore = target.balance;
        vm.prank(executor);
        timelock.execute(target, value, data, bytes32(0), bytes32(0));
        
        assertEq(target.balance, targetBalanceBefore + value);
        assertTrue(timelock.isOperationDone(id));
    }
    
    function testOperationCategorization() public {
        // Test admin function categorization
        bytes memory pauseData = abi.encodeWithSignature("pause()");
        bytes memory unpauseData = abi.encodeWithSignature("unpause()");
        bytes memory setAdminData = abi.encodeWithSignature("setAdmin(address)", address(0x123));
        bytes memory upgradeData = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(0x123), "");
        
        // Test parameter change categorization
        bytes memory setFeeData = abi.encodeWithSignature("setFee(uint256)", 100);
        bytes memory setParameterData = abi.encodeWithSignature("setParameter(bytes32,uint256)", bytes32("fee"), 100);
        
        vm.startPrank(proposer);
        
        // Critical operations
        bytes32 id1 = timelock.hashOperation(target, 0, pauseData, bytes32(0), bytes32(uint256(1)));
        timelock.schedule(target, 0, pauseData, bytes32(0), bytes32(uint256(1)), 14 days);
        assertEq(uint256(timelock.operationCategories(id1)), uint256(ZKFairTimelock.OperationCategory.CRITICAL));
        
        bytes32 id2 = timelock.hashOperation(target, 0, unpauseData, bytes32(0), bytes32(uint256(2)));
        timelock.schedule(target, 0, unpauseData, bytes32(0), bytes32(uint256(2)), 14 days);
        assertEq(uint256(timelock.operationCategories(id2)), uint256(ZKFairTimelock.OperationCategory.CRITICAL));
        
        bytes32 id3 = timelock.hashOperation(target, 0, setAdminData, bytes32(0), bytes32(uint256(3)));
        timelock.schedule(target, 0, setAdminData, bytes32(0), bytes32(uint256(3)), 14 days);
        assertEq(uint256(timelock.operationCategories(id3)), uint256(ZKFairTimelock.OperationCategory.CRITICAL));
        
        bytes32 id4 = timelock.hashOperation(target, 0, upgradeData, bytes32(0), bytes32(uint256(4)));
        timelock.schedule(target, 0, upgradeData, bytes32(0), bytes32(uint256(4)), 14 days);
        assertEq(uint256(timelock.operationCategories(id4)), uint256(ZKFairTimelock.OperationCategory.CRITICAL));
        
        // Significant operations
        bytes32 id5 = timelock.hashOperation(target, 0, setFeeData, bytes32(0), bytes32(uint256(5)));
        timelock.schedule(target, 0, setFeeData, bytes32(0), bytes32(uint256(5)), 7 days);
        assertEq(uint256(timelock.operationCategories(id5)), uint256(ZKFairTimelock.OperationCategory.SIGNIFICANT));
        
        bytes32 id6 = timelock.hashOperation(target, 0, setParameterData, bytes32(0), bytes32(uint256(6)));
        timelock.schedule(target, 0, setParameterData, bytes32(0), bytes32(uint256(6)), 7 days);
        assertEq(uint256(timelock.operationCategories(id6)), uint256(ZKFairTimelock.OperationCategory.SIGNIFICANT));
        
        vm.stopPrank();
    }
    
    function testAccessControl() public {
        bytes memory data = "";
        
        // Non-proposer cannot schedule
        vm.prank(executor);
        vm.expectRevert();
        timelock.schedule(target, 0, data, bytes32(0), bytes32(0), 2 days);
        
        // Non-admin cannot blacklist
        vm.prank(proposer);
        vm.expectRevert();
        timelock.setOperationBlacklisted(bytes32(0), true);
        
        // Non-admin cannot update emergency multisig
        vm.prank(proposer);
        vm.expectRevert();
        timelock.updateEmergencyMultisig(address(0x999));
    }
    
    function testGetOperationDetails() public {
        // Schedule an operation
        vm.prank(proposer);
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", address(0x123), 1 ether);
        bytes32 id = timelock.hashOperation(target, 0, data, bytes32(0), bytes32(0));
        timelock.schedule(target, 0, data, bytes32(0), bytes32(0), 2 days);
        
        // Get operation details
        (address retTarget, uint256 retValue, bytes memory retData, ZKFairTimelock.OperationCategory category) = 
            timelock.getOperationDetails(id);
        
        // Note: In the current implementation, only category is returned
        // The other values would need to be stored separately
        assertEq(uint256(category), uint256(ZKFairTimelock.OperationCategory.ROUTINE));
    }
}