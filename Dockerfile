# --- Build Stage ---
FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Runtime Stage ---
FROM node:24-alpine

WORKDIR /app

# Install Python and websockets for the bridge
RUN apk add --no-cache python3 py3-pip && \
    pip3 install --no-cache-dir websockets python-dotenv --break-system-packages

# Copy build output and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Copy the bridge and config
COPY mcp_pipe.py mcp_config.json ./

# Environment variables
ENV MCP_ENDPOINT=""
ENV NAVIDROME_URL=""
ENV NAVIDROME_USER=""
ENV NAVIDROME_PASS=""

# Run the bridge
CMD ["python3", "mcp_pipe.py"]
