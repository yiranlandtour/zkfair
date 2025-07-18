FROM node:18-alpine as builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --production && npx prisma generate

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 4000

CMD ["node", "dist/index.js"]