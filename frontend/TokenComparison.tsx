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
  promptLength: number
  estimatedPromptTokens: number
}

function TokenComparison() {
  const [basePrompt, setBasePrompt] = useState('')
  const [results, setResults] = useState<TokenResult[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
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

  /**
   * Просит DeepSeek развернуть или сжать промпт до нужного объема
   */
  const expandPromptViaAPI = async (
    input: string,
    targetTokens: number,
    variantType: 'short' | 'long' | 'limit'
  ): Promise<{ prompt: string; estimatedTokens: number }> => {
    const seed = input.trim()
    if (!seed) return { prompt: '', estimatedTokens: 0 }

    let instruction = ''
    if (variantType === 'short') {
      instruction = `Сократи следующий промпт до примерно ${targetTokens} токенов, сохранив основную суть и ключевые идеи:\n\n${seed}`
    } else if (variantType === 'long') {
      instruction = `Разверни следующий промпт до примерно ${targetTokens} токенов, добавив детали, примеры и пояснения, но сохранив основную тему:\n\n${seed}`
    } else {
      // limit
      instruction = `Максимально разверни следующий промпт до примерно ${targetTokens} токенов (но не превышай этот лимит), добавив максимальное количество деталей, примеров, пояснений и контекста, сохранив основную тему:\n\n${seed}`
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: instruction,
          max_tokens: Math.min(targetTokens * 2, 32000), // Ограничиваем ответ
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `HTTP error! status: ${res.status}`)
      }

      const data = await res.json()
      const expandedPrompt = data.response || seed
      const estimated = estimateTokens(expandedPrompt)

      return { prompt: expandedPrompt, estimatedTokens: estimated }
    } catch (error) {
      // В случае ошибки возвращаем исходный промпт
      console.error('Error expanding prompt:', error)
      return { prompt: seed, estimatedTokens: estimateTokens(seed) }
    }
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
            ? { ...r, isLoading: true, error: undefined }
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
              }
            : r
        )
      )
    }
  }

  const handleTest = async () => {
    if (isProcessing) return
    if (!basePrompt.trim()) return

    // Генерируем уникальный ID для нового запроса
    const requestId = Date.now().toString()
    currentRequestIdRef.current = requestId

    setIsProcessing(true)
    setResults([])

    // Небольшая задержка для гарантии очистки UI
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Проверяем, не был ли отправлен новый запрос
    if (currentRequestIdRef.current !== requestId) return

    // Создаем результаты с пустыми промптами (будут заполнены после генерации)
    const initialResults: TokenResult[] = [
      {
        id: 'short',
        type: 'short',
        prompt: '',
        response: '',
        usage: null,
        isLoading: true,
        promptLength: 0,
        estimatedPromptTokens: 0,
      },
      {
        id: 'long',
        type: 'long',
        prompt: '',
        response: '',
        usage: null,
        isLoading: true,
        promptLength: 0,
        estimatedPromptTokens: 0,
      },
      {
        id: 'limit',
        type: 'limit',
        prompt: '',
        response: '',
        usage: null,
        isLoading: true,
        promptLength: 0,
        estimatedPromptTokens: 0,
      },
    ]

    setResults(initialResults)

    // Генерируем варианты промптов через DeepSeek API
    const shortTarget = 200
    const longTarget = 8000
    const limitTarget = 34000

    // Обновляем состояние для отображения процесса генерации
    setResults((prev) =>
      prev.map((r) =>
        r.id === 'short' || r.id === 'long' || r.id === 'limit'
          ? { ...r, isLoading: true, error: 'Генерация варианта промпта...' }
          : r
      )
    )

    // Генерируем варианты последовательно
    const short = await expandPromptViaAPI(basePrompt, shortTarget, 'short')
    if (currentRequestIdRef.current !== requestId) return

    setResults((prev) =>
      prev.map((r) =>
        r.id === 'short'
          ? {
              ...r,
              prompt: short.prompt,
              promptLength: short.prompt.length,
              estimatedPromptTokens: short.estimatedTokens,
              error: undefined,
            }
          : r
      )
    )

    const long = await expandPromptViaAPI(basePrompt, longTarget, 'long')
    if (currentRequestIdRef.current !== requestId) return

    setResults((prev) =>
      prev.map((r) =>
        r.id === 'long'
          ? {
              ...r,
              prompt: long.prompt,
              promptLength: long.prompt.length,
              estimatedPromptTokens: long.estimatedTokens,
              error: undefined,
            }
          : r
      )
    )

    const limit = await expandPromptViaAPI(basePrompt, limitTarget, 'limit')
    if (currentRequestIdRef.current !== requestId) return

    setResults((prev) =>
      prev.map((r) =>
        r.id === 'limit'
          ? {
              ...r,
              prompt: limit.prompt,
              promptLength: limit.prompt.length,
              estimatedPromptTokens: limit.estimatedTokens,
              error: undefined,
            }
          : r
      )
    )

    // Обрабатываем каждый запрос последовательно (чтобы не перегружать API)
    // Используем сгенерированные промпты
    const promptsToTest = [
      { id: 'short', prompt: short.prompt },
      { id: 'long', prompt: long.prompt },
      { id: 'limit', prompt: limit.prompt },
    ]

    for (const { id, prompt } of promptsToTest) {
      if (currentRequestIdRef.current !== requestId) break
      await callAPI(id, prompt, requestId)
      // Небольшая задержка между запросами
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // Проверяем актуальность запроса перед завершением
    if (currentRequestIdRef.current === requestId) {
      setIsProcessing(false)
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
        return 'Сжатый вариант (~200 токенов, оценка)'
      case 'long':
        return 'Развернутый вариант (~8000 токенов, оценка)'
      case 'limit':
        return 'Почти лимитный вариант (≤ 34000 токенов, оценка)'
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
            Введите свой промпт — страница автоматически сделает 3 версии (сжатую, развернутую и почти лимитную),
            затем отправит их в DeepSeek и покажет usage токенов на запрос/ответ.
          </p>
        </div>

        <div className="token-input-section">
          <textarea
            value={basePrompt}
            onChange={(e) => setBasePrompt(e.target.value)}
            placeholder="Введите ваш промпт..."
            rows={6}
            disabled={isProcessing}
            className="token-textarea"
          />
          <div className="token-input-hint">
            Оценка токенов (примерно): short ~200, long ~8000, limit ≤ 34000.
          </div>
        </div>

        <div className="test-section">
          <button
            onClick={handleTest}
            disabled={isProcessing || !basePrompt.trim()}
            className="test-button"
          >
            {isProcessing ? 'Тестирование...' : 'Запустить тест'}
          </button>
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
                        <div className="loading-indicator">Обработка запроса...</div>
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
                <h4>Короткий запрос</h4>
                <p>Простой запрос из нескольких слов (~10-50 токенов)</p>
              </div>
              <div className="info-card">
                <h4>Длинный запрос</h4>
                <p>Запрос с большим количеством текста (~5000-10000 токенов)</p>
              </div>
              <div className="info-card">
                <h4>Запрос превышающий лимит</h4>
                <p>
                  Запрос, который превышает контекстное окно модели DeepSeek Chat 
                  (32,000 токенов). Ожидается ошибка от API.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TokenComparison

