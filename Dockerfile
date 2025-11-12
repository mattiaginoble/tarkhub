# ===============================
# STAGE 1 — Frontend Build (React/Vue)
# ===============================
FROM node:20 AS frontend-build
WORKDIR /frontend

# Copy dependency files first to leverage Docker cache
COPY frontend/package*.json ./
RUN npm install --prefer-offline --no-audit --progress=false

# Copy source code and build
COPY frontend/ .
RUN npm run build

# ===============================
# STAGE 2 — Backend Build (.NET)
# ===============================
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS backend-build
WORKDIR /app

# Copy project file and restore dependencies
COPY backend/*.csproj ./
RUN dotnet restore

# Copy remaining source code and publish
COPY backend/ ./
RUN dotnet publish -c Release -o out

# ===============================
# STAGE 3 — Runtime with Nginx
# ===============================
FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app

# Build arguments for versioning
ARG SPT_VERSION
ARG FIKA_VERSION

# Environment variables with defaults
ENV SPT_VERSION=${SPT_VERSION:-"latest"} \
    FIKA_VERSION=${FIKA_VERSION:-"latest"} \
    ASPNETCORE_URLS=http://+:5000

# Install system dependencies with better error handling
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    nginx \
    curl \
    bash \
    p7zip-full \
    jq \
    openssl \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && mkdir -p /app/wwwroot/mod /app/spt-server /app/user

# Validate critical tools installation
RUN which nginx && which curl && which 7zr && which jq && which openssl

# Generate SSL certificates during build with validation
RUN mkdir -p /etc/nginx/ssl && \
    rm -f /etc/nginx/ssl/nginx.* && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/nginx.key \
        -out /etc/nginx/ssl/nginx.crt \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" && \
    # Validate certificate generation
    if [ ! -f /etc/nginx/ssl/nginx.crt ] || [ ! -f /etc/nginx/ssl/nginx.key ]; then \
        echo "ERROR: SSL certificate generation failed"; \
        exit 1; \
    fi && \
    # Set permissions explicitly
    chown -R root:root /etc/nginx/ssl/ && \
    chmod 755 /etc/nginx/ssl/ && \
    chmod 644 /etc/nginx/ssl/nginx.crt && \
    chmod 600 /etc/nginx/ssl/nginx.key

# Health check for container (INTERNAL - uses HTTP)
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Copy built applications with validation
COPY --from=backend-build /app/out ./
COPY --from=frontend-build /frontend/dist /usr/share/nginx/html/mod

# Validate critical files exist
RUN test -f /app/ForgeModApi.dll || (echo "ERROR: .NET application missing" && exit 1) && \
    test -f /usr/share/nginx/html/mod/index.html || (echo "ERROR: Frontend files missing" && exit 1)

# Copy configuration and scripts
COPY nginx.conf /etc/nginx/nginx.conf
COPY scripts/build.sh /build.sh
RUN chmod +x /build.sh

# Create necessary directories with proper permissions
RUN mkdir -p /app/user/lists /app/user/versions /app/spt-server/SPT /tmp/updates && \
    chmod 755 /app/user /app/spt-server

EXPOSE 6969

CMD ["/build.sh"]