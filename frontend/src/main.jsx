import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './styles/themes.css';
import LandingPage from './pages/LandingPage';
import ReaderPage from './pages/ReaderPage';
import ErrorBoundary from './components/ErrorBoundary';
import AccessLanding from './access/staff/AccessLanding';
import NewConversion from './access/staff/NewConversion';
import ReviewPage from './access/staff/ReviewPage';
import StudentReader from './access/reader/StudentReader';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/reader" element={<ReaderPage />} />
          <Route path="/access" element={<AccessLanding />} />
          <Route path="/access/new" element={<NewConversion />} />
          <Route path="/access/review/:id" element={<ReviewPage />} />
          <Route path="/read/:id" element={<StudentReader />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
