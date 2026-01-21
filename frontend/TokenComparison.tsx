import { useMemo, useRef, useState } from 'react'
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

  const buildPromptToTargetTokens = (
    input: string,
    targetTokens: number,
    maxTokens: number
  ): { prompt: string; estimatedTokens: number } => {
    const seed = input.trim()
    if (!seed) return { prompt: '', estimatedTokens: 0 }

    // Если нужно "сжать" — просто усечём до целевого размера по символам (быстро и предсказуемо)
    const currentTokens = estimateTokens(seed)
    if (currentTokens >= targetTokens) {
      // подберём длину по символам, затем чуть подгоним
      const ratio = targetTokens / currentTokens
      const approxChars = Math.max(40, Math.floor(seed.length * ratio))
      let candidate = seed.slice(0, approxChars)
      // подгоним вверх/вниз в пределах небольшого окна
      for (let i = 0; i < 200 && estimateTokens(candidate) > targetTokens; i++) {
        candidate = candidate.slice(0, Math.max(1, candidate.length - 10))
      }
      return { prompt: candidate, estimatedTokens: estimateTokens(candidate) }
    }

    // Если нужно "развернуть" — повторяем исходный промпт с разделителями, пока не достигнем
    const separator = '\n\n---\n\n'
    let out = seed
    while (estimateTokens(out) < targetTokens) {
      out += `${separator}${seed}`
      // safety: если вдруг улетели в память
      if (out.length > 2_000_000) break
    }

    // Ограничиваем верхнюю границу
    while (estimateTokens(out) > maxTokens) {
      out = out.slice(0, Math.max(1, out.length - 1000))
    }
    // И чуть подгоним вниз, чтобы точно не превышать maxTokens
    for (let i = 0; i < 400 && estimateTokens(out) > maxTokens; i++) {
      out = out.slice(0, Math.max(1, out.length - 50))
    }

    return { prompt: out, estimatedTokens: estimateTokens(out) }
  }

  const variants = useMemo(() => {
    const shortTarget = 200
    const longTarget = 8000
    const limitTarget = 34000

    const short = buildPromptToTargetTokens(basePrompt, shortTarget, shortTarget)
    const long = buildPromptToTargetTokens(basePrompt, longTarget, longTarget)
    const limit = buildPromptToTargetTokens(basePrompt, limitTarget, limitTarget) // <= 34000

    return {
      short,
      long,
      limit,
    }
  }, [basePrompt])

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

    // Создаем результаты
    const initialResults: TokenResult[] = [
      {
        id: 'short',
        type: 'short',
        prompt: variants.short.prompt,
        response: '',
        usage: null,
        isLoading: true,
        promptLength: variants.short.prompt.length,
        estimatedPromptTokens: variants.short.estimatedTokens,
      },
      {
        id: 'long',
        type: 'long',
        prompt: variants.long.prompt,
        response: '',
        usage: null,
        isLoading: true,
        promptLength: variants.long.prompt.length,
        estimatedPromptTokens: variants.long.estimatedTokens,
      },
      {
        id: 'limit',
        type: 'limit',
        prompt: variants.limit.prompt,
        response: '',
        usage: null,
        isLoading: true,
        promptLength: variants.limit.prompt.length,
        estimatedPromptTokens: variants.limit.estimatedTokens,
      },
    ]

    setResults(initialResults)

    // Обрабатываем каждый запрос последовательно (чтобы не перегружать API)
    for (const result of initialResults) {
      if (currentRequestIdRef.current !== requestId) break
      await callAPI(result.id, result.prompt, requestId)
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

