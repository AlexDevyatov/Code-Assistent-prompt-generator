import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { InlineMath, BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import './ReasoningComparison.css'

interface ReasoningResult {
  id: string
  method: string
  prompt: string
  response: string
  isLoading: boolean
  error?: string
  progress?: number
}


function ReasoningComparison() {
  const [task, setTask] = useState('')
  const [results, setResults] = useState<ReasoningResult[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const resultsEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [results])

  const callAPIStream = async (
    resultId: string,
    prompt: string,
    systemPrompt?: string
  ): Promise<void> => {
    const messages = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages,
        }),
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

      // Обновляем статус - начинаем получать данные
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
                scrollToBottom()
              } else if (data.error) {
                throw new Error(data.error)
              }
            } catch (e) {
              // Игнорируем ошибки парсинга отдельных чанков
            }
          }
        }
      }

      // Завершаем
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    if (!task.trim() || isProcessing) return

    setIsProcessing(true)
    setResults([])

    // Создаем результаты для всех методов
    const initialResults: ReasoningResult[] = [
      {
        id: 'direct',
        method: 'Прямой ответ',
        prompt: task,
        response: '',
        isLoading: true,
      },
      {
        id: 'stepwise',
        method: 'Пошаговое решение',
        prompt: task,
        response: '',
        isLoading: true,
      },
      {
        id: 'prompt-engineering',
        method: 'Промпт от другого ИИ',
        prompt: task,
        response: '',
        isLoading: true,
      },
      {
        id: 'expert-1',
        method: 'Эксперт 1 (Математик)',
        prompt: task,
        response: '',
        isLoading: true,
      },
      {
        id: 'expert-2',
        method: 'Эксперт 2 (Логик)',
        prompt: task,
        response: '',
        isLoading: true,
      },
      {
        id: 'expert-3',
        method: 'Эксперт 3 (Аналитик)',
        prompt: task,
        response: '',
        isLoading: true,
      },
    ]

    setResults(initialResults)

    // Обрабатываем каждый метод с использованием streaming
    const processMethod = async (result: ReasoningResult) => {
      try {
        if (result.id === 'direct') {
          // Прямой ответ
          await callAPIStream(result.id, task)
        } else if (result.id === 'stepwise') {
          // Пошаговое решение
          await callAPIStream(result.id, `${task}\n\nРешай пошагово, объясняя каждый шаг.`)
        } else if (result.id === 'prompt-engineering') {
          // Для этого метода нужен двухэтапный процесс
          // Сначала получаем промпт (не streaming, т.к. короткий)
          const promptPrompt = `Создай оптимальный промпт для решения следующей задачи, который поможет получить наиболее точный и полный ответ. Отвечай только промптом, без дополнительных пояснений.\n\nЗадача: ${task}`
          
          // Получаем промпт обычным способом
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [
                { role: 'system', content: 'Ты — эксперт по созданию промптов для решения задач.' },
                { role: 'user', content: promptPrompt }
              ],
            }),
          })
          const data = await res.json()
          const generatedPrompt = data.response
          
          // Затем используем streaming для решения задачи
          await callAPIStream(result.id, generatedPrompt)
          
          // Обновляем результат с информацией о промпте
          setResults((prev) =>
            prev.map((r) =>
              r.id === result.id
                ? {
                    ...r,
                    response: `Использованный промпт: "${generatedPrompt}"\n\n---\n\nРешение:\n${r.response}`,
                  }
                : r
            )
          )
        } else if (result.id === 'expert-1') {
          // Эксперт-математик
          await callAPIStream(
            result.id,
            task,
            'Ты — опытный математик с глубокими знаниями в алгебре, геометрии и математическом анализе. Реши задачу, показав все математические выкладки и обоснования.'
          )
        } else if (result.id === 'expert-2') {
          // Эксперт-логик
          await callAPIStream(
            result.id,
            task,
            'Ты — эксперт по логике и дедуктивному мышлению. Реши задачу, используя логические рассуждения и пошаговый анализ.'
          )
        } else if (result.id === 'expert-3') {
          // Эксперт-аналитик
          await callAPIStream(
            result.id,
            task,
            'Ты — аналитик, специализирующийся на комплексном анализе проблем. Реши задачу, рассмотрев её с разных углов и предложив наиболее эффективное решение.'
          )
        }
      } catch (error) {
        setResults((prev) =>
          prev.map((r) =>
            r.id === result.id
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

    // Запускаем обработку всех методов параллельно
    await Promise.all(initialResults.map(processMethod))

    setIsProcessing(false)
  }

  const renderMath = (text: string) => {
    // Простой парсер для LaTeX формул
    // Ищем блоки $...$ для inline и $$...$$ для block
    const parts: (string | JSX.Element)[] = []
    let lastIndex = 0
    let key = 0

    // Обработка block math ($$...$$)
    const blockMathRegex = /\$\$([^$]+)\$\$/g
    let match

    while ((match = blockMathRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const beforeText = text.slice(lastIndex, match.index)
        parts.push(...renderInlineMath(beforeText, key))
        key += beforeText.length
      }
      parts.push(
        <BlockMath key={`block-${key}`} math={match[1]} />
      )
      lastIndex = match.index + match[0].length
      key++
    }

    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex)
      parts.push(...renderInlineMath(remainingText, key))
    }

    return parts.length > 0 ? parts : [text]
  }

  const renderInlineMath = (text: string, startKey: number): (string | JSX.Element)[] => {
    const parts: (string | JSX.Element)[] = []
    const inlineMathRegex = /\$([^$\n]+)\$/g
    let lastIndex = 0
    let key = startKey

    let match
    while ((match = inlineMathRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index))
      }
      try {
        parts.push(
          <InlineMath key={`inline-${key}`} math={match[1]} />
        )
      } catch (e) {
        // Если LaTeX невалидный, показываем как есть
        parts.push(`$${match[1]}$`)
      }
      lastIndex = match.index + match[0].length
      key++
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }

    return parts.length > 0 ? parts : [text]
  }

  return (
    <div className="reasoning-page">
      <div className="nav-bar">
        <Link to="/" className="nav-link">← На главную</Link>
      </div>
      <div className="reasoning-container">
        <div className="reasoning-header">
          <h1>Сравнение способов рассуждения</h1>
          <p className="reasoning-description">
            Введите задачу для сравнения разных методов решения с помощью ИИ.
            Поддерживается отображение математических формул в формате LaTeX.
          </p>
        </div>

        <div className="task-input-section">
          <form onSubmit={handleSubmit} className="task-form">
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Введите задачу (например: Решите уравнение x² + 5x + 6 = 0)"
              rows={4}
              disabled={isProcessing}
              className="task-textarea"
            />
            <button
              type="submit"
              disabled={isProcessing || !task.trim()}
              className="task-submit-button"
            >
              {isProcessing ? 'Обработка...' : 'Сравнить методы'}
            </button>
          </form>
        </div>

        {results.length > 0 && (
          <div className="results-section">
            <h2>Результаты сравнения</h2>
            <div className="results-grid">
              {results.map((result) => (
                <div key={result.id} className="result-card">
                  <div className="result-header">
                    <h3>{result.method}</h3>
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
                          {result.progress ? `Генерация ответа... ${Math.round(result.progress)}%` : 'Подготовка...'}
                        </div>
                      </div>
                    ) : result.error ? (
                      <div className="error-message">Ошибка: {result.error}</div>
                    ) : (
                      <div className="result-text">
                        {renderMath(result.response)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div ref={resultsEndRef} />
          </div>
        )}

        {results.length === 0 && !isProcessing && (
          <div className="example-section">
            <h3>Примеры задач:</h3>
            <ul className="example-list">
              <li onClick={() => setTask('Решите уравнение: $x^2 + 5x + 6 = 0$')}>
                Решите уравнение: $x^2 + 5x + 6 = 0$
              </li>
              <li onClick={() => setTask('Докажите, что сумма углов треугольника равна 180°')}>
                Докажите, что сумма углов треугольника равна 180°
              </li>
              <li onClick={() => setTask('Найдите производную функции $f(x) = x^3 + 2x^2 - 5x + 1$')}>
                Найдите производную функции $f(x) = x^3 + 2x^2 - 5x + 1$
              </li>
              <li onClick={() => setTask('Логическая задача: В комнате 3 лампочки и 3 выключателя. Как определить, какой выключатель к какой лампочке относится, зайдя в комнату только один раз?')}>
                Логическая задача: В комнате 3 лампочки и 3 выключателя. Как определить, какой выключатель к какой лампочке относится, зайдя в комнату только один раз?
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReasoningComparison

