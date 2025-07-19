// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/governance/ZKFairToken.sol";
import "../src/governance/ZKFairGovernor.sol";
import "../src/governance/ZKFairTimelock.sol";
import "../src/governance/ZKFairTreasury.sol";

contract DeployGovernance is Script {
    // Governance parameters
    uint256 constant TIMELOCK_MIN_DELAY = 2 days;
    uint256 constant VOTING_DELAY = 1 days; // 1 day
    uint256 constant VOTING_PERIOD = 7 days; // 1 week
    uint256 constant PROPOSAL_THRESHOLD_PERCENTAGE = 1; // 0.1% of total supply
    uint256 constant QUORUM_PERCENTAGE = 4; // 4%
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address emergencyMultisig = vm.envAddress("EMERGENCY_MULTISIG");
        
        console.log("Deploying governance contracts...");
        console.log("Deployer:", deployer);
        console.log("Emergency Multisig:", emergencyMultisig);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy Token
        console.log("\nDeploying ZKFairToken...");
        ZKFairToken token = new ZKFairToken();
        console.log("Token deployed at:", address(token));
        console.log("Initial supply:", token.INITIAL_MINT() / 1e18, "ZKF");
        
        // 2. Deploy Timelock
        console.log("\nDeploying ZKFairTimelock...");
        address[] memory proposers = new address[](1);
        proposers[0] = address(0); // Will be set to governor
        address[] memory executors = new address[](1);
        executors[0] = address(0); // Anyone can execute
        
        ZKFairTimelock timelock = new ZKFairTimelock(
            TIMELOCK_MIN_DELAY,
            proposers,
            executors,
            deployer, // admin
            emergencyMultisig
        );
        console.log("Timelock deployed at:", address(timelock));
        
        // 3. Calculate proposal threshold
        uint256 proposalThreshold = (token.MAX_SUPPLY() * PROPOSAL_THRESHOLD_PERCENTAGE) / 1000;
        
        // 4. Deploy Governor
        console.log("\nDeploying ZKFairGovernor...");
        ZKFairGovernor governor = new ZKFairGovernor(
            IVotes(address(token)),
            timelock,
            VOTING_DELAY,
            VOTING_PERIOD,
            proposalThreshold,
            QUORUM_PERCENTAGE
        );
        console.log("Governor deployed at:", address(governor));
        console.log("Proposal threshold:", proposalThreshold / 1e18, "ZKF");
        console.log("Quorum:", QUORUM_PERCENTAGE, "%");
        
        // 5. Deploy Treasury
        console.log("\nDeploying ZKFairTreasury...");
        ZKFairTreasury treasury = new ZKFairTreasury(deployer);
        console.log("Treasury deployed at:", address(treasury));
        
        // 6. Setup roles
        console.log("\nSetting up roles...");
        
        // Grant governor proposer and canceller roles on timelock
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        console.log("- Governor granted PROPOSER and CANCELLER roles on timelock");
        
        // Grant timelock executor role on treasury
        treasury.grantRole(treasury.EXECUTOR_ROLE(), address(timelock));
        console.log("- Timelock granted EXECUTOR role on treasury");
        
        // Make timelock the owner of treasury for admin functions
        treasury.grantRole(treasury.DEFAULT_ADMIN_ROLE(), address(timelock));
        console.log("- Timelock granted DEFAULT_ADMIN role on treasury");
        
        // 7. Initial token distribution (example)
        console.log("\nInitial token distribution...");
        
        // Transfer some tokens to treasury
        uint256 treasuryAmount = 10_000_000 * 10**18;
        token.transfer(address(treasury), treasuryAmount);
        console.log("- Transferred", treasuryAmount / 1e18, "ZKF to treasury");
        
        // Create vesting schedules for team (example)
        address teamLead = vm.envAddress("TEAM_LEAD");
        if (teamLead != address(0)) {
            uint256 teamVestingAmount = 5_000_000 * 10**18;
            uint256 cliffDuration = 180 days; // 6 months
            uint256 vestingDuration = 730 days; // 2 years
            
            token.createVestingSchedule(
                teamLead,
                teamVestingAmount,
                cliffDuration,
                vestingDuration
            );
            console.log("- Created vesting schedule for team lead:", teamVestingAmount / 1e18, "ZKF");
        }
        
        // 8. Renounce roles if needed
        console.log("\nFinalizing setup...");
        
        // Renounce admin role on timelock (optional - keeps deployer as admin for now)
        // timelock.renounceRole(timelock.TIMELOCK_ADMIN_ROLE(), deployer);
        
        // Transfer token ownership to timelock
        token.transferOwnership(address(timelock));
        console.log("- Token ownership transferred to timelock");
        
        vm.stopBroadcast();
        
        // Print summary
        console.log("\n=== Governance Deployment Summary ===");
        console.log("Token:", address(token));
        console.log("Timelock:", address(timelock));
        console.log("Governor:", address(governor));
        console.log("Treasury:", address(treasury));
        console.log("Voting Delay:", VOTING_DELAY / 1 days, "days");
        console.log("Voting Period:", VOTING_PERIOD / 1 days, "days");
        console.log("Timelock Delay:", TIMELOCK_MIN_DELAY / 1 days, "days");
        console.log("=====================================");
        
        // Save deployment addresses
        string memory json = string.concat(
            '{"token":"', vm.toString(address(token)), '",',
            '"timelock":"', vm.toString(address(timelock)), '",',
            '"governor":"', vm.toString(address(governor)), '",',
            '"treasury":"', vm.toString(address(treasury)), '"}'
        );
        
        vm.writeFile("./deployments/governance.json", json);
        console.log("\nDeployment addresses saved to deployments/governance.json");
    }
}