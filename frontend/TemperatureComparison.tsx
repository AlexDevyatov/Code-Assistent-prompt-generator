import { useState } from 'react'
import { Link } from 'react-router-dom'
import './TemperatureComparison.css'

interface TemperatureResult {
  id: string
  temperature: number
  response: string
  isLoading: boolean
  error?: string
  progress?: number
}

interface ComparisonMetrics {
  accuracy: string
  creativity: string
  diversity: string
}

function TemperatureComparison() {
  const [prompt, setPrompt] = useState('')
  const [results, setResults] = useState<TemperatureResult[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [comparison, setComparison] = useState<ComparisonMetrics | null>(null)

  const temperatures = [0, 0.7, 1.2]

  const callAPIStream = async (
    resultId: string,
    prompt: string,
    temperature: number,
    systemPrompt?: string
  ): Promise<void> => {
    try {
      const requestBody: any = {
        prompt: prompt,
        temperature: temperature,
      }
      if (systemPrompt) {
        requestBody.system_prompt = systemPrompt
      }

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `HTTP error! status: ${res.status}`)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullResponse = ''

      if (!reader) {
        throw new Error('No response body')
      }

      setResults((prev) =>
        prev.map((r) =>
          r.id === resultId
            ? { ...r, isLoading: true, progress: 10, response: '' }
            : r
        )
      )

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6)
            try {
              const data = JSON.parse(dataStr)
              if (data.content) {
                fullResponse += data.content
                setResults((prev) =>
                  prev.map((r) =>
                    r.id === resultId
                      ? {
                          ...r,
                          response: fullResponse,
                          isLoading: true,
                          progress: Math.min(90, 10 + (fullResponse.length / 1000) * 80),
                        }
                      : r
                  )
                )
              } else if (data.error) {
                throw new Error(data.error)
              }
            } catch (e) {
              // Игнорируем ошибки парсинга отдельных чанков
            }
          }
        }
      }

      setResults((prev) =>
        prev.map((r) =>
          r.id === resultId
            ? { ...r, isLoading: false, progress: 100, response: fullResponse }
            : r
        )
      )
    } catch (error) {
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

  const analyzeResults = async (allResults: TemperatureResult[]) => {
    try {
      const responsesText = allResults
        .filter((r) => r.response && !r.error)
        .map(
          (r, idx) => `Температура ${r.temperature}:
${r.response}

---`
        )
        .join('\n\n')

      const analysisPrompt = `Проанализируй следующие ответы на один и тот же запрос, полученные с разными значениями температуры (0, 0.7, 1.2):

${responsesText}

Оцени каждый ответ по следующим критериям:
1. **Точность** - насколько ответ корректен и соответствует фактам
2. **Креативность** - насколько ответ оригинален и нестандартен
3. **Разнообразие** - насколько ответ отличается от других ответов

Предоставь краткий анализ в следующем формате:
**Температура 0:**
- Точность: [оценка]
- Креативность: [оценка]
- Разнообразие: [оценка]

**Температура 0.7:**
- Точность: [оценка]
- Креативность: [оценка]
- Разнообразие: [оценка]

**Температура 1.2:**
- Точность: [оценка]
- Креативность: [оценка]
- Разнообразие: [оценка]

**Общий вывод:** [краткое сравнение и рекомендации]`

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: analysisPrompt,
        }),
      })

      const data = await res.json()
      const analysis = data.response

      // Парсим анализ для извлечения метрик
      const metrics: ComparisonMetrics = {
        accuracy: '',
        creativity: '',
        diversity: '',
      }

      // Простое извлечение информации из анализа
      const temp0Match = analysis.match(/Температура 0:[\s\S]*?Точность:([^\n]+)[\s\S]*?Креативность:([^\n]+)[\s\S]*?Разнообразие:([^\n]+)/i)
      const temp07Match = analysis.match(/Температура 0\.7:[\s\S]*?Точность:([^\n]+)[\s\S]*?Креативность:([^\n]+)[\s\S]*?Разнообразие:([^\n]+)/i)
      const temp12Match = analysis.match(/Температура 1\.2:[\s\S]*?Точность:([^\n]+)[\s\S]*?Креативность:([^\n]+)[\s\S]*?Разнообразие:([^\n]+)/i)

      if (temp0Match && temp07Match && temp12Match) {
        metrics.accuracy = `Temp 0: ${temp0Match[1].trim()}\nTemp 0.7: ${temp07Match[1].trim()}\nTemp 1.2: ${temp12Match[1].trim()}`
        metrics.creativity = `Temp 0: ${temp0Match[2].trim()}\nTemp 0.7: ${temp07Match[2].trim()}\nTemp 1.2: ${temp12Match[2].trim()}`
        metrics.diversity = `Temp 0: ${temp0Match[3].trim()}\nTemp 0.7: ${temp07Match[3].trim()}\nTemp 1.2: ${temp12Match[3].trim()}`
      } else {
        // Если не удалось распарсить, просто показываем весь анализ
        metrics.accuracy = analysis
        metrics.creativity = analysis
        metrics.diversity = analysis
      }

      setComparison(metrics)
    } catch (error) {
      console.error('Ошибка при анализе результатов:', error)
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    if (!prompt.trim() || isProcessing) return

    setIsProcessing(true)
    setResults([])
    setComparison(null)

    // Создаем результаты для всех температур
    const initialResults: TemperatureResult[] = temperatures.map((temp) => ({
      id: `temp-${temp}`,
      temperature: temp,
      response: '',
      isLoading: true,
    }))

    setResults(initialResults)

    // Обрабатываем каждую температуру параллельно
    const processTemperature = async (result: TemperatureResult) => {
      await callAPIStream(result.id, prompt, result.temperature)
    }

    // Запускаем обработку всех температур параллельно
    await Promise.all(initialResults.map(processTemperature))

    // Небольшая задержка для обновления состояния React
    await new Promise((resolve) => setTimeout(resolve, 300))

    // Получаем актуальные результаты из состояния
    let allResultsForAnalysis: TemperatureResult[] = []
    setResults((prevResults) => {
      allResultsForAnalysis = prevResults.filter((r) => r.response && !r.error)
      return prevResults
    })

    // Дополнительная задержка для гарантии обновления состояния
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Запускаем анализ результатов
    if (allResultsForAnalysis.length > 0) {
      await analyzeResults(allResultsForAnalysis)
    }

    setIsProcessing(false)
  }

  return (
    <div className="temperature-page">
      <div className="nav-bar">
        <Link to="/" className="nav-link">← На главную</Link>
      </div>
      <div className="temperature-container">
        <div className="temperature-header">
          <h1>Сравнение результатов с разными температурами</h1>
          <p className="temperature-description">
            Введите запрос для сравнения ответов с температурами 0, 0.7 и 1.2.
            Система автоматически сравнит результаты по точности, креативности и разнообразию.
          </p>
        </div>

        <div className="prompt-input-section">
          <form onSubmit={handleSubmit} className="prompt-form">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Введите запрос для сравнения (например: Опиши процесс фотосинтеза)"
              rows={4}
              disabled={isProcessing}
              className="prompt-textarea"
            />
            <button
              type="submit"
              disabled={isProcessing || !prompt.trim()}
              className="prompt-submit-button"
            >
              {isProcessing ? 'Обработка...' : 'Сравнить температуры'}
            </button>
          </form>
        </div>

        {results.length > 0 && (
          <div className="results-section">
            <h2>Результаты с разными температурами</h2>
            <div className="results-grid">
              {results.map((result) => (
                <div key={result.id} className="result-card">
                  <div className="result-header">
                    <h3>Температура: {result.temperature}</h3>
                    <span className={`temperature-badge temp-${result.temperature.toString().replace('.', '-')}`}>
                      {result.temperature === 0
                        ? 'Детерминированная'
                        : result.temperature === 0.7
                        ? 'Сбалансированная'
                        : 'Креативная'}
                    </span>
                  </div>
                  <div className="result-content">
                    {result.isLoading ? (
                      <div className="loading-container">
                        <div className="progress-bar-container">
                          <div
                            className="progress-bar"
                            style={{ width: `${result.progress || 10}%` }}
                          />
                        </div>
                        <div className="loading-indicator">
                          {result.progress
                            ? `Генерация ответа... ${Math.round(result.progress)}%`
                            : 'Подготовка...'}
                        </div>
                      </div>
                    ) : result.error ? (
                      <div className="error-message">Ошибка: {result.error}</div>
                    ) : (
                      <div className="result-text">{result.response}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {comparison && (
          <div className="comparison-section">
            <h2>Сравнительный анализ</h2>
            <div className="comparison-grid">
              <div className="comparison-card">
                <h3>Точность</h3>
                <div className="comparison-content">
                  <pre>{comparison.accuracy}</pre>
                </div>
              </div>
              <div className="comparison-card">
                <h3>Креативность</h3>
                <div className="comparison-content">
                  <pre>{comparison.creativity}</pre>
                </div>
              </div>
              <div className="comparison-card">
                <h3>Разнообразие</h3>
                <div className="comparison-content">
                  <pre>{comparison.diversity}</pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {results.length === 0 && !isProcessing && (
          <div className="example-section">
            <h3>Примеры запросов:</h3>
            <ul className="example-list">
              <li onClick={() => setPrompt('Опиши процесс фотосинтеза')}>
                Опиши процесс фотосинтеза
              </li>
              <li onClick={() => setPrompt('Придумай креативное название для нового кафе')}>
                Придумай креативное название для нового кафе
              </li>
              <li onClick={() => setPrompt('Объясни, что такое квантовая запутанность')}>
                Объясни, что такое квантовая запутанность
              </li>
              <li
                onClick={() =>
                  setPrompt('Напиши короткий рассказ о путешествии во времени')
                }
              >
                Напиши короткий рассказ о путешествии во времени
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export default TemperatureComparison

