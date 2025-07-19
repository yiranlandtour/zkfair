// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/governance/ZKFairToken.sol";

contract ZKFairTokenTest is Test {
    ZKFairToken public token;
    
    address public owner = address(0x1);
    address public user1 = address(0x2);
    address public user2 = address(0x3);
    address public teamMember = address(0x4);
    address public ecosystem = address(0x5);
    address public community = address(0x6);
    
    function setUp() public {
        vm.startPrank(owner);
        token = new ZKFairToken();
        vm.stopPrank();
    }
    
    function testInitialState() public {
        assertEq(token.name(), "ZKFair Token");
        assertEq(token.symbol(), "ZKF");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), token.INITIAL_MINT());
        assertEq(token.balanceOf(owner), token.INITIAL_MINT());
        assertEq(token.owner(), owner);
    }
    
    function testTokenConstants() public {
        assertEq(token.MAX_SUPPLY(), 1_000_000_000 * 10**18);
        assertEq(token.INITIAL_MINT(), 100_000_000 * 10**18);
        assertEq(token.TEAM_ALLOCATION(), 200_000_000 * 10**18);
        assertEq(token.ECOSYSTEM_ALLOCATION(), 300_000_000 * 10**18);
        assertEq(token.COMMUNITY_ALLOCATION(), 400_000_000 * 10**18);
        assertEq(token.LIQUIDITY_ALLOCATION(), 100_000_000 * 10**18);
    }
    
    function testTransfer() public {
        vm.startPrank(owner);
        uint256 amount = 1000 * 10**18;
        
        token.transfer(user1, amount);
        assertEq(token.balanceOf(user1), amount);
        assertEq(token.balanceOf(owner), token.INITIAL_MINT() - amount);
        
        vm.stopPrank();
    }
    
    function testVestingScheduleCreation() public {
        vm.startPrank(owner);
        
        uint256 vestingAmount = 10_000_000 * 10**18;
        uint256 cliffDuration = 180 days; // 6 months
        uint256 vestingDuration = 730 days; // 2 years
        
        token.createVestingSchedule(teamMember, vestingAmount, cliffDuration, vestingDuration);
        
        (uint256 totalAmount, uint256 startTime, uint256 cliff, uint256 duration, uint256 released) = token.vestingSchedules(teamMember);
        
        assertEq(totalAmount, vestingAmount);
        assertEq(startTime, block.timestamp);
        assertEq(cliff, cliffDuration);
        assertEq(duration, vestingDuration);
        assertEq(released, 0);
        
        vm.stopPrank();
    }
    
    function testVestingScheduleRelease() public {
        vm.startPrank(owner);
        
        uint256 vestingAmount = 10_000_000 * 10**18;
        uint256 cliffDuration = 180 days;
        uint256 vestingDuration = 730 days;
        
        token.createVestingSchedule(teamMember, vestingAmount, cliffDuration, vestingDuration);
        
        // Try to release before cliff
        vm.expectRevert("No tokens to release");
        token.releaseVestedTokens(teamMember);
        
        // Move past cliff
        vm.warp(block.timestamp + cliffDuration + 1);
        
        // Check releasable amount
        uint256 releasable = token.getReleasableAmount(teamMember);
        assertGt(releasable, 0);
        
        // Release tokens
        uint256 balanceBefore = token.balanceOf(teamMember);
        token.releaseVestedTokens(teamMember);
        uint256 balanceAfter = token.balanceOf(teamMember);
        
        assertEq(balanceAfter - balanceBefore, releasable);
        
        // Move to end of vesting period
        vm.warp(block.timestamp + vestingDuration);
        
        // Release remaining tokens
        token.releaseVestedTokens(teamMember);
        assertEq(token.balanceOf(teamMember), vestingAmount);
        
        vm.stopPrank();
    }
    
    function testEcosystemDistribution() public {
        vm.startPrank(owner);
        
        uint256 distributionAmount = 1_000_000 * 10**18;
        
        token.distributeEcosystemTokens(ecosystem, distributionAmount);
        assertEq(token.balanceOf(ecosystem), distributionAmount);
        assertEq(token.ecosystemDistributed(), distributionAmount);
        
        // Try to exceed allocation
        uint256 exceedAmount = token.ECOSYSTEM_ALLOCATION();
        vm.expectRevert("Exceeds ecosystem allocation");
        token.distributeEcosystemTokens(ecosystem, exceedAmount);
        
        vm.stopPrank();
    }
    
    function testCommunityDistribution() public {
        vm.startPrank(owner);
        
        uint256 distributionAmount = 2_000_000 * 10**18;
        
        token.distributeCommunityTokens(community, distributionAmount);
        assertEq(token.balanceOf(community), distributionAmount);
        assertEq(token.communityDistributed(), distributionAmount);
        
        // Try to exceed allocation
        uint256 exceedAmount = token.COMMUNITY_ALLOCATION();
        vm.expectRevert("Exceeds community allocation");
        token.distributeCommunityTokens(community, exceedAmount);
        
        vm.stopPrank();
    }
    
    function testMaxSupplyEnforcement() public {
        vm.startPrank(owner);
        
        // Distribute near max
        uint256 largeAmount = 850_000_000 * 10**18;
        
        // This should work (total would be 950M)
        token.distributeCommunityTokens(community, 400_000_000 * 10**18);
        token.distributeEcosystemTokens(ecosystem, 300_000_000 * 10**18);
        
        // Create vesting that would exceed max supply
        vm.expectRevert("Exceeds max supply");
        token.createVestingSchedule(teamMember, 200_000_000 * 10**18, 0, 365 days);
        
        vm.stopPrank();
    }
    
    function testBurnFunctionality() public {
        vm.startPrank(owner);
        
        uint256 burnAmount = 1_000_000 * 10**18;
        uint256 supplyBefore = token.totalSupply();
        
        token.burn(burnAmount);
        
        assertEq(token.totalSupply(), supplyBefore - burnAmount);
        assertEq(token.balanceOf(owner), token.INITIAL_MINT() - burnAmount);
        
        vm.stopPrank();
    }
    
    function testPauseUnpause() public {
        vm.startPrank(owner);
        
        // Pause token
        token.pause();
        
        // Try to transfer while paused
        vm.expectRevert("Pausable: paused");
        token.transfer(user1, 100);
        
        // Unpause
        token.unpause();
        
        // Transfer should work now
        token.transfer(user1, 100);
        assertEq(token.balanceOf(user1), 100);
        
        vm.stopPrank();
    }
    
    function testDelegation() public {
        vm.startPrank(owner);
        token.transfer(user1, 1000 * 10**18);
        vm.stopPrank();
        
        vm.startPrank(user1);
        
        // Check initial voting power
        assertEq(token.getVotes(user1), 0);
        
        // Self-delegate
        token.delegate(user1);
        assertEq(token.getVotes(user1), 1000 * 10**18);
        
        // Delegate to another user
        token.delegate(user2);
        assertEq(token.getVotes(user1), 0);
        assertEq(token.getVotes(user2), 1000 * 10**18);
        
        vm.stopPrank();
    }
    
    function testPermitFunctionality() public {
        uint256 privateKey = 0x1234;
        address signer = vm.addr(privateKey);
        
        vm.startPrank(owner);
        token.transfer(signer, 1000 * 10**18);
        vm.stopPrank();
        
        uint256 nonce = token.nonces(signer);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 amount = 100 * 10**18;
        
        // Create permit signature
        bytes32 permitHash = keccak256(
            abi.encodePacked(
                "\x19\x01",
                token.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                        signer,
                        user1,
                        amount,
                        nonce,
                        deadline
                    )
                )
            )
        );
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, permitHash);
        
        // Use permit
        token.permit(signer, user1, amount, deadline, v, r, s);
        
        // Check allowance
        assertEq(token.allowance(signer, user1), amount);
    }
    
    function testOnlyOwnerFunctions() public {
        vm.startPrank(user1);
        
        vm.expectRevert("Ownable: caller is not the owner");
        token.createVestingSchedule(teamMember, 1000, 0, 365 days);
        
        vm.expectRevert("Ownable: caller is not the owner");
        token.distributeEcosystemTokens(ecosystem, 1000);
        
        vm.expectRevert("Ownable: caller is not the owner");
        token.distributeCommunityTokens(community, 1000);
        
        vm.expectRevert("Ownable: caller is not the owner");
        token.pause();
        
        vm.stopPrank();
    }
}