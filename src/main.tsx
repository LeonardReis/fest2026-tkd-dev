import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import App from './App.tsx';
import { CourtView } from './components/views/CourtView.tsx';
import { PodiumView } from './components/views/PodiumView.tsx';
import './index.css';

// Componente Wrapper para injetar a rota na View de Quiosque
function CourtRouteWrapper() {
  const { sessionId } = useParams();
  
  if (!sessionId) {
    return <div className="min-h-screen bg-stone-950 flex items-center justify-center text-white font-black uppercase text-2xl">Sessão não informada</div>;
  }
  
  return <CourtView sessionId={sessionId} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/court/:sessionId" element={<CourtRouteWrapper />} />
        <Route path="/podiums" element={<PodiumView />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
