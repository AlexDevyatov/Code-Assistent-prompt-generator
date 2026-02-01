import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './MCPServer.css'

/** Имя stdio MCP-сервера проекта (backend/mcp/server.py) */
const PROJECT_MCP_SERVER = 'deepseek-web-mcp'

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
  const [serverName, setServerName] = useState('mcp-server-google-search')
  const [serverInfo, setServerInfo] = useState<MCPServerInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Сервер проекта (stdio): backend/mcp/server.py — health_check, get_users
  const [projectInfo, setProjectInfo] = useState<MCPServerInfo | null>(null)
  const [projectLoading, setProjectLoading] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)

  const fetchTools = async () => {
    if (!serverName.trim()) {
      setError('Please enter a server name')
      return
    }

    setIsLoading(true)
    setError(null)
    setServerInfo(null)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(new DOMException('Request timeout', 'AbortError')), 60000)
      const response = await fetch(`/api/mcp/list-tools/${encodeURIComponent(serverName)}`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

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
      const name = err instanceof Error ? err.name : ''
      const raw = err instanceof Error ? err.message : 'Failed to fetch MCP tools'
      const errorMessage =
        name === 'AbortError' || raw.includes('abort') || raw.includes('timeout')
          ? 'Таймаут запроса (60 с). Бэкенд или MCP не ответили вовремя.'
          : raw === 'Failed to fetch' || raw.includes('fetch')
            ? 'Сервер недоступен. Проверьте бэкенд (порт 8000) и прокси /api.'
            : raw
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

  const fetchProjectTools = async () => {
    setProjectLoading(true)
    setProjectError(null)
    setProjectInfo(null)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(new DOMException('Request timeout', 'AbortError')), 30000)
      const response = await fetch(`/api/mcp/list-tools/${encodeURIComponent(PROJECT_MCP_SERVER)}`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      const data: MCPServerInfo = await response.json()
      setProjectInfo(data)
      if (data.error) setProjectError(data.error)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось загрузить инструменты проекта'
      setProjectError(msg)
      console.error('Error fetching project MCP tools:', err)
    } finally {
      setProjectLoading(false)
    }
  }

  const renderToolCards = (tools: Tool[]) =>
    tools.map((tool, index) => {
      const schema = tool.inputSchema || {}
      const properties = schema.properties || {}
      const required = schema.required || []
      return (
        <div key={index} className="mcp-server-tool-card">
          <h3 className="mcp-server-tool-name">
            <span className="mcp-server-tool-icon">🔧</span>
            {tool.name}
          </h3>
          {tool.description && (
            <p className="mcp-server-tool-description">{tool.description}</p>
          )}
          {Object.keys(properties).length > 0 ? (
            <div className="mcp-server-tool-schema">
              <strong className="mcp-server-params-title">Параметры:</strong>
              <div className="mcp-server-params-list">
                {Object.entries(properties).map(([paramName, paramInfo]: [string, any]) => {
                  const isRequired = required.includes(paramName)
                  const paramType = paramInfo.type || 'unknown'
                  const paramDesc = paramInfo.description || ''
                  const defaultValue = paramInfo.default
                  return (
                    <div key={paramName} className="mcp-server-param-item">
                      <div className="mcp-server-param-header">
                        <span className="mcp-server-param-name">{paramName}</span>
                        <span className={`mcp-server-param-type ${paramType}`}>{paramType}</span>
                        {isRequired && <span className="mcp-server-param-required">обязательный</span>}
                        {!isRequired && <span className="mcp-server-param-optional">опциональный</span>}
                      </div>
                      {paramDesc && <p className="mcp-server-param-description">{paramDesc}</p>}
                      {defaultValue !== undefined && (
                        <p className="mcp-server-param-default">По умолчанию: <code>{String(defaultValue)}</code></p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="mcp-server-tool-schema">
              <p className="mcp-server-no-params">Параметры не требуются</p>
            </div>
          )}
        </div>
      )
    })

  return (
    <div className="mcp-server">
      <div className="mcp-server-container">
        <div className="mcp-server-header">
          <Link to="/" className="mcp-server-back-link">← Назад</Link>
          <h1 className="mcp-server-title">MCP Server Tools</h1>
          <p className="mcp-server-subtitle">Подключение к MCP серверу и просмотр доступных инструментов</p>
        </div>

        {/* Сервер проекта (stdio): backend/mcp — демонстрация интеграции MCP */}
        <section className="mcp-server-project-section">
          <h2 className="mcp-server-project-title">Сервер проекта (stdio)</h2>
          <p className="mcp-server-project-desc">
            Stdio MCP-сервер из <code>backend/mcp/server.py</code>: переиспользует сервисы (например <code>get_users</code>), инструменты <strong>health_check</strong> и <strong>get_users</strong>.
          </p>
          <button
            type="button"
            className="mcp-server-button mcp-server-project-button"
            onClick={fetchProjectTools}
            disabled={projectLoading}
          >
            {projectLoading ? 'Загрузка...' : 'Показать инструменты проекта'}
          </button>
          {projectError && (
            <div className="mcp-server-error mcp-server-project-error">
              <strong>Ошибка:</strong>
              <pre className="mcp-server-error-text">{projectError}</pre>
            </div>
          )}
          {projectInfo && !projectLoading && (
            <div className="mcp-server-results mcp-server-project-results">
              <div className="mcp-server-info">
                <h3>Сервер: {projectInfo.name}</h3>
                <p className="mcp-server-tools-count">Найдено инструментов: {projectInfo.tools.length}</p>
              </div>
              {projectInfo.tools.length === 0 ? (
                <div className="mcp-server-empty">Инструменты не найдены.</div>
              ) : (
                <div className="mcp-server-tools">{renderToolCards(projectInfo.tools)}</div>
              )}
            </div>
          )}
        </section>

        <form onSubmit={handleSubmit} className="mcp-server-form">
          <div className="mcp-server-input-group">
            <label htmlFor="server-name" className="mcp-server-label">
              Внешний MCP сервер (имя команды или mcp-weather):
            </label>
            <div className="mcp-server-input-wrapper">
              <input
                id="server-name"
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="mcp-server-google-search"
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
              <div className="mcp-server-tools">{renderToolCards(serverInfo.tools)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default MCPServer
