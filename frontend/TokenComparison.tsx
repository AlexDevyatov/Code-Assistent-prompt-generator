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
  const [basePrompt, setBasePrompt] = useState('')
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
    onStatus?: (s: string, progress?: number) => void
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
        onStatus?.('Используется исходный промпт', 100)
        return { prompt: seed, estimatedTokens: estimateTokens(seed) }
      }

      // long / limit: итеративно наращиваем, пока не достигнем targetTokens
      const perCallMaxTokens = 2000 // безопасный размер чанка
      const maxIters = variantType === 'long' ? 8 : 24

      onStatus?.('Готовлю базовую развернутую версию…', 5)
      const firstInstruction =
        `Разверни следующий промпт значительно подробнее, добавив структуры, критерии, детали, примеры и ограничения. ` +
        `Верни ТОЛЬКО итоговый промпт без пояснений.\n\n` +
        seed
      let out = await requestDeepSeekText(firstInstruction, perCallMaxTokens)
      if (!out) out = seed
      out = trimToMax(out)

      for (let i = 0; i < maxIters && estimateTokens(out) < targetTokens; i++) {
        const currentProgress = Math.min(
          95,
          5 + Math.round((estimateTokens(out) / targetTokens) * 90)
        )
        onStatus?.(
          `Наращиваю промпт… ${Math.round((estimateTokens(out) / targetTokens) * 100)}%`,
          currentProgress
        )

        const continueInstruction =
          `Продолжи РАСШИРЯТЬ и УТОЧНЯТЬ промпт ниже, добавляя больше деталей, примеров, ` +
          `edge-cases, критериев качества, входных/выходных форматов. ` +
          `Верни ТОЛЬКО ДОПОЛНЕНИЕ, которое нужно ПРИБАВИТЬ в конец (без вступления/заголовков).\n\n` +
          out

        const addition = await requestDeepSeekText(continueInstruction, perCallMaxTokens)
        if (!addition) break
        out = trimToMax(`${out}\n\n${addition}`)

        // гарантируем, что long не станет меньше short (и вообще растёт)
        if (estimateTokens(out) <= estimateTokens(seed) && i > 0) break
      }

      // финальная подгонка: не превышаем maxTokens (особенно важно для limit=30000)
      out = trimToMax(out)

      // если по какой-то причине получилось сильно меньше target — всё равно возвращаем то, что есть
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
    if (!basePrompt.trim()) return

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
        phase: 'generating',
        progress: 0,
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
        phase: 'generating',
        progress: 0,
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
        phase: 'generating',
        progress: 0,
      },
    ]

    setResults(initialResults)

    // Генерируем варианты промптов через DeepSeek API
    const longTarget = 8000
    const limitTarget = 30000

    // Для короткого запроса используем введенный промпт как есть
    setOverallStatus('Подготовка промптов...')
    setOverallProgress(5)
    
    const short = {
      prompt: basePrompt.trim(),
      estimatedTokens: estimateTokens(basePrompt.trim())
    }

    setResults((prev) =>
      prev.map((r) =>
        r.id === 'short'
          ? {
              ...r,
              prompt: short.prompt,
              promptLength: short.prompt.length,
              estimatedPromptTokens: short.estimatedTokens,
              status: 'Промпт готов',
              phase: 'processing',
              progress: 100,
            }
          : r
      )
    )
    if (currentRequestIdRef.current !== requestId) return

    setOverallStatus('Генерация длинного промпта...')
    setOverallProgress(15)

    const long = await generateVariantViaDeepSeek(
      basePrompt,
      longTarget,
      longTarget,
      'long',
      (s, progress) =>
        setResults((prev) =>
          prev.map((r) => (r.id === 'long' ? { ...r, status: s, progress, phase: 'generating' } : r))
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
              status: 'Промпт готов',
              phase: 'processing',
              progress: 100,
            }
          : r
      )
    )
    if (currentRequestIdRef.current !== requestId) return

    setOverallStatus('Генерация лимитного промпта...')
    setOverallProgress(40)

    const limit = await generateVariantViaDeepSeek(
      basePrompt,
      limitTarget,
      limitTarget,
      'limit',
      (s, progress) =>
        setResults((prev) =>
          prev.map((r) => (r.id === 'limit' ? { ...r, status: s, progress, phase: 'generating' } : r))
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
              status: 'Промпт готов',
              phase: 'processing',
              progress: 100,
            }
          : r
      )
    )
    if (currentRequestIdRef.current !== requestId) return

    setOverallStatus('Отправка запросов в DeepSeek...')
    setOverallProgress(65)

    // Обрабатываем каждый запрос последовательно (чтобы не перегружать API)
    // Используем сгенерированные промпты
    const promptsToTest = [
      { id: 'short', prompt: short.prompt },
      { id: 'long', prompt: long.prompt },
      { id: 'limit', prompt: limit.prompt },
    ]

    for (let i = 0; i < promptsToTest.length; i++) {
      if (currentRequestIdRef.current !== requestId) break
      const { id, prompt } = promptsToTest[i]
      const progressBase = 65 + (i * 30) / promptsToTest.length
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
        return 'Исходный промпт (без изменений)'
      case 'long':
        return 'Развернутый вариант (~8000 токенов, оценка)'
      case 'limit':
        return 'Почти лимитный вариант (≤ 30000 токенов, оценка)'
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
            Введите свой промпт — страница автоматически сделает 3 версии (исходный промпт, развернутый до ~8000 токенов и наращенный до ~30000 токенов),
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
            Короткий запрос: исходный промпт. Длинный: ~8000 токенов. Лимитный: ≤ 30000 токенов.
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
                            {result.phase === 'generating' ? '🔄 Генерация промпта:' : '⏳ Обработка запроса:'}
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
                <h4>Короткий запрос</h4>
                <p>Введенный промпт используется как есть, без изменений</p>
              </div>
              <div className="info-card">
                <h4>Длинный запрос</h4>
                <p>Промпт наращивается до ~8000 токенов через DeepSeek API</p>
              </div>
              <div className="info-card">
                <h4>Запрос превышающий лимит</h4>
                <p>
                  Промпт наращивается до ~30000 токенов через DeepSeek API
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

