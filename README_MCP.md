# MCP Server Integration - Quick Start

This project includes integration with Model Context Protocol (MCP) servers, allowing you to connect to and list tools from various MCP servers.

## Quick Installation

### 1. Install MCP Server

Use the provided installation script:

```bash
./install_mcp_server.sh
```

This will install `mcp-server-http` by default. To install a different server:

```bash
./install_mcp_server.sh mcp-server-google-search
```

### 2. Restart the Application

```bash
npm run dev
```

### 3. Access the MCP Interface

Open your browser and navigate to:
- **Web Interface**: http://localhost:8000/mcp-server
- **API Endpoint**: http://localhost:8000/api/mcp/list-tools/mcp-server-http

## Available MCP Servers

The following MCP servers are supported:

- **mcp-server-http** - HTTP client tools (default)
- **mcp-server-google-search** - Google Search integration
- **mcp-server-filesystem** - File system operations

Install any of them using:
```bash
./install_mcp_server.sh <server-name>
```

## API Usage

### List Tools from MCP Server

**POST Request:**
```bash
curl -X POST "http://localhost:8000/api/mcp/list-tools" \
  -H "Content-Type: application/json" \
  -d '{"server_name": "mcp-server-http"}'
```

**GET Request:**
```bash
curl -X GET "http://localhost:8000/api/mcp/list-tools/mcp-server-http"
```

### Response Format

**Success:**
```json
{
  "name": "mcp-server-http",
  "tools": [
    {
      "name": "fetch_url",
      "description": "Fetch content from a URL",
      "inputSchema": {
        "type": "object",
        "properties": {
          "url": {
            "type": "string",
            "description": "The URL to fetch"
          }
        }
      }
    }
  ]
}
```

**Error (Server Not Found):**
```json
{
  "name": "mcp-server-http",
  "error": "Server 'mcp-server-http' not found...",
  "tools": []
}
```

## Troubleshooting

### Server Not Found

If you get a "Server not found" error:

1. **Check if server is installed:**
   ```bash
   which mcp-server-http
   ```

2. **Install the server:**
   ```bash
   ./install_mcp_server.sh
   ```

3. **Verify npm global bin is in PATH:**
   ```bash
   npm config get prefix
   export PATH="$(npm config get prefix)/bin:$PATH"
   ```

### Routes Not Found (404/405)

If API endpoints return 404 or 405:

1. **Restart the server:**
   ```bash
   npm run dev
   ```

2. **Verify routes are registered:**
   ```bash
   curl -s "http://localhost:8000/openapi.json" | python3 -m json.tool | grep mcp
   ```

## Documentation

- **MCP_SETUP.md** - Detailed setup and configuration
- **MCP_TESTING.md** - Testing guide and examples
- **test_mcp_curl.sh** - Automated testing script

## Requirements

- **Node.js** and **npm** (for installing MCP servers)
- **Python 3.9+** (Python 3.10+ recommended for MCP SDK)
- **FastAPI** server running

## Features

✅ Automatic fallback implementation (works without MCP SDK)  
✅ Support for multiple MCP servers  
✅ Web interface for browsing tools  
✅ REST API for programmatic access  
✅ Detailed error messages with installation instructions  
✅ Installation script for easy setup  
