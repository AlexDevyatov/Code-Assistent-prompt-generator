import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './Home'
import Chat from './Chat'
import ReasoningComparison from './ReasoningComparison'
import SystemPromptTest from './SystemPromptTest'
import TemperatureComparison from './TemperatureComparison'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/reasoning" element={<ReasoningComparison />} />
        <Route path="/system-prompt" element={<SystemPromptTest />} />
        <Route path="/temperature" element={<TemperatureComparison />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
