FROM nginx:alpine

# Create cache directory
RUN mkdir -p /var/cache/nginx/tiles && \
    chown -R nginx:nginx /var/cache/nginx

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose proxy port
EXPOSE 8888

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8888/health || exit 1
