import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Space from './pages/Space.jsx';

export default function App() {
  return (
    <BrowserRouter basename="/dropvault">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:slug" element={<Space />} />
      </Routes>
    </BrowserRouter>
  );
}
