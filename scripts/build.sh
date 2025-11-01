#!/bin/bash
set -euo pipefail

# ======================
# ENVIRONMENT VALIDATION
# ======================

if [ -z "$SPT_VERSION" ]; then
  echo "Error: SPT_VERSION not defined"
  exit 1
fi

if [ -z "$FIKA_VERSION" ]; then
  echo "Error: FIKA_VERSION not defined"
  exit 1
fi

# ==============
# PATH DEFINITIONS
# ==============

spt_dir=/app/spt-server/SPT
spt_data_dir=$spt_dir/SPT_Data
fika_data_dir=$spt_dir/user/mods/fika-server
versions_dir=/app/user/versions

# ===========================
# EXTRACT MAIN VERSION NUMBERS
# ===========================

# Extract only the main version (X.X.X) from full version string
extract_main_version() {
    local version="$1"
    # Match X.X.X pattern (e.g., extract 4.0.3 from 4.0.3-40087-96c7fef)
    if [[ $version =~ ^([0-9]+\.[0-9]+\.[0-9]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo "$version" # Fallback to original if pattern not found
    fi
}

SPT_MAIN_VERSION=$(extract_main_version "$SPT_VERSION")
FIKA_MAIN_VERSION=$(extract_main_version "$FIKA_VERSION")

echo "Extracted versions: SPT=$SPT_MAIN_VERSION (from $SPT_VERSION), FIKA=$FIKA_MAIN_VERSION (from $FIKA_VERSION)"

# ========================
# CREATE VERSION FILES
# ========================

echo "Creating version files..."
mkdir -p $versions_dir
echo "$SPT_MAIN_VERSION" > $versions_dir/spt_version.txt
echo "$FIKA_MAIN_VERSION" > $versions_dir/fika_version.txt
echo "Version files created: SPT=$SPT_MAIN_VERSION, FIKA=$FIKA_MAIN_VERSION"

# ========================
# SPT SERVER INSTALLATION
# ========================

if [ ! -f "$spt_dir/SPT.Server.Linux" ]; then
  echo "Downloading SPT v.$SPT_VERSION..."
  curl -sL "https://spt-releases.modd.in/SPT-${SPT_VERSION}.7z" -o /app/spt-server/spt.7z
  7zr x /app/spt-server/spt.7z -o/app/spt-server
  echo "SPT extracted successfully"
fi

# Configure SPT to listen on all interfaces
http_json=$spt_data_dir/configs/http.json
jq '.ip = "0.0.0.0" | .backendIp = "0.0.0.0"' $http_json > $http_json.tmp && mv $http_json.tmp $http_json

# ===================
# FIKA MOD INSTALLATION
# ===================

fika_artifact=Fika.Server.Release.$FIKA_VERSION.zip

if [ ! -d "$fika_data_dir" ]; then
  echo "Downloading FIKA v.$FIKA_VERSION..."
  curl -sL "https://github.com/project-fika/Fika-Server-CSharp/releases/download/v$FIKA_VERSION/$fika_artifact" -o /app/spt-server/fika.zip
  7z x /app/spt-server/fika.zip -o/app/spt-server
  echo "FIKA extracted successfully"
fi

# ===========================
# FIKA CONFIGURATION GENERATION
# ===========================

fika_jsonc="$fika_data_dir/assets/configs/fika.jsonc"

if [ ! -f "$fika_jsonc" ]; then
  echo "fika.jsonc not found, temporarily starting SPT to generate it..."
  chmod +x /app/spt-server/SPT/SPT.Server.Linux
  cd /app/spt-server/SPT

  # Start SPT in background for file generation
  ./SPT.Server.Linux --ip 127.0.0.1 --port 6969 &
  spt_pid=$!

  # Wait for file creation with timeout
  for i in {1..30}; do
    if [ -f "$fika_jsonc" ]; then
      echo "fika.jsonc generated"
      break
    fi
    echo "Waiting for fika.jsonc creation ($i/30)..."
    sleep 2
  done

  # Stop temporary SPT process
  kill $spt_pid || true
  sleep 2
fi

if [ ! -f "$fika_jsonc" ]; then
  echo "fika.jsonc not found after 30 seconds. Something went wrong"
  exit 1
fi

# ========================
# FIKA CONFIGURATION SETUP
# ========================

jq '.server.SPT.http.port = 6970 
    | .server.SPT.http.backendPort = 6970 
    | .server.SPT.http.backendIp = "0.0.0.0" 
    | .server.SPT.http.ip = "0.0.0.0"
    | .natPunchServer.port = 6970
    | .headless.scripts.forceIp = "https://127.0.0.1:6970"' "$fika_jsonc" > "$fika_jsonc.tmp" && mv "$fika_jsonc.tmp" "$fika_jsonc"

# ===============
# FILE CLEANUP
# ===============

echo "Cleaning temporary files..."
rm -f /app/spt-server/fika.zip || true
rm -f /app/spt-server/spt.7z || true

# ===============
# SERVICE STARTUP
# ===============

echo "Starting all services..."

# Start .NET backend
echo "Starting .NET backend..."
dotnet /app/ForgeModApi.dll &
DOTNET_PID=$!

# Start SPT server
echo "Starting SPT server..."
chmod +x /app/spt-server/SPT/SPT.Server.Linux
cd /app/spt-server/SPT
./SPT.Server.Linux --port 6970 --ip 0.0.0.0 &
SPT_PID=$!

# Start nginx
echo "Starting nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Brief initialization period
echo "Finalizing startup..."
sleep 3

# =====================
# PROCESS HEALTH CHECKS
# =====================

check_process() {
    kill -0 $1 2>/dev/null
}

# ===================
# GRACEFUL SHUTDOWN
# ===================

cleanup() {
    echo "Shutting down services..."
    kill $NGINX_PID 2>/dev/null || true
    kill $SPT_PID 2>/dev/null || true  
    kill $DOTNET_PID 2>/dev/null || true
    wait 2>/dev/null
    echo "All services stopped"
    exit 0
}

trap cleanup SIGTERM SIGINT

# ================
# STARTUP VERIFICATION
# ================

if check_process $DOTNET_PID && check_process $SPT_PID && check_process $NGINX_PID; then
    echo "All services started successfully"
    echo "  - .NET backend (PID: $DOTNET_PID)"
    echo "  - SPT server (PID: $SPT_PID)"
    echo "  - nginx (PID: $NGINX_PID)"
else
    echo "Some services failed to start"
    cleanup
    exit 1
fi

# ====================
# SERVICE MONITORING WITH UPDATE SUPPORT
# ====================

echo "Starting service monitor with update support..."

while sleep 30; do
    # Skip health checks if update in progress
    if [ -f /tmp/updating.flag ]; then
        echo "Update in progress, skipping health checks..."
        continue
    fi
    
    # Normal health checks
    if ! check_process $DOTNET_PID || ! check_process $SPT_PID || ! check_process $NGINX_PID; then
        echo "Critical service died, shutting down..."
        cleanup
        exit 1
    fi
done