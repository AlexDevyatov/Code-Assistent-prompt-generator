import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './MCPServer.css'

interface Tool {
  name: string
  description: string
  inputSchema: Record<string, any>
}

interface MCPServerInfo {
  name: string
  tools: Tool[]
  error?: string
}

function MCPServer() {
  const [serverName, setServerName] = useState('mcp-server-http')
  const [serverInfo, setServerInfo] = useState<MCPServerInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTools = async () => {
    if (!serverName.trim()) {
      setError('Please enter a server name')
      return
    }

    setIsLoading(true)
    setError(null)
    setServerInfo(null)

    try {
      const response = await fetch(`/api/mcp/list-tools/${encodeURIComponent(serverName)}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
      }

      const data: MCPServerInfo = await response.json()
      setServerInfo(data)
      
      if (data.error) {
        setError(data.error)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch MCP tools'
      setError(errorMessage)
      console.error('Error fetching MCP tools:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Автоматически загружаем инструменты при монтировании компонента
    fetchTools()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchTools()
  }

  return (
    <div className="mcp-server">
      <div className="mcp-server-container">
        <div className="mcp-server-header">
          <Link to="/" className="mcp-server-back-link">← Назад</Link>
          <h1 className="mcp-server-title">MCP Server Tools</h1>
          <p className="mcp-server-subtitle">Подключение к MCP серверу и просмотр доступных инструментов</p>
        </div>

        <form onSubmit={handleSubmit} className="mcp-server-form">
          <div className="mcp-server-input-group">
            <label htmlFor="server-name" className="mcp-server-label">
              Имя MCP сервера:
            </label>
            <div className="mcp-server-input-wrapper">
              <input
                id="server-name"
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="mcp-server-http"
                className="mcp-server-input"
                disabled={isLoading}
              />
              <button
                type="submit"
                className="mcp-server-button"
                disabled={isLoading || !serverName.trim()}
              >
                {isLoading ? 'Загрузка...' : 'Подключиться'}
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="mcp-server-error">
            <strong>Ошибка:</strong>
            <pre className="mcp-server-error-text">{error}</pre>
          </div>
        )}

        {isLoading && (
          <div className="mcp-server-loading">
            <div className="mcp-server-spinner"></div>
            <p>Подключение к серверу и получение списка инструментов...</p>
          </div>
        )}

        {serverInfo && !isLoading && (
          <div className="mcp-server-results">
            <div className="mcp-server-info">
              <h2>Сервер: {serverInfo.name}</h2>
              <p className="mcp-server-tools-count">
                Найдено инструментов: {serverInfo.tools.length}
              </p>
            </div>

            {serverInfo.tools.length === 0 ? (
              <div className="mcp-server-empty">
                <p>Инструменты не найдены. Убедитесь, что сервер установлен и доступен.</p>
              </div>
            ) : (
              <div className="mcp-server-tools">
                {serverInfo.tools.map((tool, index) => (
                  <div key={index} className="mcp-server-tool-card">
                    <h3 className="mcp-server-tool-name">{tool.name}</h3>
                    {tool.description && (
                      <p className="mcp-server-tool-description">{tool.description}</p>
                    )}
                    {tool.inputSchema && Object.keys(tool.inputSchema).length > 0 && (
                      <div className="mcp-server-tool-schema">
                        <strong>Параметры:</strong>
                        <pre className="mcp-server-schema-code">
                          {JSON.stringify(tool.inputSchema, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default MCPServer
