import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { InlineMath, BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import './ModelComparison.css'
import { LATEX_INSTRUCTION } from './constants'

interface ModelResult {
  id: string
  model: string
  response: string
  isLoading: boolean
  error?: string
  progress?: number
}

function ModelComparison() {
  const [prompt, setPrompt] = useState('')
  const [results, setResults] = useState<ModelResult[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const currentRequestIdRef = useRef<string | null>(null)

  const callDeepSeekStream = async (
    resultId: string,
    prompt: string,
    requestId: string,
    systemPrompt?: string
  ): Promise<void> => {
    try {
      if (currentRequestIdRef.current !== requestId) {
        return
      }
      
      const requestBody: any = {
        prompt: prompt + LATEX_INSTRUCTION,
        max_tokens: 1000,
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

      if (currentRequestIdRef.current !== requestId) return
      
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
                if (currentRequestIdRef.current !== requestId) return
                
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

      if (currentRequestIdRef.current !== requestId) return
      
      setResults((prev) =>
        prev.map((r) =>
          r.id === resultId
            ? { ...r, isLoading: false, progress: 100, response: fullResponse }
            : r
        )
      )
    } catch (error) {
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

  const callLlamaStream = async (
    resultId: string,
    prompt: string,
    requestId: string,
    systemPrompt?: string
  ): Promise<void> => {
    try {
      if (currentRequestIdRef.current !== requestId) {
        return
      }
      
      const requestBody: any = {
        prompt: prompt + LATEX_INSTRUCTION,
        max_tokens: 1000,
      }
      if (systemPrompt) {
        requestBody.system_prompt = systemPrompt
      }

      const res = await fetch('/api/llama/stream', {
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

      if (currentRequestIdRef.current !== requestId) return
      
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
                if (currentRequestIdRef.current !== requestId) return
                
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

      if (currentRequestIdRef.current !== requestId) return
      
      setResults((prev) =>
        prev.map((r) =>
          r.id === resultId
            ? { ...r, isLoading: false, progress: 100, response: fullResponse }
            : r
        )
      )
    } catch (error) {
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    if (!prompt.trim() || isProcessing) return

    const requestId = Date.now().toString()
    currentRequestIdRef.current = requestId

    setIsProcessing(true)
    setResults([])

    await new Promise((resolve) => setTimeout(resolve, 50))

    if (currentRequestIdRef.current !== requestId) return

    const initialResults: ModelResult[] = [
      {
        id: 'deepseek',
        model: 'DeepSeek',
        response: '',
        isLoading: true,
      },
      {
        id: 'llama',
        model: 'Llama 3.2-1B',
        response: '',
        isLoading: true,
      },
    ]

    setResults(initialResults)

    // Запускаем оба запроса параллельно
    await Promise.all([
      callDeepSeekStream('deepseek', prompt, requestId),
      callLlamaStream('llama', prompt, requestId),
    ])

    if (currentRequestIdRef.current === requestId) {
      setIsProcessing(false)
    }
  }

  const renderMath = (text: string) => {
    if (!text) return ['']
    
    const parts: (string | JSX.Element)[] = []
    let lastIndex = 0
    let key = 0

    // Обработка block math ($$...$$)
    const blockMathRegex = /\$\$([\s\S]*?)\$\$/g
    let match
    const blockMatches: Array<{start: number, end: number, content: string}> = []

    blockMathRegex.lastIndex = 0
    while ((match = blockMathRegex.exec(text)) !== null) {
      blockMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1]
      })
    }

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

    const inlineMathRegex = /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g
    
    const inlineMatches: Array<{start: number, end: number, content: string}> = []
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
        })
      }
    }

    for (const mathMatch of inlineMatches) {
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
    <div className="model-comparison-page">
      <div className="nav-bar">
        <Link to="/" className="nav-link">← На главную</Link>
      </div>
      <div className="model-comparison-container">
        <div className="model-comparison-header">
          <h1>Сравнение моделей: DeepSeek vs Llama 3.2-1B</h1>
          <p className="model-comparison-description">
            Введите запрос для сравнения ответов от DeepSeek и Llama 3.2-1B.
            Поддерживается отображение математических формул в формате LaTeX.
          </p>
        </div>

        <div className="prompt-input-section">
          <form onSubmit={handleSubmit} className="prompt-form">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Введите запрос для сравнения (например: Объясни, что такое квантовая запутанность)"
              rows={4}
              disabled={isProcessing}
              className="prompt-textarea"
            />
            <button
              type="submit"
              disabled={isProcessing || !prompt.trim()}
              className="prompt-submit-button"
            >
              {isProcessing ? 'Обработка...' : 'Сравнить модели'}
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
                    <h3>{result.model}</h3>
                    <span className={`model-badge ${result.id === 'deepseek' ? 'deepseek-badge' : 'llama-badge'}`}>
                      {result.id === 'deepseek' ? 'DeepSeek' : 'Llama 3.2-1B'}
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
            <h3>Примеры запросов:</h3>
            <ul className="example-list">
              <li onClick={() => setPrompt('Объясни, что такое квантовая запутанность')}>
                Объясни, что такое квантовая запутанность
              </li>
              <li onClick={() => setPrompt('Решите уравнение: $x^2 + 5x + 6 = 0$')}>
                Решите уравнение: $x^2 + 5x + 6 = 0$
              </li>
              <li onClick={() => setPrompt('Напиши краткое эссе о важности искусственного интеллекта')}>
                Напиши краткое эссе о важности искусственного интеллекта
              </li>
              <li onClick={() => setPrompt('Что такое фотосинтез и как он работает?')}>
                Что такое фотосинтез и как он работает?
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export default ModelComparison

