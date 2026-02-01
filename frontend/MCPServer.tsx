import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './MCPServer.css'

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
  const [projectLoading, setProjectLoading] = useState(true)
  const [projectError, setProjectError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(new DOMException('Request timeout', 'AbortError')), 30000)

    fetch(`/api/mcp/list-tools/${encodeURIComponent(PROJECT_MCP_SERVER)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.detail || `HTTP ${r.status}`)))))
      .then((data: MCPServerInfo) => {
        if (!cancelled) {
          setProjectInfo(data)
          if (data.error) setProjectError(data.error)
        }
      })
      .catch((err) => {
        if (!cancelled && err.name !== 'AbortError') {
          setProjectError(err instanceof Error ? err.message : 'Не удалось загрузить инструменты')
        }
      })
      .finally(() => {
        clearTimeout(timeoutId)
        if (!cancelled) setProjectLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
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
          <h1 className="mcp-server-title">Инструменты MCP (проектный stdio)</h1>
        </div>

        {projectLoading && (
          <div className="mcp-server-loading">
            <div className="mcp-server-spinner" />
            <p>Загрузка списка инструментов...</p>
          </div>
        )}

        {projectError && !projectLoading && (
          <div className="mcp-server-error">
            <strong>Ошибка:</strong>
            <pre className="mcp-server-error-text">{projectError}</pre>
          </div>
        )}

        {projectInfo && !projectLoading && (
          <div className="mcp-server-results">
            {projectInfo.tools.length === 0 ? (
              <div className="mcp-server-empty">Инструменты не найдены.</div>
            ) : (
              <div className="mcp-server-tools">{renderToolCards(projectInfo.tools)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default MCPServer
