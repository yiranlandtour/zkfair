// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/EnhancedPaymaster.sol";
import "../src/MockUSDC.sol";
import "../src/SmartWallet.sol";
import "../src/SmartWalletFactory.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

contract ERC20PaymasterTest is Test {
    EntryPoint public entryPoint;
    EnhancedPaymaster public paymaster;
    MockUSDC public usdc;
    SmartWalletFactory public factory;
    
    address public owner = address(0x1);
    address public user = address(0x2);
    address public bundler = address(0x3);
    
    // Mock price feed
    MockAggregator public priceFeed;
    
    function setUp() public {
        // Deploy core contracts
        entryPoint = new EntryPoint();
        paymaster = new EnhancedPaymaster(IEntryPoint(address(entryPoint)));
        usdc = new MockUSDC();
        factory = new SmartWalletFactory();
        
        // Deploy mock price feed
        priceFeed = new MockAggregator();
        priceFeed.setPrice(1e8); // $1 = 1 USDC
        
        // Configure paymaster
        paymaster.setTokenOracle(
            IERC20(address(usdc)),
            AggregatorV3Interface(address(priceFeed)),
            105000 // 5% markup
        );
        
        // Fund paymaster with ETH
        vm.deal(address(paymaster), 10 ether);
        paymaster.deposit{value: 5 ether}();
        paymaster.addStake{value: 1 ether}(86400);
        
        // Setup test accounts
        vm.deal(owner, 10 ether);
        vm.deal(bundler, 10 ether);
        usdc.mint(user, 10000 * 10**6); // 10k USDC
    }
    
    function testPaymasterValidation() public {
        // Create smart wallet for user
        SmartWallet wallet = factory.createWallet(user, 0);
        
        // User approves paymaster
        vm.prank(user);
        usdc.approve(address(paymaster), type(uint256).max);
        
        // Create user operation
        UserOperation memory userOp = UserOperation({
            sender: address(wallet),
            nonce: 0,
            initCode: "",
            callData: "",
            callGasLimit: 100000,
            verificationGasLimit: 100000,
            preVerificationGas: 50000,
            maxFeePerGas: 10 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: abi.encodePacked(
                address(paymaster),
                address(usdc),
                uint256(1e18) // 1:1 exchange rate
            ),
            signature: ""
        });
        
        // Test validation
        vm.prank(address(entryPoint));
        (bytes memory context, uint256 validationData) = paymaster.validatePaymasterUserOp(
            userOp,
            keccak256(abi.encode(userOp)),
            1 ether // max cost
        );
        
        assertEq(validationData, 0, "Validation should succeed");
        assertTrue(context.length > 0, "Context should be set");
    }
    
    function testDailyLimits() public {
        // Set user daily limit
        paymaster.setUserDailyLimit(user, 100 * 10**6); // $100 daily limit
        
        // Create wallet and approve
        SmartWallet wallet = factory.createWallet(user, 0);
        vm.prank(user);
        usdc.approve(address(paymaster), type(uint256).max);
        
        // First transaction should succeed
        _executeUserOp(wallet, 50 * 10**6); // $50
        
        // Second transaction should succeed (total $100)
        _executeUserOp(wallet, 50 * 10**6); // $50
        
        // Third transaction should fail (exceeds daily limit)
        vm.expectRevert("User daily limit exceeded");
        _executeUserOp(wallet, 1 * 10**6); // $1
    }
    
    function testWhitelistedUser() public {
        // Whitelist user
        paymaster.setUserWhitelisted(user, true);
        
        // Create wallet and approve
        SmartWallet wallet = factory.createWallet(user, 0);
        vm.prank(user);
        usdc.approve(address(paymaster), type(uint256).max);
        
        // Should be able to exceed daily limit
        _executeUserOp(wallet, 1000 * 10**6); // $1000 (no limit for whitelisted)
    }
    
    function testEmergencyPause() public {
        // Add guardian
        address guardian = address(0x4);
        paymaster.addGuardian(guardian);
        
        // Guardian pauses
        vm.prank(guardian);
        paymaster.pause();
        
        // Operations should fail when paused
        SmartWallet wallet = factory.createWallet(user, 0);
        vm.expectRevert("Pausable: paused");
        _executeUserOp(wallet, 10 * 10**6);
        
        // Owner unpauses
        paymaster.unpause();
        
        // Operations should work again
        vm.prank(user);
        usdc.approve(address(paymaster), type(uint256).max);
        _executeUserOp(wallet, 10 * 10**6);
    }
    
    function testGasCalculation() public {
        // Test different gas prices
        uint256[] memory gasPrices = new uint256[](3);
        gasPrices[0] = 10 gwei;
        gasPrices[1] = 50 gwei;
        gasPrices[2] = 100 gwei;
        
        for (uint i = 0; i < gasPrices.length; i++) {
            uint256 gasUsed = 200000; // typical UserOp gas
            uint256 expectedUSDC = (gasUsed * gasPrices[i] * 105) / 100; // with 5% markup
            
            // Create operation with specific gas price
            UserOperation memory userOp = _createUserOp(
                address(factory.createWallet(address(uint160(100 + i)), 0)),
                gasPrices[i]
            );
            
            // Validate gas calculation
            vm.prank(address(entryPoint));
            (bytes memory context,) = paymaster.validatePaymasterUserOp(
                userOp,
                keccak256(abi.encode(userOp)),
                gasUsed * gasPrices[i]
            );
            
            (, , , uint256 tokenAmount) = abi.decode(
                context,
                (address, IERC20, uint256, uint256)
            );
            
            assertApproxEqRel(tokenAmount, expectedUSDC, 0.01e18); // 1% tolerance
        }
    }
    
    // Helper functions
    function _executeUserOp(SmartWallet wallet, uint256 usdcCost) internal {
        UserOperation memory userOp = _createUserOp(address(wallet), 10 gwei);
        
        vm.prank(address(entryPoint));
        (bytes memory context,) = paymaster.validatePaymasterUserOp(
            userOp,
            keccak256(abi.encode(userOp)),
            usdcCost
        );
        
        // Simulate postOp
        vm.prank(address(entryPoint));
        paymaster.postOp(
            IPaymaster.PostOpMode.opSucceeded,
            context,
            usdcCost * 95 / 100 // actual gas cost
        );
    }
    
    function _createUserOp(address sender, uint256 gasPrice) 
        internal 
        pure 
        returns (UserOperation memory) 
    {
        return UserOperation({
            sender: sender,
            nonce: 0,
            initCode: "",
            callData: "",
            callGasLimit: 100000,
            verificationGasLimit: 100000,
            preVerificationGas: 50000,
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice / 10,
            paymasterAndData: "",
            signature: ""
        });
    }
}

// Mock price feed for testing
contract MockAggregator {
    int256 public price;
    
    function setPrice(int256 _price) external {
        price = _price;
    }
    
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, price, block.timestamp, block.timestamp, 1);
    }
}