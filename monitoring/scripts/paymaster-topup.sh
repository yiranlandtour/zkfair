#!/bin/bash

# ZKFair L2 Paymaster Top-up Script
# Automatically tops up Paymaster when balance is low

set -euo pipefail

# Configuration
RPC_URL="${RPC_URL:-http://localhost:8545}"
PAYMASTER_ADDRESS="${PAYMASTER_ADDRESS}"
PRIVATE_KEY="${PAYMASTER_ADMIN_PRIVATE_KEY}"
MIN_BALANCE="${MIN_BALANCE:-1}" # Minimum balance in ETH
TOP_UP_AMOUNT="${TOP_UP_AMOUNT:-5}" # Amount to top up in ETH

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "ZKFair L2 Paymaster Top-up Check"
echo "Time: $(date)"
echo "Paymaster: ${PAYMASTER_ADDRESS}"
echo "========================================="

# Check required environment variables
if [ -z "${PAYMASTER_ADDRESS}" ]; then
    echo -e "${RED}Error: PAYMASTER_ADDRESS not set${NC}"
    exit 1
fi

if [ -z "${PRIVATE_KEY}" ]; then
    echo -e "${RED}Error: PAYMASTER_ADMIN_PRIVATE_KEY not set${NC}"
    exit 1
fi

# Function to get balance
get_balance() {
    local address=$1
    
    local response=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$address\",\"latest\"],\"id\":1}" \
        2>/dev/null)
    
    local balance_hex=$(echo "$response" | grep -o '"result":"[^"]*"' | sed 's/"result":"//;s/"//')
    
    if [ -z "$balance_hex" ]; then
        echo "0"
        return 1
    fi
    
    # Convert from wei to ETH
    local balance_wei=$((16#${balance_hex#0x}))
    echo "scale=18; $balance_wei / 1000000000000000000" | bc
}

# Function to send ETH
send_eth() {
    local to=$1
    local amount_eth=$2
    
    # Convert ETH to Wei
    local amount_wei=$(echo "$amount_eth * 1000000000000000000" | bc | cut -d. -f1)
    local amount_hex=$(printf "0x%x" "$amount_wei")
    
    # Get nonce
    local from_address=$(cast wallet address --private-key "$PRIVATE_KEY" 2>/dev/null || echo "")
    if [ -z "$from_address" ]; then
        echo -e "${RED}Error: Could not derive address from private key${NC}"
        return 1
    fi
    
    local nonce_response=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionCount\",\"params\":[\"$from_address\",\"latest\"],\"id\":1}" \
        2>/dev/null)
    
    local nonce=$(echo "$nonce_response" | grep -o '"result":"[^"]*"' | sed 's/"result":"//;s/"//')
    
    # Get gas price
    local gas_price_response=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"eth_gasPrice","params":[],"id":1}' \
        2>/dev/null)
    
    local gas_price=$(echo "$gas_price_response" | grep -o '"result":"[^"]*"' | sed 's/"result":"//;s/"//')
    
    # Create and send transaction using cast
    if command -v cast &> /dev/null; then
        echo -n "Sending ${amount_eth} ETH to Paymaster... "
        
        local tx_hash=$(cast send "$to" \
            --value "${amount_wei}" \
            --private-key "$PRIVATE_KEY" \
            --rpc-url "$RPC_URL" \
            --json 2>/dev/null | jq -r '.transactionHash' || echo "")
        
        if [ -n "$tx_hash" ] && [ "$tx_hash" != "null" ]; then
            echo -e "${GREEN}OK${NC}"
            echo "Transaction hash: $tx_hash"
            return 0
        else
            echo -e "${RED}FAILED${NC}"
            return 1
        fi
    else
        echo -e "${RED}Error: 'cast' command not found. Please install Foundry.${NC}"
        return 1
    fi
}

# Function to check and top up if needed
check_and_topup() {
    # Get current balance
    echo -n "Checking Paymaster balance... "
    local current_balance=$(get_balance "$PAYMASTER_ADDRESS")
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}FAILED${NC}"
        echo "Error: Could not fetch balance"
        return 1
    fi
    
    echo -e "${GREEN}${current_balance} ETH${NC}"
    
    # Check if top-up is needed
    local needs_topup=$(echo "$current_balance < $MIN_BALANCE" | bc)
    
    if [ "$needs_topup" -eq 1 ]; then
        echo ""
        echo -e "${YELLOW}Balance below minimum threshold (${MIN_BALANCE} ETH)${NC}"
        echo "Initiating top-up of ${TOP_UP_AMOUNT} ETH..."
        
        # Get admin balance
        local admin_address=$(cast wallet address --private-key "$PRIVATE_KEY" 2>/dev/null || echo "")
        if [ -n "$admin_address" ]; then
            local admin_balance=$(get_balance "$admin_address")
            echo "Admin balance: ${admin_balance} ETH"
            
            local has_enough=$(echo "$admin_balance > $TOP_UP_AMOUNT" | bc)
            if [ "$has_enough" -eq 0 ]; then
                echo -e "${RED}Error: Insufficient admin balance for top-up${NC}"
                return 1
            fi
        fi
        
        # Perform top-up
        if send_eth "$PAYMASTER_ADDRESS" "$TOP_UP_AMOUNT"; then
            echo ""
            echo -e "${GREEN}Top-up successful!${NC}"
            
            # Wait for transaction to be mined
            sleep 5
            
            # Check new balance
            local new_balance=$(get_balance "$PAYMASTER_ADDRESS")
            echo "New Paymaster balance: ${new_balance} ETH"
            
            # Send notification (if webhook configured)
            if [ -n "${WEBHOOK_URL}" ]; then
                curl -s -X POST "$WEBHOOK_URL" \
                    -H "Content-Type: application/json" \
                    -d "{\"text\":\"Paymaster topped up with ${TOP_UP_AMOUNT} ETH. New balance: ${new_balance} ETH\"}" \
                    2>/dev/null || true
            fi
        else
            echo -e "${RED}Top-up failed!${NC}"
            return 1
        fi
    else
        echo -e "${GREEN}Balance is sufficient${NC}"
    fi
}

# Run the check
check_and_topup

echo ""
echo "========================================="
echo "Check completed"
echo "=========================================