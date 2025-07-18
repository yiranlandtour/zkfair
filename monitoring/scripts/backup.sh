#!/bin/bash

# ZKFair L2 Backup Script
# This script performs automated backups of critical data

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-zkfair}"
POSTGRES_USER="${POSTGRES_USER:-zkfair}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
S3_BUCKET="${S3_BUCKET}"
S3_ENDPOINT="${S3_ENDPOINT}"

# Create timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="zkfair_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "ZKFair L2 Backup"
echo "Time: $(date)"
echo "Backup Name: ${BACKUP_NAME}"
echo "========================================="

# Create backup directory
mkdir -p "${BACKUP_PATH}"

# Function to backup PostgreSQL
backup_postgres() {
    echo -n "Backing up PostgreSQL database... "
    
    export PGPASSWORD="${POSTGRES_PASSWORD}"
    
    if pg_dump -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" -f "${BACKUP_PATH}/postgres_backup.sql" 2>/dev/null; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
}

# Function to backup contract data
backup_contracts() {
    echo -n "Backing up contract addresses and ABIs... "
    
    # Create contracts backup directory
    mkdir -p "${BACKUP_PATH}/contracts"
    
    # Copy deployment files
    if [ -d "./deployments" ]; then
        cp -r ./deployments/* "${BACKUP_PATH}/contracts/" 2>/dev/null || true
    fi
    
    # Copy contract artifacts
    if [ -d "./contracts/out" ]; then
        find ./contracts/out -name "*.json" -exec cp {} "${BACKUP_PATH}/contracts/" \; 2>/dev/null || true
    fi
    
    echo -e "${GREEN}OK${NC}"
}

# Function to backup configuration files
backup_configs() {
    echo -n "Backing up configuration files... "
    
    # Create configs backup directory
    mkdir -p "${BACKUP_PATH}/configs"
    
    # List of config files to backup
    local config_files=(
        ".env"
        ".env.production"
        "docker-compose.yml"
        "monitoring/prometheus/prometheus.yml"
        "monitoring/alertmanager/alertmanager.yml"
        "monitoring/grafana/grafana.ini"
        "polygon-cdk/config.toml"
        "celestia/config.toml"
    )
    
    for file in "${config_files[@]}"; do
        if [ -f "$file" ]; then
            cp "$file" "${BACKUP_PATH}/configs/" 2>/dev/null || true
        fi
    done
    
    echo -e "${GREEN}OK${NC}"
}

# Function to backup Grafana dashboards
backup_grafana() {
    echo -n "Backing up Grafana dashboards... "
    
    mkdir -p "${BACKUP_PATH}/grafana"
    
    # Export dashboards via API
    if command -v curl &> /dev/null; then
        curl -s "http://localhost:3000/api/search" | \
            jq -r '.[] | .uid' | \
            while read -r uid; do
                curl -s "http://localhost:3000/api/dashboards/uid/$uid" | \
                    jq '.dashboard' > "${BACKUP_PATH}/grafana/${uid}.json" 2>/dev/null || true
            done
    fi
    
    echo -e "${GREEN}OK${NC}"
}

# Function to backup Prometheus data
backup_prometheus() {
    echo -n "Creating Prometheus snapshot... "
    
    # Trigger Prometheus snapshot
    if curl -X POST "http://localhost:9090/api/v1/admin/tsdb/snapshot" 2>/dev/null | grep -q "success"; then
        echo -e "${GREEN}OK${NC}"
        
        # Find and copy the snapshot
        local snapshot_dir=$(docker exec prometheus ls -t /prometheus/snapshots | head -1 2>/dev/null || echo "")
        if [ -n "$snapshot_dir" ]; then
            docker cp "prometheus:/prometheus/snapshots/${snapshot_dir}" "${BACKUP_PATH}/prometheus_snapshot" 2>/dev/null || true
        fi
    else
        echo -e "${YELLOW}SKIPPED${NC}"
    fi
}

# Function to create archive
create_archive() {
    echo -n "Creating backup archive... "
    
    cd "${BACKUP_DIR}"
    if tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"; then
        echo -e "${GREEN}OK${NC}"
        
        # Remove uncompressed backup
        rm -rf "${BACKUP_NAME}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
}

# Function to upload to S3
upload_to_s3() {
    if [ -z "${S3_BUCKET}" ]; then
        echo "S3 upload skipped (no bucket configured)"
        return 0
    fi
    
    echo -n "Uploading to S3... "
    
    local s3_cmd="aws s3 cp"
    if [ -n "${S3_ENDPOINT}" ]; then
        s3_cmd="aws s3 --endpoint-url ${S3_ENDPOINT} cp"
    fi
    
    if $s3_cmd "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" "s3://${S3_BUCKET}/backups/" 2>/dev/null; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
}

# Function to cleanup old backups
cleanup_old_backups() {
    echo -n "Cleaning up old backups... "
    
    # Local cleanup
    find "${BACKUP_DIR}" -name "zkfair_backup_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    
    # S3 cleanup
    if [ -n "${S3_BUCKET}" ]; then
        local s3_cmd="aws s3 ls"
        if [ -n "${S3_ENDPOINT}" ]; then
            s3_cmd="aws s3 --endpoint-url ${S3_ENDPOINT} ls"
        fi
        
        $s3_cmd "s3://${S3_BUCKET}/backups/" | \
            grep "zkfair_backup_" | \
            awk '{print $4}' | \
            while read -r file; do
                local file_date=$(echo "$file" | sed 's/zkfair_backup_\([0-9]\{8\}\).*/\1/')
                local cutoff_date=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d)
                
                if [ "$file_date" -lt "$cutoff_date" ]; then
                    aws s3 rm "s3://${S3_BUCKET}/backups/${file}" 2>/dev/null || true
                fi
            done
    fi
    
    echo -e "${GREEN}OK${NC}"
}

# Run all backup tasks
backup_postgres
backup_contracts
backup_configs
backup_grafana
backup_prometheus
create_archive
upload_to_s3
cleanup_old_backups

echo ""
echo "========================================="
echo -e "${GREEN}Backup completed successfully!${NC}"
echo "Location: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo "Size: $(du -h ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz | cut -f1)"
echo "=========================================