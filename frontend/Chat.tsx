import { useState, useRef, useEffect } from 'react'
import './App.css'
import { SYSTEM_PROMPT } from './constants'
import { Link } from 'react-router-dom'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isTyping?: boolean
  copied?: boolean
}

interface ChatResponse {
  response: string
}

function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Привет! Опиши задачу — я помогу сформулировать идеальный промпт для Cursor.',
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
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

  const handleCopy = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, copied: true } : msg
        )
      )
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, copied: false } : msg
          )
        )
      }, 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
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
      const recentMessages = messages
        .filter(msg => msg.id !== 'welcome')
        .slice(-10)
        .map(msg => ({
          role: msg.role,
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
          system_prompt: SYSTEM_PROMPT,
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

  return (
    <div className="app">
      <div className="nav-bar">
        <Link to="/" className="nav-link">← На главную</Link>
      </div>
      <div className="chat-container">
        <div className="messages">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.role === 'user' ? 'message-user' : 'message-assistant'}`}
            >
              <div className="message-content">{message.content}</div>
              {message.role === 'assistant' && 
               !message.isTyping && 
               message.content !== '...' && 
               message.id !== 'welcome' && (
                <button
                  className="copy-button"
                  onClick={() => handleCopy(message.id, message.content)}
                  title="Копировать промпт"
                  disabled={message.copied}
                >
                  {message.copied ? 'Скопировано!' : 'Копировать'}
                </button>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="input-panel">
        <form onSubmit={handleSubmit} className="input-form">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Опиши задачу... (Ctrl+Enter для отправки)"
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

export default Chat

