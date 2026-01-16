import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './Home'
import Chat from './Chat'
import ReasoningComparison from './ReasoningComparison'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/reasoning" element={<ReasoningComparison />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
