#!/bin/bash

# ZKFair L2 Production Deployment Script

set -euo pipefail

# Configuration
CLUSTER_NAME="zkfair-production"
REGION="us-east-1"
IMAGE_TAG="${1:-latest}"
DEPLOYMENT_TIMEOUT=600 # 10 minutes

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "ZKFair L2 Production Deployment"
echo "Image Tag: ${IMAGE_TAG}"
echo "========================================="

# Function to update ECS service
update_service() {
    local service_name=$1
    local image_uri="zkfair/${service_name}:${IMAGE_TAG}"
    
    echo -e "\n${GREEN}Updating ${service_name}...${NC}"
    
    # Get current task definition
    local task_def=$(aws ecs describe-services \
        --cluster "${CLUSTER_NAME}" \
        --services "${service_name}" \
        --query 'services[0].taskDefinition' \
        --output text)
    
    # Get task definition JSON
    local task_def_json=$(aws ecs describe-task-definition \
        --task-definition "${task_def}" \
        --query 'taskDefinition')
    
    # Update image in container definition
    local new_task_def=$(echo "${task_def_json}" | \
        jq --arg IMAGE "${image_uri}" \
        '.containerDefinitions[0].image = $IMAGE | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)')
    
    # Register new task definition
    local new_task_arn=$(aws ecs register-task-definition \
        --cli-input-json "${new_task_def}" \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)
    
    echo "New task definition: ${new_task_arn}"
    
    # Update service
    aws ecs update-service \
        --cluster "${CLUSTER_NAME}" \
        --service "${service_name}" \
        --task-definition "${new_task_arn}" \
        --force-new-deployment \
        --desired-count $(aws ecs describe-services \
            --cluster "${CLUSTER_NAME}" \
            --services "${service_name}" \
            --query 'services[0].desiredCount' \
            --output text)
    
    echo -e "${GREEN}✓ ${service_name} update initiated${NC}"
}

# Function to wait for service stability
wait_for_service() {
    local service_name=$1
    local start_time=$(date +%s)
    
    echo -e "\n${YELLOW}Waiting for ${service_name} to stabilize...${NC}"
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [ $elapsed -gt $DEPLOYMENT_TIMEOUT ]; then
            echo -e "${RED}✗ Timeout waiting for ${service_name}${NC}"
            return 1
        fi
        
        local running_count=$(aws ecs describe-services \
            --cluster "${CLUSTER_NAME}" \
            --services "${service_name}" \
            --query 'services[0].runningCount' \
            --output text)
        
        local desired_count=$(aws ecs describe-services \
            --cluster "${CLUSTER_NAME}" \
            --services "${service_name}" \
            --query 'services[0].desiredCount' \
            --output text)
        
        local deployments=$(aws ecs describe-services \
            --cluster "${CLUSTER_NAME}" \
            --services "${service_name}" \
            --query 'length(services[0].deployments)' \
            --output text)
        
        echo -e "  Running: ${running_count}/${desired_count}, Deployments: ${deployments}"
        
        if [ "${running_count}" -eq "${desired_count}" ] && [ "${deployments}" -eq 1 ]; then
            echo -e "${GREEN}✓ ${service_name} is stable${NC}"
            return 0
        fi
        
        sleep 10
    done
}

# Function to run health checks
health_check() {
    local service_name=$1
    local endpoint=$2
    
    echo -e "\n${YELLOW}Running health check for ${service_name}...${NC}"
    
    local response=$(curl -s -o /dev/null -w "%{http_code}" "${endpoint}/health" || echo "000")
    
    if [ "${response}" -eq 200 ]; then
        echo -e "${GREEN}✓ ${service_name} health check passed${NC}"
        return 0
    else
        echo -e "${RED}✗ ${service_name} health check failed (HTTP ${response})${NC}"
        return 1
    fi
}

