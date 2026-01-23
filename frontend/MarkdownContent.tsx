import ReactMarkdown from 'react-markdown'
import './MarkdownContent.css'

interface MarkdownContentProps {
  content: string
  className?: string
}

function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        components={{
          // Стилизация заголовков
          h1: ({ node, ...props }) => <h1 className="markdown-h1" {...props} />,
          h2: ({ node, ...props }) => <h2 className="markdown-h2" {...props} />,
          h3: ({ node, ...props }) => <h3 className="markdown-h3" {...props} />,
          h4: ({ node, ...props }) => <h4 className="markdown-h4" {...props} />,
          // Стилизация списков
          ul: ({ node, ...props }) => <ul className="markdown-ul" {...props} />,
          ol: ({ node, ...props }) => <ol className="markdown-ol" {...props} />,
          li: ({ node, ...props }) => <li className="markdown-li" {...props} />,
          // Стилизация текста
          p: ({ node, ...props }) => <p className="markdown-p" {...props} />,
          strong: ({ node, ...props }) => <strong className="markdown-strong" {...props} />,
          em: ({ node, ...props }) => <em className="markdown-em" {...props} />,
          // Стилизация кода
          code: ({ node, className, ...props }: any) => {
            const isInline = !className
            return isInline ? (
              <code className="markdown-code-inline" {...props} />
            ) : (
              <code className="markdown-code-block" {...props} />
            )
          },
          pre: ({ node, ...props }) => <pre className="markdown-pre" {...props} />,
          // Стилизация ссылок
          a: ({ node, ...props }) => <a className="markdown-a" {...props} />,
          // Стилизация блоков
          blockquote: ({ node, ...props }) => <blockquote className="markdown-blockquote" {...props} />,
          // Горизонтальная линия
          hr: ({ node, ...props }) => <hr className="markdown-hr" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownContent

