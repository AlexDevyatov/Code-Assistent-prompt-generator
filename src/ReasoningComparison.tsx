import { useState, useEffect } from 'react'
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
  const [comparison, setComparison] = useState<string>('')
  const [isGeneratingComparison, setIsGeneratingComparison] = useState(false)

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
    setComparison('')

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

  // Генерируем сравнение когда все результаты готовы
  useEffect(() => {
    const generateComparison = async () => {
      // Проверяем, что все результаты готовы (не загружаются и нет ошибок)
      const readyResults = results.filter(r => !r.isLoading && !r.error && r.response)
      const allReady = results.length > 0 && results.every(r => !r.isLoading)
      
      // Проверяем, что сравнение еще не генерируется и не было сгенерировано
      if (allReady && readyResults.length > 0 && !isProcessing && !isGeneratingComparison && !comparison) {
        setIsGeneratingComparison(true)
        try {
          // Получаем все ответы
          const allResponses = readyResults
            .map(r => `${r.method}:\n${r.response}`)
            .join('\n\n---\n\n')

          if (allResponses.length === 0) {
            setComparison('')
            setIsGeneratingComparison(false)
            return
          }

          const comparisonPrompt = `Ниже представлены ответы разных методов решения задачи "${task}":

${allResponses}

Сравните, отличаются ли ответы и какой из них оказался правильнее. Проанализируйте каждый метод, укажите различия и определите наиболее точный и полный ответ. Все математические формулы, уравнения, выражения и символы должны быть строго в формате LaTeX. Используй синтаксис LaTeX: $...$ для inline формул и $$...$$ для блочных формул.`

          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [
                { role: 'system', content: 'Ты — эксперт по анализу и сравнению решений задач. Твоя задача — сравнить разные подходы и определить наиболее правильный ответ. ОБЯЗАТЕЛЬНО используй LaTeX для всех математических формул.' },
                { role: 'user', content: comparisonPrompt }
              ],
            }),
          })

          const data = await res.json()
          setComparison(data.response)
        } catch (error) {
          setComparison('Ошибка при генерации сравнения: ' + (error instanceof Error ? error.message : 'Неизвестная ошибка'))
        } finally {
          setIsGeneratingComparison(false)
        }
      }
    }

    generateComparison()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, isProcessing, task])

  const renderMath = (text: string) => {
    if (!text) return ['']
    
    // Конвертируем весь текст в LaTeX формат
    // Обрабатываем block math ($$...$$) и inline math ($...$)
    // Обычный текст оборачиваем в \text{...}
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
        // Если LaTeX невалидный, оборачиваем в \text
        const escapedContent = blockMatch.content.replace(/\\/g, '\\textbackslash{}').replace(/{/g, '\\{').replace(/}/g, '\\}')
        parts.push(
          <BlockMath key={`block-${key}-${blockMatch.start}`} math={`\\text{${escapedContent}}`} />
        )
      }
      lastIndex = blockMatch.end
      key++
    }

    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex)
      parts.push(...renderInlineMath(remainingText, key))
    }

    // Если нет частей, оборачиваем весь текст в LaTeX
    if (parts.length === 0) {
      return [convertTextToLatex(text, 0)]
    }

    return parts.length > 0 ? parts : [text]
  }

  const convertTextToLatex = (text: string, startKey: number): JSX.Element => {
    if (!text.trim()) {
      return <span key={`text-${startKey}`}></span>
    }
    
    // Экранируем специальные символы LaTeX
    const escapeLatex = (str: string): string => {
      return str
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}')
        .replace(/#/g, '\\#')
        .replace(/\$/g, '\\$')
        .replace(/%/g, '\\%')
        .replace(/&/g, '\\&')
        .replace(/\^/g, '\\textasciicircum{}')
        .replace(/_/g, '\\_')
    }
    
    // Разбиваем на строки и обрабатываем каждую
    const lines = text.split('\n')
    const processedLines = lines
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => escapeLatex(line))
    
    if (processedLines.length === 0) {
      return <span key={`text-${startKey}`}></span>
    }
    
    // Для одной строки используем InlineMath, для нескольких - BlockMath
    // Объединяем строки через \text{} для каждой строки
    const latexContent = processedLines
      .map(line => `\\text{${line}}`)
      .join(' \\\\ ')
    
    try {
      if (processedLines.length === 1 && text.split('\n').length === 1) {
        return <InlineMath key={`latex-inline-${startKey}`} math={latexContent} />
      } else {
        return <BlockMath key={`latex-block-${startKey}`} math={latexContent} />
      }
    } catch (e) {
      // Если не удалось, возвращаем как есть
      return <span key={`text-${startKey}`}>{text}</span>
    }
  }

  const renderInlineMath = (text: string, startKey: number): (string | JSX.Element)[] => {
    if (!text) return []
    
    const parts: (string | JSX.Element)[] = []
    // Улучшенный regex для inline math - учитываем, что $ может быть частью формулы
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
        // Обычный текст оборачиваем в LaTeX \text{}
        const plainText = text.slice(lastIndex, mathMatch.start)
        if (plainText.trim()) {
          parts.push(convertTextToLatex(plainText, key))
          key++
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
        // Если LaTeX невалидный, оборачиваем в \text
        const escapedContent = mathMatch.content.replace(/\\/g, '\\textbackslash{}').replace(/{/g, '\\{').replace(/}/g, '\\}')
        parts.push(
          <InlineMath key={`inline-${key}-${mathMatch.start}`} math={`\\text{${escapedContent}}`} />
        )
      }
      lastIndex = mathMatch.end
      key++
    }

    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex)
      if (remainingText.trim()) {
        parts.push(convertTextToLatex(remainingText, key))
      }
    }

    return parts.length > 0 ? parts : [convertTextToLatex(text, startKey)]
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

        {(comparison || isGeneratingComparison) && (
          <div className="comparison-section">
            <h2>Сравнение ответов</h2>
            <div className="comparison-content">
              {isGeneratingComparison ? (
                <div className="loading-container">
                  <div className="loading-indicator">
                    Генерация сравнения...
                  </div>
                </div>
              ) : (
                <div className="comparison-text">
                  {comparison ? renderMath(comparison) : ''}
                </div>
              )}
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

