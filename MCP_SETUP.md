# MCP Server Integration - Setup and Testing

## Current Status

The MCP server integration has been implemented but requires:

1. **Server Restart**: The FastAPI server needs to be restarted to register the new MCP routes
2. **Python Version**: MCP SDK requires Python 3.10+, but current environment uses Python 3.9.6

## Implementation Details

### Backend
- **Service**: `backend/services/mcp_client.py` - Handles MCP server connections
- **Router**: `backend/routers/mcp.py` - API endpoints for MCP operations
- **Routes**:
  - `POST /api/mcp/list-tools` - List tools from MCP server (with JSON body)
  - `GET /api/mcp/list-tools/{server_name}` - List tools from MCP server (URL parameter)

### Frontend
- **Component**: `frontend/MCPServer.tsx` - React component for MCP server interface
- **Route**: `/mcp-server` - Accessible from home page

## Testing

### After Server Restart

1. **Test POST endpoint**:
```bash
curl -X POST "http://localhost:8000/api/mcp/list-tools" \
  -H "Content-Type: application/json" \
  -d '{"server_name": "mcp-server-http"}'
```

2. **Test GET endpoint**:
```bash
curl -X GET "http://localhost:8000/api/mcp/list-tools/mcp-server-http"
```

### Expected Responses

**When MCP SDK is not available (Python < 3.10)**:
```json
{
  "name": "mcp-server-http",
  "error": "MCP SDK is not available. No module named 'mcp'. Please install MCP package (requires Python 3.10+): pip install mcp",
  "tools": []
}
```

**When MCP server is not found**:
```json
{
  "name": "mcp-server-http",
  "error": "Server 'mcp-server-http' not found. Make sure it's installed and available in PATH.",
  "tools": []
}
```

**When MCP server is available**:
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

## Installation

### For Python 3.10+

If you upgrade to Python 3.10+, install MCP SDK:
```bash
pip install mcp
```

### For Python 3.9 (Current)

The code gracefully handles missing MCP SDK and returns helpful error messages. To use MCP features, upgrade to Python 3.10+.

## Next Steps

1. Restart the FastAPI server to register new routes
2. (Optional) Upgrade to Python 3.10+ to enable full MCP functionality
3. Install MCP server (e.g., `mcp-server-http`) if not already installed
4. Test endpoints using curl or the web interface
