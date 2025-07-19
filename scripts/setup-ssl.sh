#!/bin/bash

# ZKFair L2 SSL/TLS Setup Script
# This script sets up SSL certificates using Let's Encrypt

set -euo pipefail

# Configuration
DOMAINS=(
    "api.zkfair.io"
    "app.zkfair.io"
    "bundler.zkfair.io"
    "rpc.zkfair.io"
    "grafana.zkfair.io"
)
EMAIL="${CERTBOT_EMAIL:-admin@zkfair.io}"
STAGING="${USE_STAGING:-false}"
NGINX_CONTAINER="zkfair-nginx"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "ZKFair L2 SSL/TLS Certificate Setup"
echo "========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root${NC}"
    exit 1
fi

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    if [ -f /etc/debian_version ]; then
        apt-get update
        apt-get install -y certbot python3-certbot-nginx
    elif [ -f /etc/redhat-release ]; then
        yum install -y epel-release
        yum install -y certbot python3-certbot-nginx
    else
        echo -e "${RED}Unsupported OS. Please install certbot manually.${NC}"
        exit 1
    fi
fi

# Function to obtain certificate
obtain_certificate() {
    local domain=$1
    local staging_flag=""
    
    if [ "$STAGING" = "true" ]; then
        staging_flag="--staging"
        echo -e "${YELLOW}Using Let's Encrypt staging environment${NC}"
    fi
    
    echo -e "\n${GREEN}Obtaining certificate for $domain...${NC}"
    
    certbot certonly \
        --nginx \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        -d "$domain" \
        $staging_flag \
        --keep-until-expiring \
        --expand
        
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Certificate obtained for $domain${NC}"
    else
        echo -e "${RED}✗ Failed to obtain certificate for $domain${NC}"
        return 1
    fi
}

# Function to setup auto-renewal
setup_auto_renewal() {
    echo -e "\n${GREEN}Setting up automatic renewal...${NC}"
    
    # Create renewal script
    cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
# Reload nginx in Docker container
docker exec zkfair-nginx nginx -s reload
EOF
    
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    
    # Test renewal
    certbot renew --dry-run
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Auto-renewal configured${NC}"
    else
        echo -e "${RED}✗ Auto-renewal test failed${NC}"
        return 1
    fi
}

# Function to generate Diffie-Hellman parameters
generate_dhparam() {
    local dhparam_file="/etc/ssl/certs/dhparam.pem"
    
    if [ ! -f "$dhparam_file" ]; then
        echo -e "\n${GREEN}Generating Diffie-Hellman parameters...${NC}"
        openssl dhparam -out "$dhparam_file" 2048
        echo -e "${GREEN}✓ DH parameters generated${NC}"
    else
        echo -e "${YELLOW}DH parameters already exist${NC}"
    fi
}

# Main process
echo -e "\nDomains to process: ${DOMAINS[*]}"
echo -e "Email: $EMAIL"
echo -e "Staging: $STAGING\n"

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Create necessary directories
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
mkdir -p /var/www/certbot

# Start nginx if not running
if ! docker ps | grep -q "$NGINX_CONTAINER"; then
    echo "Starting nginx container..."
    docker-compose up -d nginx
    sleep 5
fi

# Obtain certificates for each domain
FAILED_DOMAINS=()
for domain in "${DOMAINS[@]}"; do
    if ! obtain_certificate "$domain"; then
        FAILED_DOMAINS+=("$domain")
    fi
done

# Generate DH parameters
generate_dhparam

# Setup auto-renewal
setup_auto_renewal

# Create certificate monitoring script
cat > /usr/local/bin/check-certs.sh << 'EOF'
#!/bin/bash
# Check certificate expiration

DOMAINS=(
    "api.zkfair.io"
    "app.zkfair.io"
    "bundler.zkfair.io"
    "rpc.zkfair.io"
    "grafana.zkfair.io"
)

for domain in "${DOMAINS[@]}"; do
    cert_file="/etc/letsencrypt/live/$domain/fullchain.pem"
    if [ -f "$cert_file" ]; then
        expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
        expiry_epoch=$(date -d "$expiry_date" +%s)
        current_epoch=$(date +%s)
        days_left=$(( ($expiry_epoch - $current_epoch) / 86400 ))
        
        if [ $days_left -lt 30 ]; then
            echo "WARNING: $domain certificate expires in $days_left days"
        else
            echo "OK: $domain certificate valid for $days_left days"
        fi
    else
        echo "ERROR: Certificate not found for $domain"
    fi
done
EOF

chmod +x /usr/local/bin/check-certs.sh

# Summary
echo -e "\n========================================="
echo -e "${GREEN}SSL/TLS Setup Complete!${NC}"
echo -e "========================================="

if [ ${#FAILED_DOMAINS[@]} -eq 0 ]; then
    echo -e "${GREEN}All certificates obtained successfully${NC}"
else
    echo -e "${RED}Failed domains: ${FAILED_DOMAINS[*]}${NC}"
fi

echo -e "\nNext steps:"
echo "1. Update DNS records to point to this server"
echo "2. Reload nginx: docker exec $NGINX_CONTAINER nginx -s reload"
echo "3. Test HTTPS access to each domain"
echo "4. Monitor certificates: /usr/local/bin/check-certs.sh"

# Create cron job for certificate monitoring
echo "0 0 * * 1 /usr/local/bin/check-certs.sh | mail -s 'Certificate Status' $EMAIL" | crontab -

echo -e "\n${GREEN}Certificate monitoring cron job created${NC}"