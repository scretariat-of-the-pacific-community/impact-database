FROM node:18-alpine

WORKDIR /app

# Use default HTTPS repositories and install ca-certificates
RUN apk update && apk add --no-cache ca-certificates libc6-compat curl

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