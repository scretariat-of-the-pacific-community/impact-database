#!/bin/bash

# Fix WSL2 Redis Memory Overcommit Warning
# This script addresses the Redis warning about memory overcommit on WSL2

echo "🔧 Fixing WSL2 Redis memory overcommit settings..."

# Check if running on WSL2
if ! grep -qi microsoft /proc/version; then
    echo "⚠️  Not running on WSL2. This script is designed for WSL2 environments."
    exit 1
fi

# Check current vm.overcommit_memory setting
CURRENT_SETTING=$(sysctl vm.overcommit_memory 2>/dev/null | awk '{print $3}')
echo "Current vm.overcommit_memory: ${CURRENT_SETTING:-not set}"

if [ "$CURRENT_SETTING" = "1" ]; then
    echo "✅ Memory overcommit is already enabled!"
else
    echo "📝 Enabling memory overcommit..."
    
    # Temporary fix (until next reboot)
    sudo sysctl vm.overcommit_memory=1
    
    echo "✅ Memory overcommit enabled temporarily (until next reboot)"
    echo ""
    echo "ℹ️  To make this permanent, add the following to /etc/sysctl.conf:"
    echo "    vm.overcommit_memory = 1"
    echo ""
    echo "Or run this command as root:"
    echo "    echo 'vm.overcommit_memory = 1' | sudo tee -a /etc/sysctl.conf"
fi

# Verify the setting
NEW_SETTING=$(sysctl vm.overcommit_memory | awk '{print $3}')
echo ""
echo "New vm.overcommit_memory: $NEW_SETTING"

if [ "$NEW_SETTING" = "1" ]; then
    echo "✅ Setting verified successfully!"
    echo ""
    echo "🔄 Now restart your Docker containers:"
    echo "    docker compose restart redis"
    echo "    # Or restart all services:"
    echo "    docker compose restart"
else
    echo "❌ Failed to set vm.overcommit_memory. You may need root privileges."
    exit 1
fi

echo ""
echo "📚 Additional Redis optimizations for WSL2:"
echo "  - Transparent Huge Pages (THP): Usually disabled by default in Docker"
echo "  - Redis AOF/RDB persistence: Already configured in docker-compose.yml"
echo "  - Max memory policy: Set to 256mb with allkeys-lru eviction"
