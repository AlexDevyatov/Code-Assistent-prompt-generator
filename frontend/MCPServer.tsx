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
  const [projectInfo, setProjectInfo] = useState<MCPServerInfo | null>(null)
  const [projectLoading, setProjectLoading] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)

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

  useEffect(() => {
    fetchProjectTools()
  }, [])

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
          <h1 className="mcp-server-title">MCP Server (проектный stdio)</h1>
          <p className="mcp-server-subtitle">Инструменты stdio MCP-сервера проекта (backend/mcp/server.py)</p>
        </div>

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
            {projectLoading ? 'Загрузка...' : 'Обновить список инструментов'}
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
      </div>
    </div>
  )
}

export default MCPServer
