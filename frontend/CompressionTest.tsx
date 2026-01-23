import { useState, useRef, useEffect } from 'react'
import './App.css'
import './CompressionTest.css'
import { Link } from 'react-router-dom'
import MarkdownContent from './MarkdownContent'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  isTyping?: boolean
  isSummary?: boolean
}

interface CompressionInfo {
  compressed: boolean
  original_count: number
  compressed_count: number
  summary?: string
  tokens_before_compression?: number
  tokens_after_compression?: number
  tokens_saved?: number
}

interface Usage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

interface ChatResponse {
  response: string
  compression_applied?: boolean
  original_message_count?: number
  compressed_message_count?: number
  summary?: string
  tokens_before_compression?: number
  tokens_after_compression?: number
  tokens_saved?: number
  usage?: Usage
}

function CompressionTest() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Привет! Это тест сжатия истории диалога. Каждые 5 сообщений история будет автоматически сжиматься через суммаризацию. Начните диалог!',
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [compressionInfo, setCompressionInfo] = useState<CompressionInfo | null>(null)
  const [totalTokens, setTotalTokens] = useState<Usage>({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 })
  const [messageCount, setMessageCount] = useState(0)
  const [compressedMessageIds, setCompressedMessageIds] = useState<Set<string>>(new Set())
  const [summaryMessage, setSummaryMessage] = useState<Message | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  const typeMessage = (messageId: string, fullText: string) => {
    let currentIndex = 0
    const delay = 5

    const typeInterval = setInterval(() => {
      if (currentIndex < fullText.length) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, content: fullText.slice(0, currentIndex + 1), isTyping: true }
              : msg
          )
        )
        currentIndex++
        scrollToBottom()
      } else {
        clearInterval(typeInterval)
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, isTyping: false } : msg
          )
        )
      }
    }, delay)

    return () => clearInterval(typeInterval)
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    }

    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '...',
      isTyping: true,
    }

    setMessages((prev) => [...prev, userMessage, loadingMessage])
    setInput('')
    setIsLoading(true)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    scrollToBottom()

    try {
      // Формируем историю сообщений для отправки
      // Исключаем welcome, loading сообщения и уже сжатые сообщения
      const visibleMessages = messages.filter(
        msg => msg.id !== 'welcome' && !msg.isTyping && !compressedMessageIds.has(msg.id)
      )
      
      // Если есть summary, добавляем его первым
      const historyMessages: Array<{role: string, content: string}> = []
      if (summaryMessage) {
        historyMessages.push({
          role: summaryMessage.role,
          content: summaryMessage.content
        })
      }
      
      // Добавляем видимые сообщения
      visibleMessages.forEach(msg => {
        historyMessages.push({
          role: msg.role,
          content: msg.content
        })
      })
      
      // Добавляем текущее сообщение пользователя
      historyMessages.push({
        role: 'user',
        content: userMessage.content
      })

      const res = await fetch('/api/compression/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: historyMessages,
          temperature: 0.7
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `HTTP error! status: ${res.status}`)
      }

      const data: ChatResponse = await res.json()
      
      // Обновляем информацию о сжатии
      if (data.compression_applied && data.summary) {
        setCompressionInfo({
          compressed: true,
          original_count: data.original_message_count || 0,
          compressed_count: data.compressed_message_count || 0,
          summary: data.summary,
          tokens_before_compression: data.tokens_before_compression,
          tokens_after_compression: data.tokens_after_compression,
          tokens_saved: data.tokens_saved
        })

        // Создаем summary сообщение
        const newSummaryMessage: Message = {
          id: `summary-${Date.now()}`,
          role: 'system',
          content: data.summary,
          isSummary: true
        }
        setSummaryMessage(newSummaryMessage)

        // Помечаем старые сообщения как сжатые
        setMessages((prev) => {
          // Находим видимые сообщения (не welcome, не typing, не уже сжатые)
          const visibleMessages = prev.filter(
            msg => msg.id !== 'welcome' && !msg.isTyping && !compressedMessageIds.has(msg.id)
          )
          
          // Определяем, сколько сообщений нужно сжать
          // original_count - это количество сообщений до сжатия, compressed_count - после
          // Разница показывает, сколько сообщений было заменено на summary
          const messagesToCompressCount = (data.original_message_count || 0) - (data.compressed_message_count || 0)
          const messagesToCompress = visibleMessages.slice(0, messagesToCompressCount)
          const idsToCompress = messagesToCompress.map(msg => msg.id)
          
          // Обновляем множество сжатых ID
          setCompressedMessageIds(prevIds => new Set([...prevIds, ...idsToCompress]))
          
          // Удаляем старый summary, если был, и добавляем новый
          const withoutOldSummary = prev.filter(msg => !msg.isSummary)
          
          // Вставляем новый summary после welcome
          const welcomeIndex = withoutOldSummary.findIndex(msg => msg.id === 'welcome')
          if (welcomeIndex >= 0) {
            return [
              ...withoutOldSummary.slice(0, welcomeIndex + 1),
              newSummaryMessage,
              ...withoutOldSummary.slice(welcomeIndex + 1)
            ]
          }
          return [newSummaryMessage, ...withoutOldSummary]
        })
      } else {
        setCompressionInfo(null)
      }

      // Обновляем статистику токенов
      if (data.usage) {
        setTotalTokens(prev => ({
          prompt_tokens: prev.prompt_tokens + data.usage!.prompt_tokens,
          completion_tokens: prev.completion_tokens + data.usage!.completion_tokens,
          total_tokens: prev.total_tokens + data.usage!.total_tokens
        }))
      }

      // Обновляем счетчик сообщений (включая сжатые)
      const allMessagesCount = messages.filter(msg => msg.id !== 'welcome' && !msg.isTyping).length + 1
      setMessageCount(allMessagesCount)

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingMessage.id
            ? { ...msg, content: '', isTyping: true }
            : msg
        )
      )

      typeMessage(loadingMessage.id, data.response)
    } catch (err) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingMessage.id
            ? {
                ...msg,
                content: `Ошибка: ${err instanceof Error ? err.message : 'Произошла ошибка'}`,
                isTyping: false,
              }
            : msg
        )
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Привет! Это тест сжатия истории диалога. Каждые 5 сообщений история будет автоматически сжиматься через суммаризацию. Начните диалог!',
      },
    ])
    setCompressionInfo(null)
    setTotalTokens({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 })
    setMessageCount(0)
    setCompressedMessageIds(new Set())
    setSummaryMessage(null)
  }

  return (
    <div className="app">
      <div className="nav-bar">
        <Link to="/" className="nav-link">← На главную</Link>
      </div>
      
      <div className="compression-stats">
        <div className="stat-item">
          <span className="stat-label">Сообщений в истории:</span>
          <span className="stat-value">{messageCount}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Всего токенов:</span>
          <span className="stat-value">{totalTokens.total_tokens.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Prompt токенов:</span>
          <span className="stat-value">{totalTokens.prompt_tokens.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Completion токенов:</span>
          <span className="stat-value">{totalTokens.completion_tokens.toLocaleString()}</span>
        </div>
        {compressionInfo && compressionInfo.compressed && (
          <div className="stat-item compression-indicator">
            <span className="stat-label">Сжатие применено:</span>
            <span className="stat-value">{compressionInfo.original_count} → {compressionInfo.compressed_count}</span>
          </div>
        )}
        <button className="clear-button" onClick={handleClear}>Очистить</button>
      </div>

      <div className="compression-layout">
        <div className="chat-container">
          <div className="messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message ${
                  message.role === 'user' 
                    ? 'message-user' 
                    : message.role === 'system' || message.isSummary
                    ? 'message-system'
                    : 'message-assistant'
                }`}
              >
                <div className="message-content">
                  <MarkdownContent content={message.content} />
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {compressionInfo && compressionInfo.compressed && compressionInfo.summary && (
          <div className="compression-sidebar">
            <div className="compression-sidebar-header">
              <strong>Суммаризация</strong>
              <span className="compression-count">{compressionInfo.original_count} сообщений сжато</span>
            </div>
            {compressionInfo.tokens_before_compression !== undefined && 
             compressionInfo.tokens_after_compression !== undefined && (
              <div className="compression-tokens-comparison">
                <div className="tokens-comparison-item">
                  <span className="tokens-label">Токенов до:</span>
                  <span className="tokens-value">{compressionInfo.tokens_before_compression.toLocaleString()}</span>
                </div>
                <div className="tokens-comparison-item">
                  <span className="tokens-label">Токенов после:</span>
                  <span className="tokens-value tokens-after">{compressionInfo.tokens_after_compression.toLocaleString()}</span>
                </div>
                {compressionInfo.tokens_saved !== undefined && compressionInfo.tokens_saved > 0 && (
                  <div className="tokens-comparison-item tokens-saved">
                    <span className="tokens-label">Сэкономлено:</span>
                    <span className="tokens-value">{compressionInfo.tokens_saved.toLocaleString()} ({Math.round((compressionInfo.tokens_saved / compressionInfo.tokens_before_compression) * 100)}%)</span>
                  </div>
                )}
              </div>
            )}
            <div className="compression-sidebar-content">
              <MarkdownContent content={compressionInfo.summary} />
            </div>
          </div>
        )}
      </div>

      <div className="input-panel">
        <form onSubmit={handleSubmit} className="input-form">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите сообщение... (Ctrl+Enter для отправки)"
            rows={1}
            disabled={isLoading}
            className="input-textarea"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="send-button"
          >
            Отправить
          </button>
        </form>
      </div>
    </div>
  )
}

export default CompressionTest

