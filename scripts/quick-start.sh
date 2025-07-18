#!/bin/bash

# ZKFair L2 Quick Start Script

set -e

echo "🚀 ZKFair L2 Quick Start"
echo "========================"

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        exit 1
    fi
}

echo "📋 Checking prerequisites..."
check_command node
check_command npm
check_command docker
check_command docker-compose

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ $NODE_VERSION -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher. Current: $(node -v)"
    exit 1
fi

echo "✅ All prerequisites met!"

# Setup environment
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration"
    echo "   Press Enter when ready..."
    read
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Start infrastructure
echo "🐳 Starting Docker services..."
docker-compose up -d postgres redis celestia-light

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 10

# Initialize database
echo "🗄️  Initializing database..."
cd backend
npx prisma migrate deploy
cd ..

# Deploy contracts (local development)
if [ "$1" == "--deploy-contracts" ]; then
    echo "📜 Deploying smart contracts..."
    cd contracts
    forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
    cd ..
    echo "✅ Contracts deployed!"
fi

# Start services
echo "🚀 Starting all services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 15

# Health check
echo "🏥 Running health checks..."
curl -s http://localhost:4000/api/health || echo "⚠️  API not ready yet"

echo ""
echo "✨ ZKFair L2 is starting up!"
echo ""
echo "📍 Service URLs:"
echo "   - Frontend: http://localhost"
echo "   - API: http://localhost:4000"
echo "   - Bundler: http://localhost:3000"
echo "   - L2 RPC: http://localhost:8545"
echo ""
echo "📚 Next steps:"
echo "   1. Check logs: docker-compose logs -f"
echo "   2. Deploy contracts: npm run deploy:contracts"
echo "   3. Open frontend: http://localhost"
echo ""
echo "💡 Tips:"
echo "   - View all services: docker-compose ps"
echo "   - Stop services: docker-compose down"
echo "   - Reset everything: docker-compose down -v"
echo ""