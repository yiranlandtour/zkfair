// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/FeeCollector.sol";
import "../src/MockUSDC.sol";

contract FeeCollectorTest is Test {
    FeeCollector public feeCollector;
    MockUSDC public usdc;
    MockUSDC public usdt;

    address public owner = address(1);
    address public treasury = address(2);
    address public development = address(3);
    address public rewards = address(4);
    address public feeSource = address(5);

    function setUp() public {
        vm.startPrank(owner);
        
        feeCollector = new FeeCollector();
        usdc = new MockUSDC();
        usdt = new MockUSDC();
        
        // Add supported tokens
        feeCollector.addSupportedToken(address(usdc));
        feeCollector.addSupportedToken(address(usdt));
        
        // Set up fee distribution
        feeCollector.addRecipient(treasury, 5000, "Treasury"); // 50%
        feeCollector.addRecipient(development, 3000, "Development"); // 30%
        feeCollector.addRecipient(rewards, 2000, "Rewards"); // 20%
        
        vm.stopPrank();
        
        // Mint tokens to fee source
        usdc.mint(feeSource, 100000e6);
        usdt.mint(feeSource, 100000e6);
    }

    function testAddRecipient() public {
        vm.startPrank(owner);
        
        address newRecipient = address(6);
        vm.expectRevert("FeeCollector: Total percentage exceeds 100%");
        feeCollector.addRecipient(newRecipient, 1000, "New"); // Would be 110%
        
        // Remove one recipient first
        feeCollector.removeRecipient(rewards);
        
        // Now we can add
        feeCollector.addRecipient(newRecipient, 1500, "New"); // 15%
        
        FeeCollector.FeeDistribution[] memory distributions = feeCollector.getDistributions();
        assertEq(distributions.length, 3);
        
        vm.stopPrank();
    }

    function testRemoveRecipient() public {
        vm.startPrank(owner);
        
        feeCollector.removeRecipient(development);
        
        FeeCollector.FeeDistribution[] memory distributions = feeCollector.getDistributions();
        assertEq(distributions.length, 2);
        assertEq(distributions[0].recipient, treasury);
        assertEq(distributions[1].recipient, rewards);
        
        vm.stopPrank();
    }

    function testUpdateDistribution() public {
        vm.startPrank(owner);
        
        feeCollector.updateDistribution(treasury, 6000); // 60%
        
        FeeCollector.FeeDistribution[] memory distributions = feeCollector.getDistributions();
        assertEq(distributions[0].percentage, 6000);
        
        // Test exceeding 100%
        vm.expectRevert("FeeCollector: Total percentage exceeds 100%");
        feeCollector.updateDistribution(development, 4100); // Would be 101%
        
        vm.stopPrank();
    }

    function testCollectFees() public {
        vm.startPrank(feeSource);
        
        uint256 amount = 1000e6;
        usdc.approve(address(feeCollector), amount);
        
        feeCollector.collectFees(address(usdc), amount);
        
        (uint256 totalCollected, , uint256 pending) = feeCollector.getTokenFees(address(usdc));
        assertEq(totalCollected, amount);
        assertEq(pending, amount);
        
        vm.stopPrank();
    }

    function testCollectETH() public {
        uint256 amount = 1 ether;
        
        vm.deal(feeSource, amount);
        vm.prank(feeSource);
        (bool success, ) = address(feeCollector).call{value: amount}("");
        assertTrue(success);
        
        (uint256 totalCollected, , uint256 pending) = feeCollector.getTokenFees(address(0));
        assertEq(totalCollected, amount);
        assertEq(pending, amount);
    }

    function testDistributeFees() public {
        // Collect fees first
        uint256 amount = 1000e6;
        vm.startPrank(feeSource);
        usdc.approve(address(feeCollector), amount);
        feeCollector.collectFees(address(usdc), amount);
        vm.stopPrank();
        
        // Check initial balances
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 developmentBefore = usdc.balanceOf(development);
        uint256 rewardsBefore = usdc.balanceOf(rewards);
        
        // Distribute
        feeCollector.distributeFees(address(usdc));
        
        // Check distributions
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, 500e6); // 50%
        assertEq(usdc.balanceOf(development) - developmentBefore, 300e6); // 30%
        assertEq(usdc.balanceOf(rewards) - rewardsBefore, 200e6); // 20%
        
        // Check pending is cleared
        (, , uint256 pending) = feeCollector.getTokenFees(address(usdc));
        assertEq(pending, 0);
    }

    function testDistributeETH() public {
        // Collect ETH
        uint256 amount = 1 ether;
        vm.deal(feeSource, amount);
        vm.prank(feeSource);
        (bool success, ) = address(feeCollector).call{value: amount}("");
        assertTrue(success);
        
        // Check initial balances
        uint256 treasuryBefore = treasury.balance;
        uint256 developmentBefore = development.balance;
        uint256 rewardsBefore = rewards.balance;
        
        // Distribute
        feeCollector.distributeFees(address(0));
        
        // Check distributions
        assertEq(treasury.balance - treasuryBefore, 0.5 ether); // 50%
        assertEq(development.balance - developmentBefore, 0.3 ether); // 30%
        assertEq(rewards.balance - rewardsBefore, 0.2 ether); // 20%
    }

    function testDistributeAllFees() public {
        // Collect multiple tokens
        vm.startPrank(feeSource);
        
        uint256 usdcAmount = 1000e6;
        uint256 usdtAmount = 2000e6;
        uint256 ethAmount = 1 ether;
        
        usdc.approve(address(feeCollector), usdcAmount);
        usdt.approve(address(feeCollector), usdtAmount);
        
        feeCollector.collectFees(address(usdc), usdcAmount);
        feeCollector.collectFees(address(usdt), usdtAmount);
        
        vm.deal(feeSource, ethAmount);
        (bool success, ) = address(feeCollector).call{value: ethAmount}("");
        assertTrue(success);
        
        vm.stopPrank();
        
        // Distribute all
        feeCollector.distributeAllFees();
        
        // Check all pending amounts are zero
        (, , uint256 usdcPending) = feeCollector.getTokenFees(address(usdc));
        (, , uint256 usdtPending) = feeCollector.getTokenFees(address(usdt));
        (, , uint256 ethPending) = feeCollector.getTokenFees(address(0));
        
        assertEq(usdcPending, 0);
        assertEq(usdtPending, 0);
        assertEq(ethPending, 0);
    }

    function testEmergencyWithdraw() public {
        // Collect fees
        uint256 amount = 1000e6;
        vm.startPrank(feeSource);
        usdc.approve(address(feeCollector), amount);
        feeCollector.collectFees(address(usdc), amount);
        vm.stopPrank();
        
        // Emergency withdraw
        address emergencyRecipient = address(7);
        uint256 withdrawAmount = 500e6;
        
        vm.prank(owner);
        feeCollector.emergencyWithdraw(address(usdc), emergencyRecipient, withdrawAmount);
        
        assertEq(usdc.balanceOf(emergencyRecipient), withdrawAmount);
    }

    function testRoundingDust() public {
        // Test with amount that doesn't divide evenly
        uint256 amount = 1000e6 + 1; // 1000.000001 USDC
        
        vm.startPrank(feeSource);
        usdc.approve(address(feeCollector), amount);
        feeCollector.collectFees(address(usdc), amount);
        vm.stopPrank();
        
        // Distribute
        feeCollector.distributeFees(address(usdc));
        
        // Treasury should get the dust (first recipient)
        uint256 expectedTreasury = 500e6 + 1; // 50% + dust
        uint256 expectedDevelopment = 300e6; // 30%
        uint256 expectedRewards = 200e6; // 20%
        
        assertEq(usdc.balanceOf(treasury), expectedTreasury);
        assertEq(usdc.balanceOf(development), expectedDevelopment);
        assertEq(usdc.balanceOf(rewards), expectedRewards);
    }

    function testUnsupportedToken() public {
        address unsupportedToken = address(8);
        
        vm.expectRevert("FeeCollector: Token not supported");
        feeCollector.collectFees(unsupportedToken, 100);
    }

    function testMaxRecipients() public {
        vm.startPrank(owner);
        
        // Remove existing recipients
        feeCollector.removeRecipient(treasury);
        feeCollector.removeRecipient(development);
        feeCollector.removeRecipient(rewards);
        
        // Add max recipients
        for (uint i = 0; i < 10; i++) {
            feeCollector.addRecipient(address(uint160(100 + i)), 1000, "Recipient");
        }
        
        // Try to add one more
        vm.expectRevert("FeeCollector: Too many recipients");
        feeCollector.addRecipient(address(200), 100, "Extra");
        
        vm.stopPrank();
    }
}