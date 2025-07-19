// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/governance/ZKFairGovernor.sol";
import "../../src/governance/ZKFairToken.sol";
import "../../src/governance/ZKFairTimelock.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";

contract ZKFairGovernorTest is Test {
    ZKFairGovernor public governor;
    ZKFairToken public token;
    ZKFairTimelock public timelock;
    
    address public admin = address(0x1);
    address public proposer = address(0x2);
    address public voter1 = address(0x3);
    address public voter2 = address(0x4);
    address public voter3 = address(0x5);
    
    uint256 constant VOTING_DELAY = 1 days;
    uint256 constant VOTING_PERIOD = 7 days;
    uint256 constant PROPOSAL_THRESHOLD = 1000e18; // 1000 tokens
    uint256 constant QUORUM_PERCENTAGE = 4; // 4%
    
    function setUp() public {
        vm.startPrank(admin);
        
        // Deploy token
        token = new ZKFairToken();
        
        // Deploy timelock
        address[] memory proposers = new address[](1);
        proposers[0] = address(0); // Governor will be proposer
        address[] memory executors = new address[](1);
        executors[0] = address(0); // Anyone can execute
        
        timelock = new ZKFairTimelock(
            2 days, // min delay
            proposers,
            executors,
            admin,
            admin // emergency multisig
        );
        
        // Deploy governor
        governor = new ZKFairGovernor(
            IVotes(address(token)),
            timelock,
            VOTING_DELAY,
            VOTING_PERIOD,
            PROPOSAL_THRESHOLD,
            QUORUM_PERCENTAGE
        );
        
        // Setup roles
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        
        // Distribute tokens
        token.transfer(proposer, 2000e18);
        token.transfer(voter1, 10000e18);
        token.transfer(voter2, 15000e18);
        token.transfer(voter3, 20000e18);
        
        vm.stopPrank();
        
        // Delegate voting power
        vm.prank(proposer);
        token.delegate(proposer);
        vm.prank(voter1);
        token.delegate(voter1);
        vm.prank(voter2);
        token.delegate(voter2);
        vm.prank(voter3);
        token.delegate(voter3);
    }
    
    function testProposalCreation() public {
        vm.startPrank(proposer);
        
        address[] memory targets = new address[](1);
        targets[0] = address(token);
        
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", voter1, 100e18);
        
        string memory description = "Transfer 100 tokens to voter1";
        
        uint256 proposalId = governor.propose(targets, values, calldatas, description);
        
        assertGt(proposalId, 0);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Pending));
        
        vm.stopPrank();
    }
    
    function testProposalWithType() public {
        vm.startPrank(proposer);
        
        address[] memory targets = new address[](1);
        targets[0] = address(token);
        
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSignature("pause()");
        
        string memory description = "Emergency: Pause token transfers";
        
        uint256 proposalId = governor.proposeWithType(
            targets,
            values,
            calldatas,
            description,
            ZKFairGovernor.ProposalType.EMERGENCY_ACTION
        );
        
        assertEq(uint256(governor.proposalTypes(proposalId)), uint256(ZKFairGovernor.ProposalType.EMERGENCY_ACTION));
        
        vm.stopPrank();
    }
    
    function testVotingProcess() public {
        // Create proposal
        vm.startPrank(proposer);
        
        address[] memory targets = new address[](1);
        targets[0] = address(token);
        
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", voter1, 100e18);
        
        string memory description = "Transfer 100 tokens to voter1";
        
        uint256 proposalId = governor.propose(targets, values, calldatas, description);
        vm.stopPrank();
        
        // Wait for voting to start
        vm.warp(block.timestamp + VOTING_DELAY + 1);
        
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Active));
        
        // Cast votes
        vm.prank(voter1);
        governor.castVote(proposalId, 1); // For
        
        vm.prank(voter2);
        governor.castVote(proposalId, 1); // For
        
        vm.prank(voter3);
        governor.castVote(proposalId, 0); // Against
        
        // Check vote counts
        (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes) = governor.proposalVotes(proposalId);
        assertEq(forVotes, 25000e18); // voter1 + voter2
        assertEq(againstVotes, 20000e18); // voter3
        assertEq(abstainVotes, 0);
    }
    
    function testProposalExecution() public {
        // Create and pass proposal
        vm.startPrank(proposer);
        
        address[] memory targets = new address[](1);
        targets[0] = address(token);
        
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", voter1, 100e18);
        
        string memory description = "Transfer 100 tokens to voter1";
        
        uint256 proposalId = governor.propose(targets, values, calldatas, description);
        vm.stopPrank();
        
        // Vote
        vm.warp(block.timestamp + VOTING_DELAY + 1);
        vm.prank(voter1);
        governor.castVote(proposalId, 1);
        vm.prank(voter2);
        governor.castVote(proposalId, 1);
        
        // Wait for voting period to end
        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Succeeded));
        
        // Queue
        governor.queue(targets, values, calldatas, keccak256(bytes(description)));
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Queued));
        
        // Wait for timelock
        vm.warp(block.timestamp + 2 days + 1);
        
        // Execute
        uint256 balanceBefore = token.balanceOf(voter1);
        governor.execute(targets, values, calldatas, keccak256(bytes(description)));
        assertEq(token.balanceOf(voter1), balanceBefore + 100e18);
        
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Executed));
    }
    
    function testQuorumRequirement() public {
        vm.startPrank(proposer);
        
        address[] memory targets = new address[](1);
        targets[0] = address(token);
        
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", voter1, 100e18);
        
        string memory description = "Transfer 100 tokens to voter1";
        
        uint256 proposalId = governor.propose(targets, values, calldatas, description);
        vm.stopPrank();
        
        // Vote with less than quorum
        vm.warp(block.timestamp + VOTING_DELAY + 1);
        vm.prank(proposer);
        governor.castVote(proposalId, 1); // Only 2000 tokens voting (less than 4% of total)
        
        // Wait for voting period to end
        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        
        // Proposal should be defeated due to lack of quorum
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Defeated));
    }
    
    function testProposalThreshold() public {
        // Try to propose with insufficient tokens
        address poorProposer = address(0x999);
        vm.startPrank(admin);
        token.transfer(poorProposer, 999e18); // Just below threshold
        vm.stopPrank();
        
        vm.startPrank(poorProposer);
        token.delegate(poorProposer);
        
        address[] memory targets = new address[](1);
        targets[0] = address(token);
        
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", voter1, 100e18);
        
        string memory description = "Transfer 100 tokens to voter1";
        
        vm.expectRevert("Governor: proposer votes below proposal threshold");
        governor.propose(targets, values, calldatas, description);
        
        vm.stopPrank();
    }
    
    function testQuadraticVoting() public {
        // Test quadratic voting calculation
        uint256 linearVotes = 10000e18;
        uint256 quadraticVotes = governor.getQuadraticVotes(voter1, block.number - 1);
        
        // Should be approximately sqrt(10000e18)
        // Due to precision, we check it's in reasonable range
        assertGt(quadraticVotes, 0);
        assertLt(quadraticVotes, linearVotes);
    }
}