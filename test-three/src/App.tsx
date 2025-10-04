import { Route, Routes } from 'react-router-dom';
import './App.css';
import Navigation from './components/Navigation';
import GlobePage from './pages/GlobePage';
import HomePage from './pages/HomePage';
import ParticlesPage from './pages/ParticlesPage';

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, position: 'relative' }}>
      <Navigation />

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/globe" element={<GlobePage />} />
        <Route path="/particles" element={<ParticlesPage />} />
      </Routes>
    </div>
  );
}

export default App
