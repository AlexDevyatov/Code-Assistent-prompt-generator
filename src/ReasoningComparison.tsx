import { useState } from 'react'
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
                // Убрана автоматическая прокрутка во время генерации
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

    // Константа с инструкцией по LaTeX
    const latexInstruction = '\n\nВАЖНО: Все математические формулы, уравнения, выражения и символы должны быть строго в формате LaTeX. Используй синтаксис LaTeX: $...$ для inline формул и $$...$$ для блочных формул. Например: $x^2 + 5x + 6 = 0$ или $$\\int_0^1 x^2 dx = \\frac{1}{3}$$'

    // Обрабатываем каждый метод с использованием streaming
    const processMethod = async (result: ReasoningResult) => {
      try {
        if (result.id === 'direct') {
          // Прямой ответ
          await callAPIStream(result.id, task + latexInstruction)
        } else if (result.id === 'stepwise') {
          // Пошаговое решение
          await callAPIStream(result.id, `${task}${latexInstruction}\n\nРешай пошагово, объясняя каждый шаг.`)
        } else if (result.id === 'prompt-engineering') {
          // Для этого метода нужен двухэтапный процесс
          // Сначала получаем промпт (не streaming, т.к. короткий)
          const promptPrompt = `Создай оптимальный промпт для решения следующей задачи, который поможет получить наиболее точный и полный ответ. ОБЯЗАТЕЛЬНО включи в промпт требование: "Все математические формулы, уравнения, выражения и символы должны быть строго в формате LaTeX. Используй синтаксис LaTeX: $...$ для inline формул и $$...$$ для блочных формул." Отвечай только промптом, без дополнительных пояснений.\n\nЗадача: ${task}`
          
          // Получаем промпт обычным способом
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [
                { role: 'system', content: 'Ты — эксперт по созданию промптов для решения задач. Все создаваемые тобой промпты ОБЯЗАТЕЛЬНО должны включать требование использовать LaTeX для всех математических формул.' },
                { role: 'user', content: promptPrompt }
              ],
            }),
          })
          const data = await res.json()
          const generatedPrompt = data.response
          
          // Затем используем streaming для решения задачи
          // Добавляем инструкцию по LaTeX и в промпт, и отдельно для надежности
          await callAPIStream(result.id, generatedPrompt + latexInstruction, 'ОБЯЗАТЕЛЬНО используй LaTeX для всех математических формул, уравнений и выражений. Формат: $...$ для inline и $$...$$ для блочных формул.')
          
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
            task + latexInstruction,
            'Ты — опытный математик с глубокими знаниями в алгебре, геометрии и математическом анализе. Реши задачу, показав все математические выкладки и обоснования. Все формулы должны быть в формате LaTeX.'
          )
        } else if (result.id === 'expert-2') {
          // Эксперт-логик
          await callAPIStream(
            result.id,
            task + latexInstruction,
            'Ты — эксперт по логике и дедуктивному мышлению. Реши задачу, используя логические рассуждения и пошаговый анализ. Если в задаче есть математические элементы, используй LaTeX для их записи.'
          )
        } else if (result.id === 'expert-3') {
          // Эксперт-аналитик
          await callAPIStream(
            result.id,
            task + latexInstruction,
            'Ты — аналитик, специализирующийся на комплексном анализе проблем. Реши задачу, рассмотрев её с разных углов и предложив наиболее эффективное решение. ОБЯЗАТЕЛЬНО: все математические формулы, уравнения, выражения и символы должны быть строго в формате LaTeX. Используй синтаксис LaTeX: $...$ для inline формул (например: $x^2 + 5x + 6 = 0$) и $$...$$ для блочных формул (например: $$\\int_0^1 x^2 dx = \\frac{1}{3}$$). Никогда не используй обычный текст для математических выражений.'
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
    if (!text) return ['']
    
    // Улучшенный парсер для LaTeX формул
    // Обрабатываем block math ($$...$$) и inline math ($...$)
    const parts: (string | JSX.Element)[] = []
    let lastIndex = 0
    let key = 0

    // Обработка block math ($$...$$) - поддерживаем многострочные формулы
    // Используем более гибкий regex, который учитывает переносы строк
    const blockMathRegex = /\$\$([\s\S]*?)\$\$/g
    let match
    const blockMatches: Array<{start: number, end: number, content: string}> = []

    // Собираем все полные блоки
    blockMathRegex.lastIndex = 0
    while ((match = blockMathRegex.exec(text)) !== null) {
      blockMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1]
      })
    }

    // Обрабатываем блоки по порядку
    for (const blockMatch of blockMatches) {
      if (blockMatch.start > lastIndex) {
        const beforeText = text.slice(lastIndex, blockMatch.start)
        parts.push(...renderInlineMath(beforeText, key))
        key += beforeText.length
      }
      try {
        const mathContent = blockMatch.content.trim()
        if (mathContent) {
          parts.push(
            <BlockMath key={`block-${key}-${blockMatch.start}`} math={mathContent} />
          )
        }
      } catch (e) {
        // Если LaTeX невалидный, показываем как есть
        parts.push(`$$${blockMatch.content}$$`)
      }
      lastIndex = blockMatch.end
      key++
    }

    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex)
      parts.push(...renderInlineMath(remainingText, key))
    }

    return parts.length > 0 ? parts : [text]
  }

  const renderInlineMath = (text: string, startKey: number): (string | JSX.Element)[] => {
    if (!text) return []
    
    const parts: (string | JSX.Element)[] = []
    // Улучшенный regex для inline math - учитываем, что $ может быть частью формулы
    // Исключаем случаи, когда $ стоит в начале строки или после пробела (это может быть block math)
    const inlineMathRegex = /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g
    let lastIndex = 0
    let key = startKey

    // Собираем все совпадения
    const matches: Array<{start: number, end: number, content: string}> = []
    let match
    inlineMathRegex.lastIndex = 0
    while ((match = inlineMathRegex.exec(text)) !== null) {
      // Проверяем, что это не часть block math ($$...$$)
      const beforeChar = match.index > 0 ? text[match.index - 1] : ''
      const afterChar = match.index + match[0].length < text.length ? text[match.index + match[0].length] : ''
      if (beforeChar !== '$' && afterChar !== '$') {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          content: match[1]
        })
      }
    }

    // Обрабатываем совпадения
    for (const mathMatch of matches) {
      if (mathMatch.start > lastIndex) {
        parts.push(text.slice(lastIndex, mathMatch.start))
      }
      try {
        const mathContent = mathMatch.content.trim()
        if (mathContent) {
          parts.push(
            <InlineMath key={`inline-${key}-${mathMatch.start}`} math={mathContent} />
          )
        }
      } catch (e) {
        // Если LaTeX невалидный, показываем как есть
        parts.push(`$${mathMatch.content}$`)
      }
      lastIndex = mathMatch.end
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
                      <div className="result-text" key={`result-${result.id}`}>
                        {result.response ? renderMath(result.response) : ''}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
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

