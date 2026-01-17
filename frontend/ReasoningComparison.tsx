import { useState } from 'react'
import { Link } from 'react-router-dom'
import { InlineMath, BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import './ReasoningComparison.css'
import {
  LATEX_INSTRUCTION,
  EXPERT_MATHEMATICIAN,
  EXPERT_LOGICIAN,
  EXPERT_ANALYST,
  EXPERT_ANALYTIC_COMPARER,
  PROMPT_GENERATOR_SYSTEM,
  PROMPT_GENERATOR_PROMPT_TEMPLATE,
  COMPARISON_PROMPT_TEMPLATE
} from './constants'

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
    try {
      // Отправляем только system_prompt и текущий запрос (без истории)
      const requestBody: any = {
        prompt: prompt,
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

    // Обрабатываем каждый метод с использованием streaming
    const processMethod = async (result: ReasoningResult) => {
      try {
        if (result.id === 'direct') {
          // Прямой ответ
          await callAPIStream(result.id, task + LATEX_INSTRUCTION)
        } else if (result.id === 'stepwise') {
          // Пошаговое решение
          await callAPIStream(result.id, `${task}${LATEX_INSTRUCTION}\n\nРешай пошагово, объясняя каждый шаг.`)
        } else if (result.id === 'prompt-engineering') {
          // Для этого метода нужен двухэтапный процесс
          // Сначала получаем промпт (не streaming, т.к. короткий)
          const promptPrompt = PROMPT_GENERATOR_PROMPT_TEMPLATE(task)
          
          // Получаем промпт обычным способом (отправляем только system_prompt и текущий запрос)
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_prompt: PROMPT_GENERATOR_SYSTEM,
              prompt: promptPrompt
            }),
          })
          const data = await res.json()
          const generatedPrompt = data.response
          
          // Затем используем streaming для решения задачи
          // Добавляем инструкцию по LaTeX и в промпт, и отдельно для надежности
          await callAPIStream(result.id, generatedPrompt + LATEX_INSTRUCTION, 'ОБЯЗАТЕЛЬНО используй LaTeX для всех математических формул, уравнений и выражений. Формат: $...$ для inline и $$...$$ для блочных формул.')
          
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
            task + LATEX_INSTRUCTION,
            EXPERT_MATHEMATICIAN
          )
        } else if (result.id === 'expert-2') {
          // Эксперт-логик
          await callAPIStream(
            result.id,
            task + LATEX_INSTRUCTION,
            EXPERT_LOGICIAN
          )
        } else if (result.id === 'expert-3') {
          // Эксперт-аналитик
          await callAPIStream(
            result.id,
            task + LATEX_INSTRUCTION,
            EXPERT_ANALYST
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

    // Небольшая задержка для обновления состояния React
    await new Promise(resolve => setTimeout(resolve, 300))

    // После завершения всех методов запускаем суммаризатор
    // Получаем актуальные результаты из состояния
    let allResultsForComparison: ReasoningResult[] = []
    setResults((prevResults) => {
      allResultsForComparison = prevResults.filter(r => r.response && !r.error && r.id !== 'summarizer')
      return prevResults
    })

    // Дополнительная задержка для гарантии обновления состояния
    await new Promise(resolve => setTimeout(resolve, 100))

    if (allResultsForComparison.length > 0) {
      // Создаем результат для суммаризатора
      const summarizerResult: ReasoningResult = {
        id: 'summarizer',
        method: 'Сравнение и анализ ответов',
        prompt: task,
        response: '',
        isLoading: true,
      }
      
      setResults((prev) => [...prev, summarizerResult])

      // Формируем промпт для суммаризатора
      const responsesText = allResultsForComparison.map((r, idx) => `Метод ${idx + 1}: ${r.method}
Ответ:
${r.response}

---`).join('\n\n')
      
      const comparisonPrompt = COMPARISON_PROMPT_TEMPLATE(task, responsesText)

      // Запускаем суммаризатор
      try {
        await callAPIStream(
          'summarizer',
          comparisonPrompt + LATEX_INSTRUCTION,
          EXPERT_ANALYTIC_COMPARER
        )
      } catch (error) {
        console.error('Ошибка при работе суммаризатора:', error)
      }
    }

    setIsProcessing(false)
  }

  const renderMath = (text: string) => {
    if (!text) return ['']
    
    // Улучшенный парсер для LaTeX формул
    // Обрабатываем block math ($$...$$) и inline math ($...$)
    // Также распознаем LaTeX команды и математические выражения
    const parts: (string | JSX.Element)[] = []
    let lastIndex = 0
    let key = 0

    // Обработка block math ($$...$$) - поддерживаем многострочные формулы
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
    let lastIndex = 0
    let key = startKey

    // Regex для поиска inline math ($...$)
    const inlineMathRegex = /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g
    
    // Собираем все совпадения inline math
    const inlineMatches: Array<{start: number, end: number, content: string, type: 'inline'}> = []
    let match
    inlineMathRegex.lastIndex = 0
    while ((match = inlineMathRegex.exec(text)) !== null) {
      const beforeChar = match.index > 0 ? text[match.index - 1] : ''
      const afterChar = match.index + match[0].length < text.length ? text[match.index + match[0].length] : ''
      if (beforeChar !== '$' && afterChar !== '$') {
        inlineMatches.push({
          start: match.index,
          end: match.index + match[0].length,
          content: match[1],
          type: 'inline'
        })
      }
    }

    // Ищем LaTeX выражения (последовательности, содержащие \команда)
    // Алгоритм: находим все обратные слэши, которые не экранированы, и расширяем выражение
    const latexMatches: Array<{start: number, end: number, content: string, type: 'latex'}> = []
    
    for (let i = 0; i < text.length; i++) {
      // Пропускаем, если это часть inline math
      const isInInlineMath = inlineMatches.some(m => i >= m.start && i < m.end)
      if (isInInlineMath) continue
      
      // Ищем обратный слэш (начало LaTeX команды)
      if (text[i] === '\\' && (i === 0 || text[i - 1] !== '\\')) {
        let startPos = i
        let endPos = i + 1
        
        // Пропускаем обратный слэш и собираем команду
        while (endPos < text.length && /[a-zA-Z@]/.test(text[endPos])) {
          endPos++
        }
        
        // Если нашли команду, расширяем выражение, включая аргументы
        if (endPos > i + 1) {
          // Обрабатываем аргументы в {} и []
          let braceCount = 0
          let bracketCount = 0
          
          while (endPos < text.length) {
            const char = text[endPos]
            if (char === '{') braceCount++
            else if (char === '}') {
              braceCount--
              if (braceCount < 0) break
            }
            else if (char === '[') bracketCount++
            else if (char === ']') {
              bracketCount--
              if (bracketCount < 0) break
            }
            else if (braceCount === 0 && bracketCount === 0) {
              // Проверяем, является ли следующий символ частью математического выражения
              if (char === '\\' && text[endPos - 1] !== '\\') {
                // Новая команда - расширяем
                endPos++
                continue
              }
              if (/[\^_]/.test(char)) {
                // Индексы/степени - расширяем
                endPos++
                if (endPos < text.length && text[endPos] === '{') {
                  endPos++
                  braceCount++
                  continue
                }
                if (endPos < text.length && /[a-zA-Z0-9]/.test(text[endPos])) {
                  endPos++
                  continue
                }
              }
              if (!/[a-zA-Z0-9\^_\{\[\(\)\+\-\*\/=<>≤≥≠±×÷∑∏∫√∞α-ωΑ-Ω\s]/.test(char)) {
                break
              }
            }
            endPos++
          }
          
          // Расширяем влево, если есть математические символы
          while (startPos > 0) {
            const prevChar = text[startPos - 1]
            if (/[a-zA-Z0-9\^_\{\[\(\)\+\-\*\/=<>≤≥≠±×÷∑∏∫√∞α-ωΑ-Ω]/.test(prevChar)) {
              startPos--
            } else {
              break
            }
          }
          
          // Расширяем вправо, если есть математические символы
          while (endPos < text.length) {
            const nextChar = text[endPos]
            if (nextChar === '\\' && text[endPos - 1] !== '\\') {
              // Новая команда - включаем её
              endPos++
              continue
            }
            if (!/[a-zA-Z0-9\^_\}\])\(\)\+\-\*\/=<>≤≥≠±×÷∑∏∫√∞α-ωΑ-Ω\s]/.test(nextChar)) {
              break
            }
            endPos++
          }
          
          const content = text.slice(startPos, endPos)
          if (content.trim().length > 0) {
            latexMatches.push({
              start: startPos,
              end: endPos,
              content: content.trim(),
              type: 'latex'
            })
          }
          
          i = endPos - 1 // Пропускаем обработанную часть
        }
      }
    }

    // Объединяем все совпадения и сортируем по позиции
    const allMatches = [...inlineMatches, ...latexMatches].sort((a, b) => a.start - b.start)
    
    // Удаляем перекрывающиеся совпадения (приоритет у inline math)
    const filteredMatches: Array<{start: number, end: number, content: string, type: string}> = []
    for (const m of allMatches) {
      const overlaps = filteredMatches.some(fm => 
        (m.start < fm.end && m.end > fm.start)
      )
      if (!overlaps) {
        filteredMatches.push(m)
      }
    }
    
    // Сортируем снова после фильтрации
    filteredMatches.sort((a, b) => a.start - b.start)

    // Обрабатываем совпадения
    for (const mathMatch of filteredMatches) {
      if (mathMatch.start > lastIndex) {
        const plainText = text.slice(lastIndex, mathMatch.start)
        if (plainText.trim()) {
          parts.push(plainText)
        }
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
        parts.push(mathMatch.content)
      }
      lastIndex = mathMatch.end
      key++
    }

    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex)
      if (remainingText.trim()) {
        parts.push(remainingText)
      }
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
                <div key={result.id} className={`result-card ${result.id === 'summarizer' ? 'summarizer-card' : ''}`}>
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

