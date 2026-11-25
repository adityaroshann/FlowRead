import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/400-italic.css';
import '@fontsource/atkinson-hyperlegible-next/600.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import '@fontsource/atkinson-hyperlegible-next/700-italic.css';
import '@fontsource-variable/lexend';
import '@fontsource-variable/literata';
import '@fontsource-variable/literata/wght-italic.css';
import '@fontsource/opendyslexic/400.css';
import '@fontsource/opendyslexic/700.css';
import './styles/themes.css';
import './styles/ui.css';

import ErrorBoundary from './components/ErrorBoundary';
import RootEffects from './app/RootEffects.jsx';
import RouteFallback from './app/RouteFallback.jsx';
import LegacyReview from './app/LegacyReview.jsx';

const Home = lazy(() => import('./pages/Home.jsx'));
const Library = lazy(() => import('./pages/Library.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));
const Reader = lazy(() => import('./access/reader/Reader.jsx'));
const EditDoc = lazy(() => import('./pages/EditDoc.jsx'));
const AccessLanding = lazy(() => import('./access/staff/AccessLanding.jsx'));
const NewConversion = lazy(() => import('./access/staff/NewConversion.jsx'));
const ReviewPage = lazy(() => import('./access/staff/ReviewPage.jsx'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <RootEffects />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/library" element={<Library />} />
            <Route path="/read/:id" element={<Reader />} />
            <Route path="/read/:id/edit" element={<EditDoc />} />
            <Route path="/workspace" element={<AccessLanding />} />
            <Route path="/workspace/new" element={<NewConversion />} />
            <Route path="/workspace/review/:id" element={<ReviewPage />} />
            {/* Old paths */}
            <Route path="/reader" element={<Navigate to="/" replace />} />
            <Route path="/access" element={<Navigate to="/workspace" replace />} />
            <Route path="/access/new" element={<Navigate to="/workspace/new" replace />} />
            <Route path="/access/review/:id" element={<LegacyReview />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
