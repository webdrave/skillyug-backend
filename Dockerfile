# Multi-stage build for Backend API
# Stage 1: Build environment (kept for migrate/seed containers)
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml* ./
COPY prisma/ ./prisma/

# Install dependencies (will use cache if available)
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm db:generate || true

# Build the application
RUN pnpm build || true

# Stage 2: Production environment
FROM node:18-alpine AS production

# Install pnpm and dumb-init for proper signal handling
RUN npm install -g pnpm && apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S skillyug -u 1001

WORKDIR /app

# Copy package files
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml* ./
COPY prisma/ ./prisma/

# Install production dependencies only (with fallback)
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

# Generate Prisma client in production stage
RUN npx prisma generate || pnpm db:generate

# Copy pre-built application from local dist folder (faster than building in Docker)
COPY dist ./dist

# Copy any other necessary files (like seed.js for the seed container)
COPY prisma ./prisma

# Change ownership to nodejs user
RUN chown -R skillyug:nodejs /app
USER skillyug

# Expose the port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').request({hostname:'localhost',port:5000,path:'/api/test'},res=>process.exit(res.statusCode===200?0:1)).on('error',()=>process.exit(1)).end()"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "./dist/index.js"]