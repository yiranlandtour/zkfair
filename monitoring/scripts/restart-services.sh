#!/bin/bash

# ZKFair L2 Service Restart Script
# This script safely restarts services with health checks

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
SERVICES=(
    "polygon-cdk-rpc"
    "polygon-cdk-sync"
    "polygon-cdk-aggregator"
    "celestia-bridge"
    "celestia-light"
    "bundler"
    "backend"
    "frontend"
    "postgres"
    "redis"
)

MONITORING_SERVICES=(
    "prometheus"
    "grafana"
    "alertmanager"
    "node-exporter"
    "contract-exporter"
)

# Parse arguments
RESTART_ALL=false
RESTART_MONITORING=false
SERVICES_TO_RESTART=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            RESTART_ALL=true
            shift
            ;;
        --monitoring)
            RESTART_MONITORING=true
            shift
            ;;
        *)
            SERVICES_TO_RESTART+=("$1")
            shift
            ;;
    esac
done

echo "========================================="
echo "ZKFair L2 Service Restart"
echo "Time: $(date)"
echo "========================================="

# Function to check if service is running
is_service_running() {
    local service=$1
    
    if docker ps --format "{{.Names}}" | grep -q "^${service}$"; then
        return 0
    else
        return 1
    fi
}

# Function to wait for service health
wait_for_health() {
    local service=$1
    local max_attempts=30
    local attempt=0
    
    echo -n "  Waiting for $service to be healthy"
    
    while [ $attempt -lt $max_attempts ]; do
        if docker inspect "$service" 2>/dev/null | grep -q '"Status": "healthy"'; then
            echo -e " ${GREEN}OK${NC}"
            return 0
        fi
        
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    echo -e " ${RED}TIMEOUT${NC}"
    return 1
}

# Function to restart service
restart_service() {
    local service=$1
    
    echo "Restarting $service..."
    
    # Check if service exists
    if ! docker ps -a --format "{{.Names}}" | grep -q "^${service}$"; then
        echo -e "  ${YELLOW}Service not found${NC}"
        return 1
    fi
    
    # Stop service
    echo -n "  Stopping... "
    if docker stop "$service" >/dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
    
    # Start service
    echo -n "  Starting... "
    if docker start "$service" >/dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
    
    # Wait for health check (if applicable)
    if docker inspect "$service" 2>/dev/null | grep -q '"Healthcheck"'; then
        wait_for_health "$service"
    else
        # Just wait a bit for services without health checks
        sleep 5
    fi
    
    return 0
}

# Function to restart service with dependencies
restart_with_deps() {
    local service=$1
    
    case $service in
        "backend")
            # Ensure database is running before starting backend
            if ! is_service_running "postgres"; then
                restart_service "postgres"
            fi
            if ! is_service_running "redis"; then
                restart_service "redis"
            fi
            ;;
        "bundler")
            # Ensure RPC is running before starting bundler
            if ! is_service_running "polygon-cdk-rpc"; then
                restart_service "polygon-cdk-rpc"
            fi
            ;;
    esac
    
    restart_service "$service"
}

# Determine which services to restart
if [ "$RESTART_ALL" = true ]; then
    SERVICES_TO_RESTART=("${SERVICES[@]}")
    if [ "$RESTART_MONITORING" = true ]; then
        SERVICES_TO_RESTART+=("${MONITORING_SERVICES[@]}")
    fi
elif [ "$RESTART_MONITORING" = true ]; then
    SERVICES_TO_RESTART=("${MONITORING_SERVICES[@]}")
elif [ ${#SERVICES_TO_RESTART[@]} -eq 0 ]; then
    echo "Usage: $0 [--all] [--monitoring] [service1] [service2] ..."
    echo ""
    echo "Options:"
    echo "  --all         Restart all core services"
    echo "  --monitoring  Restart monitoring services"
    echo ""
    echo "Available services:"
    echo "  Core: ${SERVICES[*]}"
    echo "  Monitoring: ${MONITORING_SERVICES[*]}"
    exit 1
fi

# Restart services
echo ""
echo "Services to restart: ${SERVICES_TO_RESTART[*]}"
echo ""

FAILED_SERVICES=()

for service in "${SERVICES_TO_RESTART[@]}"; do
    if ! restart_with_deps "$service"; then
        FAILED_SERVICES+=("$service")
    fi
    echo ""
done

# Summary
echo "========================================="
if [ ${#FAILED_SERVICES[@]} -eq 0 ]; then
    echo -e "${GREEN}All services restarted successfully!${NC}"
    exit 0
else
    echo -e "${RED}Some services failed to restart:${NC}"
    for service in "${FAILED_SERVICES[@]}"; do
        echo "  - $service"
    done
    exit 1
fi