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

  const requestDeepSeekText = async (prompt: string, maxTokens: number): Promise<string> => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(errorData.detail || `HTTP error! status: ${res.status}`)
    }

    const data = await res.json()
    return (data.response || '').trim()
  }

  /**
   * Генерация варианта промпта ЧЕРЕЗ DeepSeek:
   * - short: просим сжать до ~targetTokens
   * - long/limit: наращиваем итеративно (несколькими вызовами), чтобы не получить случайно короткий текст
   */
  const generateVariantViaDeepSeek = async (
    input: string,
    targetTokens: number,
    maxTokens: number,
    variantType: 'short' | 'long' | 'limit',
    onStatus?: (s: string) => void
  ): Promise<{ prompt: string; estimatedTokens: number }> => {
    const seed = input.trim()
    if (!seed) return { prompt: '', estimatedTokens: 0 }

    const trimToMax = (text: string) => {
      let out = text
      while (estimateTokens(out) > maxTokens) {
        out = out.slice(0, Math.max(1, out.length - 1000))
      }
      return out
    }

    try {
      if (variantType === 'short') {
        onStatus?.('Сжимаю промпт через DeepSeek…')
        const instruction =
          `Сократи следующий промпт до ~${targetTokens} токенов. ` +
          `Сохрани смысл и ключевые детали. Верни ТОЛЬКО итоговый промпт без пояснений.\n\n` +
          seed
        const out = await requestDeepSeekText(instruction, Math.min(1200, targetTokens * 2))
        const trimmed = trimToMax(out || seed)
        return { prompt: trimmed, estimatedTokens: estimateTokens(trimmed) }
      }

      // long / limit: итеративно наращиваем, пока не достигнем targetTokens
      const perCallMaxTokens = variantType === 'limit' ? 4000 : 3000 // больше токенов для limit
      const maxIters = variantType === 'long' ? 5 : 10

      onStatus?.('Готовлю базовую развернутую версию…')
      const firstInstruction =
        `Разверни следующий промпт значительно подробнее, добавив детали, примеры, структуру, критерии и пояснения. ` +
        `Сохрани основную тему и смысл. Верни ТОЛЬКО итоговый развернутый промпт без дополнительных пояснений.\n\n` +
        seed
      let out = await requestDeepSeekText(firstInstruction, perCallMaxTokens)
      if (!out || out.trim().length < seed.length) out = seed
      out = trimToMax(out)
      
      let prevTokens = estimateTokens(out)
      let noProgressCount = 0

      for (let i = 0; i < maxIters && estimateTokens(out) < targetTokens; i++) {
        const currentTokens = estimateTokens(out)
        const progress = Math.min(100, Math.round((currentTokens / targetTokens) * 100))
        onStatus?.(`Наращиваю промпт… ${progress}% (${currentTokens.toLocaleString()}/${targetTokens.toLocaleString()} токенов)`)

        // Просим DeepSeek расширить промпт дальше, указывая текущий размер и целевой
        const continueInstruction =
          `Текущий промпт содержит примерно ${currentTokens} токенов. ` +
          `Нужно расширить его до примерно ${targetTokens} токенов. ` +
          `Добавь больше деталей, примеров, edge-cases, критериев качества, форматов данных, ограничений и пояснений. ` +
          `Верни ПОЛНЫЙ расширенный промпт (включая всё предыдущее содержимое + новые дополнения), ` +
          `а не только дополнения. Цель: примерно ${targetTokens} токенов.\n\n` +
          `Текущий промпт:\n${out}`

        const expanded = await requestDeepSeekText(continueInstruction, perCallMaxTokens)
        if (!expanded || expanded.trim().length <= out.length) {
          noProgressCount++
          if (noProgressCount >= 2) break // если 2 раза подряд нет прогресса - останавливаемся
          continue
        }
        
        const newTokens = estimateTokens(expanded)
        if (newTokens <= prevTokens) {
          noProgressCount++
          if (noProgressCount >= 2) break
          continue
        }
        
        noProgressCount = 0
        out = trimToMax(expanded)
        prevTokens = newTokens
        
        // Если достигли цели или близки к ней - останавливаемся
        if (estimateTokens(out) >= targetTokens * 0.9) break
      }

      // финальная подгонка: не превышаем maxTokens (особенно важно для limit=34000)
      out = trimToMax(out)

      return { prompt: out, estimatedTokens: estimateTokens(out) }
    } catch (error) {
      console.error('Error generating variant prompt:', error)
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

    // Генерируем варианты последовательно
    const short = await generateVariantViaDeepSeek(
      basePrompt,
      shortTarget,
      shortTarget,
      'short',
      (s) =>
        setResults((prev) =>
          prev.map((r) => (r.id === 'short' ? { ...r, status: s } : r))
        )
    )
    if (currentRequestIdRef.current !== requestId) return

    setResults((prev) =>
      prev.map((r) =>
        r.id === 'short'
          ? {
              ...r,
              prompt: short.prompt,
              promptLength: short.prompt.length,
              estimatedPromptTokens: short.estimatedTokens,
              status: undefined,
            }
          : r
      )
    )

    const long = await generateVariantViaDeepSeek(
      basePrompt,
      longTarget,
      longTarget,
      'long',
      (s) =>
        setResults((prev) =>
          prev.map((r) => (r.id === 'long' ? { ...r, status: s } : r))
        )
    )
    if (currentRequestIdRef.current !== requestId) return

    setResults((prev) =>
      prev.map((r) =>
        r.id === 'long'
          ? {
              ...r,
              prompt: long.prompt,
              promptLength: long.prompt.length,
              estimatedPromptTokens: long.estimatedTokens,
              status: undefined,
            }
          : r
      )
    )

    const limit = await generateVariantViaDeepSeek(
      basePrompt,
      limitTarget,
      limitTarget,
      'limit',
      (s) =>
        setResults((prev) =>
          prev.map((r) => (r.id === 'limit' ? { ...r, status: s } : r))
        )
    )
    if (currentRequestIdRef.current !== requestId) return

    setResults((prev) =>
      prev.map((r) =>
        r.id === 'limit'
          ? {
              ...r,
              prompt: limit.prompt,
              promptLength: limit.prompt.length,
              estimatedPromptTokens: limit.estimatedTokens,
              status: undefined,
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
                        <div className="loading-indicator">
                          {result.status || 'Обработка...'}
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

