import { useState } from 'react'
import './App.css'
import Globe from './components/Globe'

function App() {
  const [_engine, setEngine] = useState<any>(null)

  const handleEngineReady = (globeEngine: any) => {
    setEngine(globeEngine)
  }

  const handleSatelliteUpdate = (_satellites: any[]) => {
  }

  const handleTimeUpdate = (_time: Date) => {
    // Optional: Handle time updates
  }

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <Globe
        style={{ width: '100%', height: '100%' }}
        onEngineReady={handleEngineReady}
        onSatelliteUpdate={handleSatelliteUpdate}
        onTimeUpdate={handleTimeUpdate}
      />
    </div>
  )
}

export default App