# Function to rollback service
rollback_service() {
    local service_name=$1
    
    echo -e "\n${RED}Rolling back ${service_name}...${NC}"
    
    # Get previous task definition
    local current_task_def=$(aws ecs describe-services \
        --cluster "${CLUSTER_NAME}" \
        --services "${service_name}" \
        --query 'services[0].taskDefinition' \
        --output text)
    
    local previous_revision=$(($(echo "${current_task_def}" | grep -o '[0-9]*$') - 1))
    local task_family=$(echo "${current_task_def}" | sed 's/:[0-9]*$//')
    local previous_task_def="${task_family}:${previous_revision}"
    
    aws ecs update-service \
        --cluster "${CLUSTER_NAME}" \
        --service "${service_name}" \
        --task-definition "${previous_task_def}" \
        --force-new-deployment
    
    wait_for_service "${service_name}"
}

# Main deployment process
SERVICES=("backend" "frontend" "bundler")
FAILED_SERVICES=()

# Pre-deployment checks
echo -e "\n${YELLOW}Running pre-deployment checks...${NC}"

# Check AWS credentials
if ! aws sts get-caller-identity &>/dev/null; then
    echo -e "${RED}✗ AWS credentials not configured${NC}"
    exit 1
fi

# Check cluster exists
if ! aws ecs describe-clusters --clusters "${CLUSTER_NAME}" &>/dev/null; then
    echo -e "${RED}✗ Cluster ${CLUSTER_NAME} not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Pre-deployment checks passed${NC}"

# Deploy services
for service in "${SERVICES[@]}"; do
    if ! update_service "${service}"; then
        FAILED_SERVICES+=("${service}")
        continue
    fi
    
    if ! wait_for_service "${service}"; then
        rollback_service "${service}"
        FAILED_SERVICES+=("${service}")
    fi
done

# Run health checks
echo -e "\n${YELLOW}Running health checks...${NC}"

ENDPOINTS=(
    "backend https://api.zkfair.io"
    "frontend https://app.zkfair.io"
    "bundler https://bundler.zkfair.io"
)

for endpoint in "${ENDPOINTS[@]}"; do
    read -r service url <<< "${endpoint}"
    if ! health_check "${service}" "${url}"; then
        FAILED_SERVICES+=("${service}")
    fi
done

# Update monitoring
echo -e "\n${YELLOW}Updating monitoring...${NC}"

# Tag deployment in monitoring
curl -X POST "https://grafana.zkfair.io/api/annotations" \
    -H "Authorization: Bearer ${GRAFANA_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
        \"dashboardId\": 1,
        \"time\": $(date +%s)000,
        \"tags\": [\"deployment\", \"production\"],
        \"text\": \"Deployed version ${IMAGE_TAG}\"
    }"

# Summary
echo -e "\n========================================="
if [ ${#FAILED_SERVICES[@]} -eq 0 ]; then
    echo -e "${GREEN}Deployment completed successfully!${NC}"
    
    # Send success notification
    curl -X POST "${SLACK_WEBHOOK}" \
        -H "Content-Type: application/json" \
        -d "{
            \"text\": \"✅ Production deployment successful\",
            \"attachments\": [{
                \"color\": \"good\",
                \"fields\": [
                    {\"title\": \"Version\", \"value\": \"${IMAGE_TAG}\", \"short\": true},
                    {\"title\": \"Environment\", \"value\": \"Production\", \"short\": true}
                ]
            }]
        }"
    
    exit 0
else
    echo -e "${RED}Deployment failed for: ${FAILED_SERVICES[*]}${NC}"
    
    # Send failure notification
    curl -X POST "${SLACK_WEBHOOK}" \
        -H "Content-Type: application/json" \
        -d "{
            \"text\": \"❌ Production deployment failed\",
            \"attachments\": [{
                \"color\": \"danger\",
                \"fields\": [
                    {\"title\": \"Version\", \"value\": \"${IMAGE_TAG}\", \"short\": true},
                    {\"title\": \"Failed Services\", \"value\": \"${FAILED_SERVICES[*]}\", \"short\": false}
                ]
            }]
        }"
    
    exit 1
fi