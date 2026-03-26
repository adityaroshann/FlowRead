import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './styles/themes.css';
import LandingPage from './pages/LandingPage';
import ReaderPage from './pages/ReaderPage';
import ErrorBoundary from './components/ErrorBoundary';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/reader" element={<ReaderPage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
