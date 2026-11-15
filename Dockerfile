# ==========================================
# STAGE 1: Prune & Build
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache libc6-compat python3 make g++

# Copy package manifests across monorepo workspaces
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/

# Install dependencies deterministically
RUN npm ci

# Copy full application source code
COPY . .

# Build frontend production bundle
RUN npm run build:frontend

# ==========================================
# STAGE 2: Production Runtime
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0

# Create unprivileged application user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeapp

# Copy built application and required production dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/apps/backend ./apps/backend
COPY --from=builder /app/apps/frontend/dist ./apps/frontend/dist
COPY --from=builder /app/node_modules ./node_modules

# Ensure upload directory exists and is owned by unprivileged user
RUN mkdir -p /app/apps/backend/uploads/resumes /app/apps/backend/uploads/avatars && \
    chown -R nodeapp:nodejs /app/apps/backend/uploads

# Drop root privileges
USER nodeapp

EXPOSE 5000

# Health check probe (DEP-04, DEP-05)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/healthz || exit 1

# Start production API server
CMD ["node", "apps/backend/src/server.js"]
