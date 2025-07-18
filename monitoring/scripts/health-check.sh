#!/bin/bash

# ZKFair L2 Health Check Script
# This script performs comprehensive health checks on all components

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
RPC_URL="${RPC_URL:-http://localhost:8545}"
API_URL="${API_URL:-http://localhost:3001}"
BUNDLER_URL="${BUNDLER_URL:-http://localhost:4337}"
CELESTIA_URL="${CELESTIA_URL:-http://localhost:26657}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3000}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"

# Track overall health
HEALTH_STATUS="HEALTHY"
FAILED_CHECKS=()

echo "========================================="
echo "ZKFair L2 Health Check"
echo "Time: $(date)"
echo "========================================="

# Function to check service
check_service() {
    local service_name=$1
    local url=$2
    local endpoint=${3:-""}
    
    echo -n "Checking $service_name... "
    
    if curl -s -f -o /dev/null "${url}${endpoint}" --connect-timeout 5; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        HEALTH_STATUS="UNHEALTHY"
        FAILED_CHECKS+=("$service_name")
        return 1
    fi
}

# Function to check RPC
check_rpc() {
    echo -n "Checking RPC (eth_blockNumber)... "
    
    local response=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        --connect-timeout 5 2>/dev/null || echo "FAILED")
    
    if [[ "$response" == *"result"* ]]; then
        local block_hex=$(echo "$response" | grep -o '"result":"[^"]*"' | sed 's/"result":"//;s/"//')
        local block_dec=$((16#${block_hex#0x}))
        echo -e "${GREEN}OK${NC} (Block: $block_dec)"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        HEALTH_STATUS="UNHEALTHY"
        FAILED_CHECKS+=("RPC")
        return 1
    fi
}

# Function to check metrics
check_metrics() {
    local service_name=$1
    local metric_url=$2
    
    echo -n "Checking $service_name metrics... "
    
    local response=$(curl -s "$metric_url" --connect-timeout 5 2>/dev/null || echo "FAILED")
    
    if [[ "$response" == *"# HELP"* ]] || [[ "$response" == *"# TYPE"* ]]; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${YELLOW}NO METRICS${NC}"
        return 1
    fi
}

# Function to check disk space
check_disk_space() {
    echo -n "Checking disk space... "
    
    local usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$usage" -lt 80 ]; then
        echo -e "${GREEN}OK${NC} (${usage}% used)"
    elif [ "$usage" -lt 90 ]; then
        echo -e "${YELLOW}WARNING${NC} (${usage}% used)"
    else
        echo -e "${RED}CRITICAL${NC} (${usage}% used)"
        HEALTH_STATUS="UNHEALTHY"
        FAILED_CHECKS+=("Disk Space")
    fi
}

# Function to check memory
check_memory() {
    echo -n "Checking memory usage... "
    
    local total=$(free -m | awk 'NR==2 {print $2}')
    local used=$(free -m | awk 'NR==2 {print $3}')
    local percent=$((used * 100 / total))
    
    if [ "$percent" -lt 80 ]; then
        echo -e "${GREEN}OK${NC} (${percent}% used)"
    elif [ "$percent" -lt 90 ]; then
        echo -e "${YELLOW}WARNING${NC} (${percent}% used)"
    else
        echo -e "${RED}CRITICAL${NC} (${percent}% used)"
        HEALTH_STATUS="UNHEALTHY"
        FAILED_CHECKS+=("Memory")
    fi
}

# Function to check Docker containers
check_docker_containers() {
    echo -n "Checking Docker containers... "
    
    if ! command -v docker &> /dev/null; then
        echo -e "${YELLOW}Docker not installed${NC}"
        return 1
    fi
    
    local unhealthy=$(docker ps --filter health=unhealthy --format "{{.Names}}" 2>/dev/null | wc -l)
    local exited=$(docker ps -a --filter status=exited --format "{{.Names}}" 2>/dev/null | wc -l)
    
    if [ "$unhealthy" -eq 0 ] && [ "$exited" -eq 0 ]; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}ISSUES${NC} (Unhealthy: $unhealthy, Exited: $exited)"
        HEALTH_STATUS="UNHEALTHY"
        FAILED_CHECKS+=("Docker Containers")
    fi
}

# Run all checks
echo ""
echo "=== Service Checks ==="
check_service "Polygon CDK RPC" "$RPC_URL"
check_service "Backend API" "$API_URL" "/health"
check_service "ERC-4337 Bundler" "$BUNDLER_URL" "/health"
check_service "Celestia Node" "$CELESTIA_URL" "/status"
check_service "Grafana" "$GRAFANA_URL" "/api/health"
check_service "Prometheus" "$PROMETHEUS_URL" "/-/healthy"
check_rpc

echo ""
echo "=== Metrics Checks ==="
check_metrics "Backend API" "$API_URL/metrics"
check_metrics "Bundler" "$BUNDLER_URL/metrics"
check_metrics "Prometheus" "$PROMETHEUS_URL/metrics"

echo ""
echo "=== System Checks ==="
check_disk_space
check_memory
check_docker_containers

echo ""
echo "========================================="
echo -n "Overall Health Status: "
if [ "$HEALTH_STATUS" == "HEALTHY" ]; then
    echo -e "${GREEN}HEALTHY${NC}"
    exit 0
else
    echo -e "${RED}UNHEALTHY${NC}"
    echo ""
    echo "Failed checks:"
    for check in "${FAILED_CHECKS[@]}"; do
        echo "  - $check"
    done
    exit 1
fi