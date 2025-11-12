#!/bin/bash
set -euo pipefail

: "${SPT_VERSION:?Error: SPT_VERSION not defined}"
: "${FIKA_VERSION:?Error: FIKA_VERSION not defined}"

SPT_DIR="/app/spt-server/SPT"
SPT_DATA_DIR="$SPT_DIR/SPT_Data"
FIKA_DATA_DIR="$SPT_DIR/user/mods/fika-server"
VERSIONS_DIR="/app/user/versions"

# ===========================
# VERSION RESOLUTION WITH GITHUB TOKEN
# ===========================

get_latest_spt_download_url() {
    local headers=()
    [ -n "${GITHUB_TOKEN:-}" ] && headers=(-H "Authorization: Bearer $GITHUB_TOKEN")
    
    local response
    response=$(curl -s "${headers[@]}" "https://api.github.com/repos/sp-tarkov/build/releases/latest")
    echo "$response" | jq -r '.body' | grep -o 'https://spt-releases\.modd\.in/SPT-[^ ]*\.7z' | head -1
}

get_specific_spt_download_url() {
    local version="$1"
    local headers=()
    [ -n "${GITHUB_TOKEN:-}" ] && headers=(-H "Authorization: Bearer $GITHUB_TOKEN")
    
    local clean_version="${version#v}"
    
    local response
    response=$(curl -s "${headers[@]}" "https://api.github.com/repos/sp-tarkov/build/releases")
    
    local release_tag
    release_tag=$(echo "$response" | jq -r ".[] | select(.tag_name | test(\"${clean_version}\"; \"i\")) | .tag_name" | head -1)
    
    if [ -n "$release_tag" ]; then
        echo "$response" | jq -r ".[] | select(.tag_name == \"$release_tag\") | .body" | grep -o 'https://spt-releases\.modd\.in/SPT-[^ ]*\.7z' | head -1
    else
        echo "https://spt-releases.modd.in/SPT-${clean_version}.7z"
    fi
}

get_latest_fika_download_url() {
    local headers=()
    [ -n "${GITHUB_TOKEN:-}" ] && headers=(-H "Authorization: Bearer $GITHUB_TOKEN")
    
    local response
    response=$(curl -s "${headers[@]}" "https://api.github.com/repos/project-fika/Fika-Server-CSharp/releases/latest")
    
    echo "$response" | jq -r '.assets[] | select(.name | endswith(".zip")) | .browser_download_url' | head -1
}

get_latest_fika_version() {
    local headers=()
    [ -n "${GITHUB_TOKEN:-}" ] && headers=(-H "Authorization: Bearer $GITHUB_TOKEN")
    
    curl -s "${headers[@]}" "https://api.github.com/repos/project-fika/Fika-Server-CSharp/releases/latest" | jq -r '.tag_name'
}

# Resolve SPT version
if [ "$SPT_VERSION" = "latest" ]; then
    echo "Detecting latest SPT version..."
    SPT_DOWNLOAD_URL=$(get_latest_spt_download_url)
    [ -z "$SPT_DOWNLOAD_URL" ] && { echo "ERROR: Could not find SPT download URL"; exit 1; }
    echo "SPT download URL: $SPT_DOWNLOAD_URL"
    SPT_VERSION=$(echo "$SPT_DOWNLOAD_URL" | grep -o 'SPT-[0-9]\+\.[0-9]\+\.[0-9]\+' | sed 's/SPT-//' || echo "4.0.4")
else
    if [[ "$SPT_VERSION" == v* ]]; then
        echo "Processing version: $SPT_VERSION"
        SPT_DOWNLOAD_URL=$(get_specific_spt_download_url "$SPT_VERSION")
        SPT_VERSION=$(echo "$SPT_DOWNLOAD_URL" | grep -o 'SPT-[0-9]\+\.[0-9]\+\.[0-9]\+-[^-]*-[^.]*' | sed 's/SPT-//' || echo "${SPT_VERSION#v}")
    else
        SPT_DOWNLOAD_URL="https://spt-releases.modd.in/SPT-${SPT_VERSION}.7z"
    fi
fi

# Resolve Fika version (resta invariato)
if [ "$FIKA_VERSION" = "latest" ]; then
    echo "Detecting latest Fika version..."
    FIKA_VERSION=$(get_latest_fika_version)
    FIKA_DOWNLOAD_URL=$(get_latest_fika_download_url)
else
    FIKA_DOWNLOAD_URL=$(curl -s -H "Authorization: Bearer ${GITHUB_TOKEN:-}" \
        "https://api.github.com/repos/project-fika/Fika-Server-CSharp/releases/tags/${FIKA_VERSION}" | \
        jq -r '.assets[] | select(.name | endswith(".zip")) | .browser_download_url' | head -1)
fi

echo "Resolved versions - SPT: $SPT_VERSION, Fika: $FIKA_VERSION"
echo "SPT download URL: $SPT_DOWNLOAD_URL"
[ -n "${GITHUB_TOKEN:-}" ] && echo "GitHub token configured for API requests"

# ========================
# VERSION FILES SETUP
# ========================

