import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import './TokenComparison.css'

interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

interface TokenResult {
  id: string
  type: 'short' | 'long' | 'limit'
  prompt: string
  response: string
  usage: TokenUsage | null
  isLoading: boolean
  error?: string
  status?: string
  promptLength: number
  estimatedPromptTokens: number
  progress?: number
  phase?: 'generating' | 'processing' | 'completed'
}

function TokenComparison() {
  const [prompts, setPrompts] = useState({
    short: '',
    long: '',
    limit: ''
  })
  const [results, setResults] = useState<TokenResult[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [overallProgress, setOverallProgress] = useState(0)
  const [overallStatus, setOverallStatus] = useState('')
  const currentRequestIdRef = useRef<string | null>(null)

  /**
   * Оценка количества токенов (приблизительно).
   * Важно: это НЕ точный токенайзер DeepSeek, но хорошо подходит для генерации размеров.
   */
  const estimateTokens = (text: string): number => {
    // грубо: 1 токен ~ 4 символа для латиницы; для кириллицы/пунктуации чуть иначе
    // чтобы не усложнять, используем два сигнала и берем максимум:
    const byChars = Math.ceil(text.length / 4)
    const byWords = Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.3)
    return Math.max(byChars, byWords, 1)
  }


  const callAPI = async (
    resultId: string,
    prompt: string,
    requestId: string
  ): Promise<void> => {
    try {
      // Проверяем, актуален ли запрос
      if (currentRequestIdRef.current !== requestId) {
        return
      }

      setResults((prev) =>
        prev.map((r) =>
          r.id === resultId
            ? { ...r, isLoading: true, error: undefined, status: 'Отправляю запрос в DeepSeek...', phase: 'processing', progress: 10 }
            : r
        )
      )

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          max_tokens: 1000, // Ограничиваем ответ для экономии токенов
        }),
      })

      // Обновляем статус во время обработки ответа
      if (currentRequestIdRef.current !== requestId) return
      setResults((prev) =>
        prev.map((r) =>
          r.id === resultId
            ? { ...r, status: 'Получаю ответ от DeepSeek...', progress: 70 }
            : r
        )
      )

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `HTTP error! status: ${res.status}`)
      }

      const data = await res.json()

      // Проверяем актуальность запроса перед обновлением
      if (currentRequestIdRef.current !== requestId) return

      setResults((prev) =>
        prev.map((r) =>
          r.id === resultId
            ? {
                ...r,
                response: data.response || '',
                usage: data.usage || null,
                isLoading: false,
                status: 'Готово',
                phase: 'completed',
                progress: 100,
              }
            : r
        )
      )
    } catch (error) {
      // Проверяем актуальность запроса перед обновлением
      if (currentRequestIdRef.current !== requestId) return

      setResults((prev) =>
        prev.map((r) =>
          r.id === resultId
            ? {
                ...r,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Произошла ошибка',
                phase: 'completed',
                progress: 0,
              }
            : r
        )
      )
    }
  }

  const handleTest = async () => {
    if (isProcessing) return
    if (!prompts.short.trim() && !prompts.long.trim() && !prompts.limit.trim()) return

    // Генерируем уникальный ID для нового запроса
    const requestId = Date.now().toString()
    currentRequestIdRef.current = requestId

    setIsProcessing(true)
    setResults([])
    setOverallProgress(0)
    setOverallStatus('Инициализация...')

    // Небольшая задержка для гарантии очистки UI
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Проверяем, не был ли отправлен новый запрос
    if (currentRequestIdRef.current !== requestId) return

    // Создаем результаты с введенными промптами
    const promptsToTest = [
      { id: 'short', prompt: prompts.short.trim(), type: 'short' as const },
      { id: 'long', prompt: prompts.long.trim(), type: 'long' as const },
      { id: 'limit', prompt: prompts.limit.trim(), type: 'limit' as const },
    ].filter(p => p.prompt) // Фильтруем только непустые промпты

    if (promptsToTest.length === 0) {
      setIsProcessing(false)
      return
    }

    const initialResults: TokenResult[] = promptsToTest.map(({ id, prompt, type }) => ({
      id,
      type,
      prompt,
      response: '',
      usage: null,
      isLoading: true,
      promptLength: prompt.length,
      estimatedPromptTokens: estimateTokens(prompt),
      phase: 'processing',
      progress: 0,
    }))

    setResults(initialResults)

    setOverallStatus('Отправка запросов в DeepSeek...')
    setOverallProgress(10)

    // Обрабатываем каждый запрос последовательно (чтобы не перегружать API)
    for (let i = 0; i < promptsToTest.length; i++) {
      if (currentRequestIdRef.current !== requestId) break
      const { id, prompt } = promptsToTest[i]
      const progressBase = 10 + (i * 80) / promptsToTest.length
      setOverallProgress(Math.round(progressBase))
      setOverallStatus(`Обработка ${getTypeLabel(id === 'short' ? 'short' : id === 'long' ? 'long' : 'limit')}...`)
      
      await callAPI(id, prompt, requestId)
      // Небольшая задержка между запросами
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // Проверяем актуальность запроса перед завершением
    if (currentRequestIdRef.current === requestId) {
      setOverallProgress(100)
      setOverallStatus('Готово!')
      setIsProcessing(false)
      // Очищаем статус через 2 секунды
      setTimeout(() => {
        setOverallStatus('')
        setOverallProgress(0)
      }, 2000)
    }
  }

  const getTypeLabel = (type: string): string => {
    switch (type) {
      case 'short':
        return 'Короткий запрос'
      case 'long':
        return 'Длинный запрос'
      case 'limit':
        return 'Запрос превышающий лимит'
      default:
        return type
    }
  }

  const getTypeDescription = (type: string): string => {
    switch (type) {
      case 'short':
        return 'Короткий промпт'
      case 'long':
        return 'Длинный промпт'
      case 'limit':
        return 'Лимитный промпт'
      default:
        return ''
    }
  }

  return (
    <div className="token-page">
      <div className="nav-bar">
        <Link to="/" className="nav-link">← На главную</Link>
      </div>
      <div className="token-container">
        <div className="token-header">
          <h1>Подсчёт и сравнение токенов</h1>
          <p className="token-description">
            Введите три промпта для сравнения. Каждый промпт будет отправлен в DeepSeek, и вы увидите использование токенов для каждого запроса/ответа.
          </p>
        </div>

        <div className="token-input-section">
          <div className="prompts-grid">
            <div className="prompt-input-group">
              <label className="prompt-label">Короткий промпт</label>
              <textarea
                value={prompts.short}
                onChange={(e) => setPrompts(prev => ({ ...prev, short: e.target.value }))}
                placeholder="Введите короткий промпт..."
                rows={6}
                disabled={isProcessing}
                className="token-textarea"
              />
            </div>
            <div className="prompt-input-group">
              <label className="prompt-label">Длинный промпт</label>
              <textarea
                value={prompts.long}
                onChange={(e) => setPrompts(prev => ({ ...prev, long: e.target.value }))}
                placeholder="Введите длинный промпт..."
                rows={6}
                disabled={isProcessing}
                className="token-textarea"
              />
            </div>
            <div className="prompt-input-group">
              <label className="prompt-label">Лимитный промпт</label>
              <textarea
                value={prompts.limit}
                onChange={(e) => setPrompts(prev => ({ ...prev, limit: e.target.value }))}
                placeholder="Введите лимитный промпт..."
                rows={6}
                disabled={isProcessing}
                className="token-textarea"
              />
            </div>
          </div>
        </div>

        <div className="test-section">
          <button
            onClick={handleTest}
            disabled={isProcessing || (!prompts.short.trim() && !prompts.long.trim() && !prompts.limit.trim())}
            className="test-button"
          >
            {isProcessing ? 'Тестирование...' : 'Запустить тест'}
          </button>
          {isProcessing && overallStatus && (
            <div className="overall-progress-section">
              <div className="overall-status">{overallStatus}</div>
              <div className="progress-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${overallProgress}%` }}
                  ></div>
                </div>
                <div className="progress-text">{overallProgress}%</div>
              </div>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="results-section">
            <h2>Результаты тестирования</h2>
            <div className="results-grid">
              {results.map((result) => (
                <div key={result.id} className="result-card">
                  <div className="result-header">
                    <h3>{getTypeLabel(result.type)}</h3>
                    <span className={`type-badge type-${result.type}`}>
                      {getTypeDescription(result.type)}
                    </span>
                  </div>
                  
                  <div className="result-content">
                    <div className="prompt-section">
                      <h4>Промпт:</h4>
                      <div className="prompt-text">
                        {result.prompt.length > 200
                          ? `${result.prompt.substring(0, 200)}... (${result.prompt.length} символов)`
                          : result.prompt}
                      </div>
                      <div className="prompt-stats">
                        Длина промпта: {result.promptLength.toLocaleString()} символов ·
                        Оценка: {result.estimatedPromptTokens.toLocaleString()} токенов
                      </div>
                    </div>

                    {result.isLoading ? (
                      <div className="loading-container">
                        <div className="loading-indicator">
                          <div className="status-text">
                            ⏳ Обработка запроса:
                          </div>
                          <div className="status-message">{result.status || 'Обработка...'}</div>
                          {result.progress !== undefined && (
                            <div className="progress-container">
                              <div className="progress-bar">
                                <div 
                                  className="progress-fill" 
                                  style={{ width: `${result.progress}%` }}
                                ></div>
                              </div>
                              <div className="progress-text">{result.progress}%</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : result.error ? (
                      <div className="error-section">
                        <h4>Ошибка:</h4>
                        <div className="error-message">{result.error}</div>
                      </div>
                    ) : (
                      <>
                        <div className="response-section">
                          <h4>Ответ:</h4>
                          <div className="response-text">
                            {result.response || 'Нет ответа'}
                          </div>
                        </div>

                        {result.usage && (
                          <div className="usage-section">
                            <h4>Использование токенов:</h4>
                            <div className="usage-grid">
                              <div className="usage-item">
                                <span className="usage-label">Запрос (prompt):</span>
                                <span className="usage-value">
                                  {result.usage.prompt_tokens.toLocaleString()} токенов
                                </span>
                              </div>
                              <div className="usage-item">
                                <span className="usage-label">Ответ (completion):</span>
                                <span className="usage-value">
                                  {result.usage.completion_tokens.toLocaleString()} токенов
                                </span>
                              </div>
                              <div className="usage-item total">
                                <span className="usage-label">Всего:</span>
                                <span className="usage-value">
                                  {result.usage.total_tokens.toLocaleString()} токенов
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.length === 0 && !isProcessing && (
          <div className="info-section">
            <h3>Информация о тесте</h3>
            <div className="info-grid">
              <div className="info-card">
                <h4>Короткий промпт</h4>
                <p>Введите промпт для первого столбца сравнения</p>
              </div>
              <div className="info-card">
                <h4>Длинный промпт</h4>
                <p>Введите промпт для второго столбца сравнения</p>
              </div>
              <div className="info-card">
                <h4>Лимитный промпт</h4>
                <p>Введите промпт для третьего столбца сравнения</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TokenComparison

