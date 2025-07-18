FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build arguments
ARG REACT_APP_L2_RPC_URL
ARG REACT_APP_BUNDLER_URL
ARG REACT_APP_API_URL
ARG REACT_APP_ENTRY_POINT_ADDRESS
ARG REACT_APP_PAYMASTER_ADDRESS
ARG REACT_APP_FACTORY_ADDRESS
ARG REACT_APP_USDC_ADDRESS

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]