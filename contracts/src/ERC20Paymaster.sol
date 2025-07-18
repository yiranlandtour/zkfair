// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract ERC20Paymaster is BasePaymaster, Ownable {
    using SafeERC20 for IERC20;

    mapping(IERC20 => AggregatorV3Interface) public priceOracles;
    mapping(IERC20 => uint256) public priceMarkup;
    
    uint256 private constant PRICE_DENOMINATOR = 1e6;
    uint256 private constant REFUND_POSTOP_COST = 40000;
    
    event TokenPriceOracleUpdated(IERC20 token, AggregatorV3Interface oracle, uint256 priceMarkup);
    event UserOperationSponsored(address indexed user, IERC20 token, uint256 tokenAmount, uint256 gasCost);
    
    constructor(IEntryPoint _entryPoint) BasePaymaster(_entryPoint) Ownable(msg.sender) {}
    
    function setTokenOracle(
        IERC20 token,
        AggregatorV3Interface oracle,
        uint256 _priceMarkup
    ) external onlyOwner {
        require(_priceMarkup <= 200000, "Markup too high");
        require(_priceMarkup >= 100000, "Markup too low");
        priceOracles[token] = oracle;
        priceMarkup[token] = _priceMarkup;
        emit TokenPriceOracleUpdated(token, oracle, _priceMarkup);
    }
    
    function _validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal override returns (bytes memory context, uint256 validationData) {
        (IERC20 token, uint256 exchangeRate) = _decodePaymasterData(userOp.paymasterAndData);
        
        require(priceOracles[token] != AggregatorV3Interface(address(0)), "Unsupported token");
        
        uint256 tokenAmount = (maxCost * exchangeRate) / 1e18;
        tokenAmount = (tokenAmount * priceMarkup[token]) / PRICE_DENOMINATOR;
        
        require(token.balanceOf(userOp.sender) >= tokenAmount, "Insufficient balance");
        require(token.allowance(userOp.sender, address(this)) >= tokenAmount, "Insufficient allowance");
        
        return (abi.encode(userOp.sender, token, exchangeRate, tokenAmount), 0);
    }
    
    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal override {
        if (mode == PostOpMode.postOpReverted) {
            return;
        }
        
        (address user, IERC20 token, uint256 exchangeRate, uint256 maxTokenAmount) = 
            abi.decode(context, (address, IERC20, uint256, uint256));
        
        uint256 actualTokenAmount = ((actualGasCost + REFUND_POSTOP_COST) * exchangeRate) / 1e18;
        actualTokenAmount = (actualTokenAmount * priceMarkup[token]) / PRICE_DENOMINATOR;
        
        if (actualTokenAmount > maxTokenAmount) {
            actualTokenAmount = maxTokenAmount;
        }
        
        token.safeTransferFrom(user, address(this), actualTokenAmount);
        
        emit UserOperationSponsored(user, token, actualTokenAmount, actualGasCost);
    }
    
    function _decodePaymasterData(bytes calldata paymasterAndData) 
        internal 
        pure 
        returns (IERC20 token, uint256 exchangeRate) 
    {
        require(paymasterAndData.length >= 52, "Invalid data length");
        token = IERC20(address(bytes20(paymasterAndData[20:40])));
        exchangeRate = uint256(bytes32(paymasterAndData[40:72]));
    }
    
    function getTokenExchangeRate(IERC20 token) public view returns (uint256) {
        AggregatorV3Interface oracle = priceOracles[token];
        require(address(oracle) != address(0), "Token not supported");
        
        (, int256 price,,,) = oracle.latestRoundData();
        require(price > 0, "Invalid price");
        
        return uint256(price);
    }
    
    function withdrawToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }
    
    function withdrawEth(address payable to, uint256 amount) external onlyOwner {
        to.transfer(amount);
    }
    
    receive() external payable {}
}