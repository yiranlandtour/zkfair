// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/MockUSDC.sol";
import "../src/MockUSDT.sol";
import "../src/BridgedUSDC.sol";
import "../src/EnhancedPaymaster.sol";

contract DeployStablecoins is Script {
    // Addresses from previous deployments
    address constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;
    address constant PAYMASTER = address(0); // Set after paymaster deployment
    
    // Mock Chainlink price feed addresses (for testnet)
    address constant USDC_USD_FEED = 0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6;
    address constant USDT_USD_FEED = 0x3E7d1eAB13ad0104d2750B8863b489D65364e32D;
    address constant ETH_USD_FEED = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying from:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy mock stablecoins for testing
        MockUSDC mockUSDC = new MockUSDC();
        console.log("MockUSDC deployed at:", address(mockUSDC));
        
        MockUSDT mockUSDT = new MockUSDT();
        console.log("MockUSDT deployed at:", address(mockUSDT));
        
        // Deploy bridged USDC (for production use)
        address bridge = deployer; // In production, this would be the bridge contract
        BridgedUSDC bridgedUSDC = new BridgedUSDC(
            0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48, // L1 USDC address
            bridge
        );
        console.log("BridgedUSDC deployed at:", address(bridgedUSDC));
        
        // Configure Paymaster if already deployed
        if (PAYMASTER != address(0)) {
            EnhancedPaymaster paymaster = EnhancedPaymaster(payable(PAYMASTER));
            
            // Set token oracles
            paymaster.setTokenOracle(
                IERC20(address(mockUSDC)),
                AggregatorV3Interface(USDC_USD_FEED),
                105000 // 5% markup
            );
            
            paymaster.setTokenOracle(
                IERC20(address(mockUSDT)),
                AggregatorV3Interface(USDT_USD_FEED),
                105000 // 5% markup
            );
            
            console.log("Paymaster configured for USDC and USDT");
        }
        
        // Mint some tokens to test addresses
        address[] memory testAddresses = new address[](3);
        testAddresses[0] = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        testAddresses[1] = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
        testAddresses[2] = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
        
        for (uint i = 0; i < testAddresses.length; i++) {
            mockUSDC.mint(testAddresses[i], 10000 * 10**6); // 10k USDC
            mockUSDT.mint(testAddresses[i], 10000 * 10**6); // 10k USDT
            console.log("Minted tokens to:", testAddresses[i]);
        }
        
        vm.stopBroadcast();
        
        // Write deployment addresses to file
        string memory deploymentData = string(abi.encodePacked(
            '{\n',
            '  "mockUSDC": "', vm.toString(address(mockUSDC)), '",\n',
            '  "mockUSDT": "', vm.toString(address(mockUSDT)), '",\n',
            '  "bridgedUSDC": "', vm.toString(address(bridgedUSDC)), '",\n',
            '  "timestamp": ', vm.toString(block.timestamp), '\n',
            '}'
        ));
        
        vm.writeFile("./deployments/stablecoins.json", deploymentData);
        
        console.log("\nDeployment complete!");
        console.log("Deployment addresses saved to ./deployments/stablecoins.json");
    }
}