mkdir -p "$VERSIONS_DIR"
[ ! -f "$VERSIONS_DIR/spt_version.txt" ] && echo "$SPT_VERSION" > "$VERSIONS_DIR/spt_version.txt"
[ ! -f "$VERSIONS_DIR/fika_version.txt" ] && echo "$FIKA_VERSION" > "$VERSIONS_DIR/fika_version.txt"

# ========================
# SPT SERVER INSTALLATION
# ========================

if [ ! -f "$SPT_DIR/SPT.Server.Linux" ]; then
    echo "Installing SPT server..."
    mkdir -p /app/spt-server
    curl -f -L "$SPT_DOWNLOAD_URL" -o /app/spt-server/spt.7z
    7zr x /app/spt-server/spt.7z -o/app/spt-server -y
    echo "SPT server installed"
fi

# Configure SPT network
[ -f "$SPT_DATA_DIR/configs/http.json" ] && \
    jq '.ip = "0.0.0.0" | .backendIp = "0.0.0.0"' "$SPT_DATA_DIR/configs/http.json" > tmp.json && \
    mv tmp.json "$SPT_DATA_DIR/configs/http.json"

# ===================
# FIKA MOD INSTALLATION
# ===================

if [ ! -d "$FIKA_DATA_DIR" ]; then
    echo "Installing Fika mod..."
    
    if [ -n "$FIKA_DOWNLOAD_URL" ]; then
        curl -f -L "$FIKA_DOWNLOAD_URL" -o /app/spt-server/fika.zip
    else
        FIKA_ARTIFACT="Fika.Server.Release.${FIKA_VERSION}.zip"
        curl -f -L "https://github.com/project-fika/Fika-Server-CSharp/releases/download/${FIKA_VERSION}/${FIKA_ARTIFACT}" -o /app/spt-server/fika.zip || \
        curl -f -L "https://github.com/project-fika/Fika-Server-CSharp/releases/download/${FIKA_VERSION}/Fika.Server.${FIKA_VERSION}.zip" -o /app/spt-server/fika.zip || \
        curl -f -L "https://github.com/project-fika/Fika-Server-CSharp/releases/download/${FIKA_VERSION}/Fika.Server.zip" -o /app/spt-server/fika.zip
    fi
    
    7z x /app/spt-server/fika.zip -o/app/spt-server -y
    echo "Fika mod installed"
fi

# ========================
# FIKA CONFIGURATION
# ========================

FIKA_JSONC="$FIKA_DATA_DIR/assets/configs/fika.jsonc"

if [ ! -f "$FIKA_JSONC" ]; then
    echo "Configuring Fika..."
    chmod +x "$SPT_DIR/SPT.Server.Linux"
    cd "$SPT_DIR"
    
    ./SPT.Server.Linux --ip 127.0.0.1 --port 6969 &
    SPT_PID=$!
    
    for i in {1..15}; do
        [ -f "$FIKA_JSONC" ] && break
        sleep 2
    done
    
    kill $SPT_PID 2>/dev/null || true
    wait
fi

[ -f "$FIKA_JSONC" ] && \
    jq '.server.SPT.http.port = 6970 
        | .server.SPT.http.backendPort = 6970 
        | .server.SPT.http.backendIp = "0.0.0.0" 
        | .server.SPT.http.ip = "0.0.0.0"
        | .natPunchServer.port = 6970
        | .headless.scripts.forceIp = "https://127.0.0.1:6970"' "$FIKA_JSONC" > tmp.json && \
    mv tmp.json "$FIKA_JSONC"

# ===============
# CLEANUP
# ===============

rm -f /app/spt-server/fika.zip /app/spt-server/spt.7z

# ===============
# SERVICE STARTUP  
# ===============

echo "Starting services..."

# Start .NET backend first
echo "Starting .NET backend API..."
dotnet /app/ForgeModApi.dll --urls="http://0.0.0.0:5000" &
DOTNET_PID=$!

# Wait for .NET to be ready
echo "Waiting for .NET backend..."
for i in {1..30}; do
    if curl -f http://localhost:5000/health > /dev/null 2>&1; then
        echo "NET backend ready on port 5000"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "ERROR: .NET backend failed to start"
        exit 1
    fi
    sleep 1
done

# Start nginx
echo "Starting nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Start SPT server
echo "Starting SPT server..."
chmod +x "$SPT_DIR/SPT.Server.Linux"
cd "$SPT_DIR"
./SPT.Server.Linux --port 6970 --ip 0.0.0.0 &
SPT_PID=$!

# Wait for SPT to initialize
echo "Initializing SPT server..."
sleep 25

echo "All services started"

# ===================
# GRACEFUL SHUTDOWN
# ===================

cleanup() {
    echo "Shutting down services..."
    kill $NGINX_PID $SPT_PID $DOTNET_PID 2>/dev/null || true
    wait
    exit 0
}

trap cleanup SIGTERM SIGINT

# ====================
# HEALTH MONITORING
# ====================

echo "Health monitoring started..."

while sleep 30; do
    [ -f /tmp/updating.flag ] && continue
    
    kill -0 $DOTNET_PID $SPT_PID $NGINX_PID 2>/dev/null || {
        echo "Critical service terminated - shutting down"
        cleanup
    }
done