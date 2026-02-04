# Use official Node.js image for building and development
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY vite.config.mjs ./
COPY . .

# Install dependencies
RUN npm ci

# By default, build for production
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

# Tile cache URL (passed at build time for Vite to inline)
ARG VITE_TILE_CACHE_URL=""
ENV VITE_TILE_CACHE_URL=$VITE_TILE_CACHE_URL

# If in production, build the app
RUN if [ "$NODE_ENV" = "production" ]; then npm run build; fi

# ---
# Production image for serving static files
FROM caddy:2-alpine AS prod
COPY --from=builder /app/dist /srv
COPY Caddyfile.web /etc/caddy/Caddyfile
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

# ---
# Development image for running Vite dev server
FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# ---
# Final stage: choose prod or dev based on build arg
FROM prod AS final
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

# If in development, override entrypoint
ENTRYPOINT ["/bin/sh", "-c", "if [ \"$NODE_ENV\" = \"development\" ]; then exec npm run dev -- --host; else exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile; fi"]