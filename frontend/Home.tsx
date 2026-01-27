import { Link } from 'react-router-dom'
import './Home.css'

function Home() {
  return (
    <div className="home">
      <div className="home-container">
        <h1 className="home-title">DeepSeek Web Client</h1>
        <p className="home-subtitle">Выберите страницу для работы:</p>
        <div className="home-links">
          <Link to="/chat" className="home-link">
            <div className="home-link-card">
              <h2>Генератор промптов</h2>
              <p>Создание точных и структурированных промптов для Cursor AI</p>
            </div>
          </Link>
          <Link to="/reasoning" className="home-link">
            <div className="home-link-card">
              <h2>Сравнение способов рассуждения</h2>
              <p>Сравнение разных методов решения задач с помощью ИИ</p>
            </div>
          </Link>
          <Link to="/system-prompt" className="home-link">
            <div className="home-link-card">
              <h2>День 5. System Prompt</h2>
              <p>Тестирование и сравнение реакций агента при изменении System Prompt в ходе диалога</p>
            </div>
          </Link>
          <Link to="/temperature" className="home-link">
            <div className="home-link-card">
              <h2>Сравнение температур</h2>
              <p>Сравнение результатов с разными значениями температуры (0, 0.7, 1.2) по точности, креативности и разнообразию</p>
            </div>
          </Link>
          <Link to="/model-comparison" className="home-link">
            <div className="home-link-card">
              <h2>Сравнение моделей</h2>
              <p>Сравнение ответов от DeepSeek и Llama 3.2-1B на один и тот же запрос</p>
            </div>
          </Link>
          <Link to="/token-comparison" className="home-link">
            <div className="home-link-card">
              <h2>Подсчёт токенов</h2>
              <p>Подсчёт токенов для запросов разной длины: короткий, длинный и превышающий лимит модели</p>
            </div>
          </Link>
          <Link to="/compression" className="home-link">
            <div className="home-link-card">
              <h2>Сжатие истории диалога</h2>
              <p>Тестирование механизма сжатия истории: каждые 10 сообщений создаётся суммаризация для экономии токенов</p>
            </div>
          </Link>
          <Link to="/mcp-server" className="home-link">
            <div className="home-link-card">
              <h2>MCP Server Tools</h2>
              <p>Подключение к MCP серверу и просмотр доступных инструментов</p>
            </div>
          </Link>
          <Link to="/weather-chat" className="home-link">
            <div className="home-link-card">
              <h2>🌤️ Чат о погоде</h2>
              <p>Узнай текущую погоду и прогноз в любом городе через MCP сервер</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Home

