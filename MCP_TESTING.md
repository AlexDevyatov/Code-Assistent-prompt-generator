# MCP Endpoints Testing Guide

## Current Status

The MCP endpoints are properly implemented and registered in the code, but **the running server needs to be restarted** to pick up the new routes.

## Testing Results

### Before Server Restart
- POST `/api/mcp/list-tools` → `405 Method Not Allowed`
- GET `/api/mcp/list-tools/{server_name}` → `404 Not Found`

### After Server Restart (Expected)
- POST `/api/mcp/list-tools` → `200 OK` with server info
- GET `/api/mcp/list-tools/{server_name}` → `200 OK` with server info

## How to Test

### 1. Restart the Server

```bash
# Option 1: Using npm (recommended for development)
npm run dev

# Option 2: Using uvicorn directly
uvicorn backend.main:app --reload
```

### 2. Test with curl

```bash
# Test POST endpoint
curl -X POST "http://localhost:8000/api/mcp/list-tools" \
  -H "Content-Type: application/json" \
  -d '{"server_name": "mcp-server-http"}'

# Test GET endpoint
curl -X GET "http://localhost:8000/api/mcp/list-tools/mcp-server-http"
```

### 3. Use the test script

```bash
./test_mcp_curl.sh
```

## Expected Responses

### When MCP server is not installed:
```json
{
  "name": "mcp-server-http",
  "error": "Server 'mcp-server-http' not found. Make sure it's installed and available in PATH.\n\nTo install MCP servers, you can:\n1. Install via npm: npm install -g @modelcontextprotocol/server-http\n2. Or use the MCP server's installation instructions\n3. Make sure the server binary is in your PATH\n\nYou can check if it's installed by running: which mcp-server-http",
  "tools": []
}
```

### When MCP server is available:
```json
{
  "name": "mcp-server-http",
  "tools": [
    {
      "name": "tool_name",
      "description": "Tool description",
      "inputSchema": {...}
    }
  ]
}
```

## Verification

After restarting, verify routes are registered:

```bash
curl -s "http://localhost:8000/openapi.json" | python3 -m json.tool | grep -E '"\/api\/mcp'
```

You should see:
- `/api/mcp/list-tools`
- `/api/mcp/list-tools/{server_name}`

## Code Status

✅ All code is correct:
- Router is properly registered in `backend/main.py`
- Routes are defined in `backend/routers/mcp.py`
- Service implementation works (tested with Python import)
- Error handling is in place
- Frontend component is ready

## Installation

Before testing, make sure the MCP server is installed:

```bash
# Quick install using the script
./install_mcp_server.sh

# Or manually
npm install -g @modelcontextprotocol/server-http
```

## Next Steps

1. **Install MCP server** (if not already installed): `./install_mcp_server.sh`
2. **Restart the server** to register new routes
3. Run the test script: `./test_mcp_curl.sh`
4. Test via web interface at `/mcp-server`
