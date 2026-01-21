import { useState, useRef } from 'react'
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
}

function TokenComparison() {
  const [results, setResults] = useState<TokenResult[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const currentRequestIdRef = useRef<string | null>(null)

  // Генерация тестовых промптов
  const generateShortPrompt = (): string => {
    return 'Привет! Как дела?'
  }

  const generateLongPrompt = (): string => {
    // Создаем длинный промпт (~5000-10000 токенов)
    const baseText = `
Опиши подробно процесс разработки веб-приложения с использованием React и TypeScript. 
Включи информацию о настройке проекта, структуре компонентов, управлении состоянием, 
маршрутизации, работе с API, обработке ошибок, тестировании и деплое. 
Расскажи о лучших практиках, паттернах проектирования, оптимизации производительности, 
доступности и безопасности. Добавь примеры кода, объяснения архитектурных решений 
и рекомендации по масштабированию приложения.
`.trim()
    
    // Повторяем текст много раз для создания длинного промпта
    return baseText.repeat(200) // ~10000 токенов
  }

  const generateLimitExceedingPrompt = (): string => {
    // Создаем промпт, превышающий лимит модели (~35000+ токенов)
    // DeepSeek Chat имеет контекстное окно 32k токенов
    const baseText = `
Это очень длинный текст, который будет повторяться много раз для создания промпта, 
превышающего лимит контекстного окна модели. Модель DeepSeek Chat имеет ограничение 
в 32,000 токенов для контекста. Этот промпт специально создан для тестирования 
поведения API при превышении лимита. Мы повторяем этот текст множество раз, 
чтобы достичь размера, превышающего допустимый лимит модели. Каждое повторение 
добавляет дополнительные токены к общему размеру промпта, постепенно приближаясь 
к границе контекстного окна и затем превышая её.
`.trim()
    
    // Повторяем текст много раз для создания промпта, превышающего лимит
    // ~50 токенов на повторение, нужно ~700+ повторений для 35k+ токенов
    return baseText.repeat(1000) // ~50000+ токенов (превышает лимит 32k)
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

    // Генерируем уникальный ID для нового запроса
    const requestId = Date.now().toString()
    currentRequestIdRef.current = requestId

    setIsProcessing(true)
    setResults([])

    // Небольшая задержка для гарантии очистки UI
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Проверяем, не был ли отправлен новый запрос
    if (currentRequestIdRef.current !== requestId) return

    // Создаем тестовые промпты
    const shortPrompt = generateShortPrompt()
    const longPrompt = generateLongPrompt()
    const limitPrompt = generateLimitExceedingPrompt()

    // Создаем результаты
    const initialResults: TokenResult[] = [
      {
        id: 'short',
        type: 'short',
        prompt: shortPrompt,
        response: '',
        usage: null,
        isLoading: true,
        promptLength: shortPrompt.length,
      },
      {
        id: 'long',
        type: 'long',
        prompt: longPrompt,
        response: '',
        usage: null,
        isLoading: true,
        promptLength: longPrompt.length,
      },
      {
        id: 'limit',
        type: 'limit',
        prompt: limitPrompt,
        response: '',
        usage: null,
        isLoading: true,
        promptLength: limitPrompt.length,
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
        return 'Простой короткий запрос (~10-50 токенов)'
      case 'long':
        return 'Длинный запрос (~5000-10000 токенов)'
      case 'limit':
        return 'Запрос, превышающий лимит контекстного окна модели (~35000+ токенов)'
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
            Тестирование подсчёта токенов для запросов разной длины: короткий запрос, 
            длинный запрос и запрос, превышающий лимит модели DeepSeek Chat (32k токенов).
          </p>
        </div>

        <div className="test-section">
          <button
            onClick={handleTest}
            disabled={isProcessing}
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
                        Длина промпта: {result.promptLength.toLocaleString()} символов
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

