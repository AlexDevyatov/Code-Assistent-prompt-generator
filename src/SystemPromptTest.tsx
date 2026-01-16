import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './SystemPromptTest.css'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system-change'
  content: string
  systemPrompt?: string
  isTyping?: boolean
}

interface ChatResponse {
  response: string
}

function SystemPromptTest() {
  const [systemPrompt, setSystemPrompt] = useState('Ты — полезный ассистент. Отвечай кратко и по делу.')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState(systemPrompt)
  const [systemPromptChanged, setSystemPromptChanged] = useState(false)
  const [showSystemPromptModal, setShowSystemPromptModal] = useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const systemPromptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const handleScroll = () => {
      if (messagesContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
        setShowScrollToBottom(!isNearBottom && messages.length > 0)
      }
    }

    const messagesContainer = messagesContainerRef.current
    if (messagesContainer) {
      messagesContainer.addEventListener('scroll', handleScroll)
      return () => messagesContainer.removeEventListener('scroll', handleScroll)
    }
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  useEffect(() => {
    if (systemPromptTextareaRef.current) {
      systemPromptTextareaRef.current.style.height = 'auto'
      systemPromptTextareaRef.current.style.height = `${Math.min(systemPromptTextareaRef.current.scrollHeight, 200)}px`
    }
  }, [systemPrompt])

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

  const handleChangeSystemPrompt = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (systemPrompt.trim() === currentSystemPrompt.trim()) {
      return
    }

    const systemChangeMessage: Message = {
      id: `system-change-${Date.now()}`,
      role: 'system-change',
      content: `System Prompt изменён`,
      systemPrompt: systemPrompt,
    }

    setMessages((prev) => [...prev, systemChangeMessage])
    setCurrentSystemPrompt(systemPrompt)
    setSystemPromptChanged(true)
    scrollToBottom()
  }

  const handleResetSystemPrompt = () => {
    setSystemPrompt(currentSystemPrompt)
  }

  const handleCopySystemPrompt = async () => {
    try {
      await navigator.clipboard.writeText(currentSystemPrompt)
      alert('System Prompt скопирован в буфер обмена!')
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleScrollToBottom = () => {
    scrollToBottom()
    setShowScrollToBottom(false)
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    }

    const loadingMessage: Message = {
      id: `assistant-${Date.now()}`,
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
      // Собираем историю сообщений для отправки
      const recentMessages = messages
        .filter(msg => msg.role !== 'system-change')
        .slice(-10)
        .map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        }))
      
      const messagesHistory = [
        ...recentMessages,
        { role: 'user', content: userMessage.content }
      ]
      
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          system_prompt: currentSystemPrompt,
          messages: messagesHistory
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `HTTP error! status: ${res.status}`)
      }

      const data: ChatResponse = await res.json()
      
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

  const handleSystemPromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      handleChangeSystemPrompt()
    }
  }

  const handleSystemPromptSubmit = (e: React.FormEvent) => {
    handleChangeSystemPrompt(e)
  }

  const clearChat = () => {
    setMessages([])
    setSystemPromptChanged(false)
    setCurrentSystemPrompt(systemPrompt)
  }

  const findLastSystemChangeIndex = () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'system-change') {
        return i
      }
    }
    return -1
  }

  const lastSystemChangeIndex = findLastSystemChangeIndex()

  return (
    <div className="system-prompt-test">
      <Link to="/" className="back-button">← Назад</Link>
      
      <button 
        className="system-prompt-trigger-button"
        onClick={() => setShowSystemPromptModal(true)}
        title="Открыть редактор System Prompt"
      >
        ⚙️ System Prompt
      </button>

      {showSystemPromptModal && (
        <div className="modal-overlay" onClick={() => setShowSystemPromptModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⚙️ System Prompt</h2>
              <button 
                className="modal-close-button"
                onClick={() => setShowSystemPromptModal(false)}
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSystemPromptSubmit} className="system-prompt-form">
              <div className="system-prompt-editor">
                <label htmlFor="system-prompt-input" className="system-prompt-label">
                  Введите новый System Prompt:
                </label>
                <textarea
                  id="system-prompt-input"
                  ref={systemPromptTextareaRef}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  onKeyDown={handleSystemPromptKeyDown}
                  placeholder="Например: Ты — полезный ассистент. Отвечай кратко и по делу."
                  rows={6}
                  disabled={isLoading}
                  className="system-prompt-textarea"
                />
                <div className="system-prompt-form-actions">
                  <button
                    type="submit"
                    disabled={systemPrompt.trim() === currentSystemPrompt.trim() || isLoading}
                    className="change-prompt-button"
                  >
                    ✅ Применить (Ctrl+Enter)
                  </button>
                  <button
                    type="button"
                    onClick={handleResetSystemPrompt}
                    disabled={systemPrompt.trim() === currentSystemPrompt.trim() || isLoading}
                    className="reset-prompt-button"
                    title="Сбросить к текущему значению"
                  >
                    ↺ Сбросить
                  </button>
                </div>
              </div>
              <div className="current-prompt-info">
                <div className="current-prompt-header">
                  <span className="current-prompt-label">Текущий активный System Prompt:</span>
                  <button
                    type="button"
                    onClick={handleCopySystemPrompt}
                    className="copy-prompt-button"
                    title="Копировать в буфер обмена"
                  >
                    📋 Копировать
                  </button>
                </div>
                <div className="current-prompt-text">{currentSystemPrompt}</div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="system-prompt-test-container" ref={containerRef}>
        <div className="system-prompt-test-header">
          <h1>День 5. System Prompt</h1>
          <p className="system-prompt-test-description">
            Задайте агенту systemPrompt и сделайте несколько шагов в диалоге. 
            В ходе работы поменяйте systemPrompt и продолжите диалог. 
            Сравните, как меняется реакция агента с изменением systemPrompt.
          </p>
        </div>

        {systemPromptChanged && lastSystemChangeIndex >= 0 && (
          <div className="comparison-section">
            <div className="comparison-divider">
              <span className="comparison-label">Реакции ДО изменения System Prompt</span>
            </div>
          </div>
        )}

        <div className="chat-container">
          <div className="chat-header">
            <h2>Диалог с агентом</h2>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                className="clear-chat-button"
                disabled={isLoading}
              >
                Очистить диалог
              </button>
            )}
          </div>
          
          <div className="messages" ref={messagesContainerRef}>
            {messages.length === 0 ? (
              <div className="welcome-message">
                <p>Начните диалог с агентом. Задайте вопрос или отправьте сообщение.</p>
                <p className="welcome-hint">Вы можете изменить System Prompt в любой момент диалога.</p>
              </div>
            ) : (
              messages.map((message, index) => {
                const isAfterSystemChange = systemPromptChanged && index > lastSystemChangeIndex && message.role !== 'system-change'
                
                return (
                  <div key={message.id}>
                    {message.role === 'system-change' && (
                      <div className="comparison-divider">
                        <span className="comparison-label">Реакции ПОСЛЕ изменения System Prompt</span>
                        <div className="system-change-notice">
                          <strong>System Prompt изменён на:</strong>
                          <div className="system-change-prompt">{message.systemPrompt}</div>
                        </div>
                      </div>
                    )}
                    <div
                      className={`message ${
                        message.role === 'user' 
                          ? 'message-user' 
                          : message.role === 'system-change'
                          ? 'message-system-change'
                          : 'message-assistant'
                      } ${
                        isAfterSystemChange ? 'message-after-change' : ''
                      }`}
                    >
                      <div className="message-content">
                        {message.content}
                        {message.isTyping && <span className="typing-cursor">▊</span>}
                      </div>
                      {isAfterSystemChange && (
                        <div className="change-indicator" title="Сообщение после изменения System Prompt">
                          Новый
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {showScrollToBottom && (
            <button
              type="button"
              onClick={handleScrollToBottom}
              className="scroll-to-bottom-button"
              title="Прокрутить вниз"
            >
              ⬇ Прокрутить вниз
            </button>
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
              {isLoading ? 'Отправка...' : 'Отправить'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default SystemPromptTest

