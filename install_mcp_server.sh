#!/bin/bash
# Script to install MCP server (mcp-server-http by default)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default server
SERVER_NAME="${1:-mcp-server-http}"

echo "Installing MCP server: $SERVER_NAME"
echo "===================================="
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed.${NC}"
    echo "Please install Node.js and npm first:"
    echo "  https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✓ npm is installed${NC}"
echo ""

# Determine npm package name
case "$SERVER_NAME" in
    mcp-server-http|mcp_http)
        NPM_PACKAGE="@modelcontextprotocol/server-http"
        ;;
    mcp-server-google-search|mcp_google_search)
        NPM_PACKAGE="@modelcontextprotocol/server-google-search"
        ;;
    mcp-server-filesystem|mcp_filesystem)
        NPM_PACKAGE="@modelcontextprotocol/server-filesystem"
        ;;
    *)
        # Try to guess from server name
        SERVER_PART=$(echo "$SERVER_NAME" | sed 's/^mcp[-_]server[-_]//' | sed 's/^mcp[-_]//')
        NPM_PACKAGE="@modelcontextprotocol/server-${SERVER_PART}"
        echo -e "${YELLOW}Warning: Unknown server name, trying package: $NPM_PACKAGE${NC}"
        ;;
esac

echo "Installing package: $NPM_PACKAGE"
echo ""

# Install the package globally
if npm install -g "$NPM_PACKAGE"; then
    echo ""
    echo -e "${GREEN}✓ Successfully installed $NPM_PACKAGE${NC}"
    echo ""
    
    # Check if the binary is available
    if command -v "$SERVER_NAME" &> /dev/null; then
        echo -e "${GREEN}✓ Server binary '$SERVER_NAME' is now available in PATH${NC}"
        echo ""
        echo "Location: $(which $SERVER_NAME)"
        echo ""
        echo "You can now use this server in the MCP interface."
    else
        echo -e "${YELLOW}⚠ Warning: Server binary '$SERVER_NAME' not found in PATH${NC}"
        echo ""
        echo "The package was installed, but the binary might have a different name."
        echo "Check npm global bin directory:"
        echo "  npm config get prefix"
        echo ""
        echo "Or list installed MCP servers:"
        echo "  npm list -g | grep mcp"
    fi
else
    echo ""
    echo -e "${RED}✗ Failed to install $NPM_PACKAGE${NC}"
    echo ""
    echo "Possible reasons:"
    echo "  1. Package name is incorrect"
    echo "  2. Network connection issues"
    echo "  3. npm permissions (try with sudo on Linux/Mac)"
    echo ""
    echo "Try manually:"
    echo "  npm install -g $NPM_PACKAGE"
    exit 1
fi

echo ""
echo "===================================="
echo -e "${GREEN}Installation complete!${NC}"
