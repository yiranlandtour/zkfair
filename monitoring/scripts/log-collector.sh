#!/bin/bash

# ZKFair L2 Log Collector Script
# Collects logs from all services for debugging

set -euo pipefail

# Configuration
OUTPUT_DIR="${OUTPUT_DIR:-./logs}"
SINCE="${SINCE:-1h}"
TAIL_LINES="${TAIL_LINES:-1000}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Services to collect logs from
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
    "prometheus"
    "grafana"
    "alertmanager"
)

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_DIR="${OUTPUT_DIR}/zkfair_logs_${TIMESTAMP}"

echo "========================================="
echo "ZKFair L2 Log Collector"
echo "Time: $(date)"
echo "Output: ${LOG_DIR}"
echo "========================================="

# Create output directory
mkdir -p "${LOG_DIR}"

# Function to collect Docker logs
collect_docker_logs() {
    local service=$1
    local output_file="${LOG_DIR}/${service}.log"
    
    echo -n "Collecting logs for $service... "
    
    if docker logs "$service" --since "$SINCE" --tail "$TAIL_LINES" &> "$output_file" 2>/dev/null; then
        local size=$(du -h "$output_file" | cut -f1)
        echo -e "${GREEN}OK${NC} ($size)"
    else
        echo -e "${YELLOW}NOT FOUND${NC}"
        rm -f "$output_file"
    fi
}

# Function to collect system logs
collect_system_logs() {
    echo -n "Collecting system logs... "
    
    # Kernel logs
    if command -v dmesg &> /dev/null; then
        dmesg -T > "${LOG_DIR}/dmesg.log" 2>/dev/null || true
    fi
    
    # System journal (if systemd)
    if command -v journalctl &> /dev/null; then
        journalctl --since "$SINCE" > "${LOG_DIR}/journal.log" 2>/dev/null || true
    fi
    
    # Syslog
    if [ -f /var/log/syslog ]; then
        tail -n "$TAIL_LINES" /var/log/syslog > "${LOG_DIR}/syslog.log" 2>/dev/null || true
    fi
    
    echo -e "${GREEN}OK${NC}"
}

# Function to collect metrics snapshot
collect_metrics() {
    echo -n "Collecting metrics snapshot... "
    
    # Prometheus metrics
    curl -s "http://localhost:9090/api/v1/query?query=up" > "${LOG_DIR}/prometheus_up.json" 2>/dev/null || true
    
    # Node exporter metrics
    curl -s "http://localhost:9100/metrics" > "${LOG_DIR}/node_metrics.txt" 2>/dev/null || true
    
    # Contract exporter metrics
    curl -s "http://localhost:9200/metrics" > "${LOG_DIR}/contract_metrics.txt" 2>/dev/null || true
    
    echo -e "${GREEN}OK${NC}"
}

# Function to collect configuration
collect_configs() {
    echo -n "Collecting configuration files... "
    
    mkdir -p "${LOG_DIR}/configs"
    
    # Docker compose
    if [ -f "docker-compose.yml" ]; then
        cp docker-compose.yml "${LOG_DIR}/configs/" 2>/dev/null || true
    fi
    
    # Environment info
    {
        echo "=== Environment ==="
        echo "Hostname: $(hostname)"
        echo "Kernel: $(uname -r)"
        echo "Docker: $(docker --version 2>/dev/null || echo 'Not installed')"
        echo ""
        echo "=== Docker Info ==="
        docker info 2>/dev/null || echo "Docker not accessible"
        echo ""
        echo "=== Running Containers ==="
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "No containers"
    } > "${LOG_DIR}/environment.txt"
    
    echo -e "${GREEN}OK${NC}"
}

# Function to analyze logs for errors
analyze_logs() {
    echo -n "Analyzing logs for errors... "
    
    local error_file="${LOG_DIR}/errors_summary.txt"
    
    {
        echo "=== Error Summary ==="
        echo "Generated: $(date)"
        echo ""
        
        for log in "${LOG_DIR}"/*.log; do
            if [ -f "$log" ]; then
                local service=$(basename "$log" .log)
                local error_count=$(grep -iE "error|fatal|panic|exception" "$log" 2>/dev/null | wc -l || echo 0)
                
                if [ "$error_count" -gt 0 ]; then
                    echo "[$service] Found $error_count error(s)"
                    echo "Recent errors:"
                    grep -iE "error|fatal|panic|exception" "$log" | tail -5 | sed 's/^/  /'
                    echo ""
                fi
            fi
        done
    } > "$error_file"
    
    echo -e "${GREEN}OK${NC}"
}

# Function to create archive
create_archive() {
    echo -n "Creating archive... "
    
    cd "${OUTPUT_DIR}"
    if tar -czf "zkfair_logs_${TIMESTAMP}.tar.gz" "zkfair_logs_${TIMESTAMP}"; then
        echo -e "${GREEN}OK${NC}"
        
        # Remove uncompressed logs
        rm -rf "zkfair_logs_${TIMESTAMP}"
        
        local size=$(du -h "zkfair_logs_${TIMESTAMP}.tar.gz" | cut -f1)
        echo ""
        echo "Archive created: ${OUTPUT_DIR}/zkfair_logs_${TIMESTAMP}.tar.gz ($size)"
    else
        echo -e "${RED}FAILED${NC}"
    fi
}

# Collect all logs
echo ""
echo "=== Collecting Service Logs ==="
for service in "${SERVICES[@]}"; do
    collect_docker_logs "$service"
done

echo ""
echo "=== Collecting System Information ==="
collect_system_logs
collect_metrics
collect_configs

echo ""
echo "=== Analysis ==="
analyze_logs

echo ""
echo "=== Creating Archive ==="
create_archive

echo ""
echo "========================================="
echo -e "${GREEN}Log collection completed!${NC}"
echo "=========================================