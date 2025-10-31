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

# Environment variables
ENV SPT_VERSION=${SPT_VERSION} \
    FIKA_VERSION=${FIKA_VERSION} \
    ASPNETCORE_URLS=http://+:5000

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    curl \
    bash \
    p7zip-full \
    jq \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/wwwroot/mod /app/spt-server /app/user

# Copy built applications
COPY --from=backend-build /app/out ./
COPY --from=frontend-build /frontend/dist /usr/share/nginx/html/mod

# Copy configuration and scripts
COPY nginx.conf /etc/nginx/nginx.conf
COPY scripts/build.sh /build.sh
RUN chmod +x /build.sh

EXPOSE 6969

CMD ["/build.sh"]