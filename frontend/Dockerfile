FROM node:20-bookworm

WORKDIR /app

# Install ca-certificates and update npm with increased timeouts
RUN apt-get update && \
    apt-get install -y ca-certificates curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 300000

# Copy package files
COPY package*.json ./

# Install dependencies with legacy peer deps to handle React version conflicts
# Use npm install instead of npm ci to handle missing lock file entries
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Healthcheck disabled temporarily due to Alpine SSL issues
# HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
#   CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Use development command for hot reloading in development
CMD ["npm", "run", "dev:host"]