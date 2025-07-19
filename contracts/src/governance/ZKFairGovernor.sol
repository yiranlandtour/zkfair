// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorPreventLateQuorum.sol";

/**
 * @title ZKFairGovernor
 * @notice Governance contract for ZKFair L2 protocol
 * @dev Implements OpenZeppelin Governor with timelock control and quadratic voting
 */
contract ZKFairGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl,
    GovernorPreventLateQuorum
{
    // Proposal types for categorization
    enum ProposalType {
        PARAMETER_CHANGE,
        PROTOCOL_UPGRADE,
        TREASURY_ALLOCATION,
        EMERGENCY_ACTION
    }

    // Mapping to track proposal types
    mapping(uint256 => ProposalType) public proposalTypes;

    // Events
    event ProposalCreatedWithType(uint256 indexed proposalId, ProposalType proposalType);
    event EmergencyActionExecuted(uint256 indexed proposalId);

    constructor(
        IVotes _token,
        TimelockController _timelock,
        uint256 _votingDelay,
        uint256 _votingPeriod,
        uint256 _proposalThreshold,
        uint256 _quorumPercentage
    )
        Governor("ZKFair Governor")
        GovernorSettings(
            _votingDelay,      // 1 day
            _votingPeriod,     // 1 week
            _proposalThreshold // 0.1% of total supply
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(_quorumPercentage) // 4% quorum
        GovernorTimelockControl(_timelock)
        GovernorPreventLateQuorum(2 days)
    {}

    /**
     * @notice Create a proposal with a specific type
     * @param targets Contract addresses to call
     * @param values ETH values to send
     * @param calldatas Encoded function calls
     * @param description Proposal description
     * @param proposalType Type of the proposal
     */
    function proposeWithType(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        ProposalType proposalType
    ) public returns (uint256) {
        uint256 proposalId = propose(targets, values, calldatas, description);
        proposalTypes[proposalId] = proposalType;
        emit ProposalCreatedWithType(proposalId, proposalType);
        return proposalId;
    }

    /**
     * @notice Execute an emergency action (bypasses timelock for critical updates)
     * @dev Only callable by governance with supermajority
     */
    function executeEmergencyAction(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public payable {
        uint256 proposalId = hashProposal(targets, values, calldatas, descriptionHash);
        
        require(
            proposalTypes[proposalId] == ProposalType.EMERGENCY_ACTION,
            "Not an emergency action"
        );
        
        // Require 75% approval for emergency actions
        (uint256 againstVotes, uint256 forVotes, ) = proposalVotes(proposalId);
        require(
            forVotes > (againstVotes + forVotes) * 75 / 100,
            "Emergency action requires 75% approval"
        );
        
        _execute(proposalId, targets, values, calldatas, descriptionHash);
        emit EmergencyActionExecuted(proposalId);
    }

    /**
     * @notice Get voting power for quadratic voting
     * @param account Address to check
     * @param blockNumber Block number to check
     * @return Quadratic voting power (sqrt of token balance)
     */
    function getQuadraticVotes(address account, uint256 blockNumber) 
        public 
        view 
        returns (uint256) 
    {
        uint256 linearVotes = token.getPastVotes(account, blockNumber);
        // Simple quadratic voting: sqrt of votes
        // In production, consider using a more sophisticated formula
        return sqrt(linearVotes);
    }

    /**
     * @notice Calculate square root for quadratic voting
     * @param x Input value
     * @return y Square root of x
     */
    function sqrt(uint256 x) internal pure returns (uint256 y) {
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    // Override functions for compatibility

    function votingDelay()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(IGovernor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public override(Governor, IGovernor) returns (uint256) {
        return super.propose(targets, values, calldatas, description);
    }

    function proposalDeadline(uint256 proposalId)
        public
        view
        override(IGovernor, Governor, GovernorPreventLateQuorum)
        returns (uint256)
    {
        return super.proposalDeadline(proposalId);
    }

    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _castVote(
        uint256 proposalId,
        address account,
        uint8 support,
        string memory reason,
        bytes memory params
    ) internal override(Governor, GovernorPreventLateQuorum) returns (uint256) {
        return super._castVote(proposalId, account, support, reason, params);
    }
}