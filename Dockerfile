# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the application using Vite
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:alpine

LABEL org.opencontainers.image.title="Brainstorm"

# Generate a runtime env file from container environment variables.
COPY docker-entrypoint.sh /docker-entrypoint.d/99-env.sh
RUN chmod +x /docker-entrypoint.d/99-env.sh

# Add a custom Nginx configuration to support client-side routing for Single Page Applications
RUN echo "server { \
    listen       8080; \
    server_name  localhost; \
    add_header X-Content-Type-Options 'nosniff' always; \
    add_header X-Frame-Options 'DENY' always; \
    add_header Referrer-Policy 'strict-origin-when-cross-origin' always; \
    add_header Permissions-Policy 'camera=(), microphone=(), geolocation=()' always; \
    add_header Content-Security-Policy \"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com; img-src 'self' blob: data: https://*.supabase.co; worker-src blob:; object-src 'self' blob: https://*.supabase.co;\" always; \
    location / { \
        root   /usr/share/nginx/html; \
        index  index.html index.htm; \
        try_files \$uri \$uri/ /index.html; \
    } \
    error_page   500 502 503 504  /50x.html; \
    location = /50x.html { \
        root   /usr/share/nginx/html; \
    } \
}" > /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose on 8080
EXPOSE 8080

# Start Nginx server
CMD ["nginx", "-g", "daemon off;"]
