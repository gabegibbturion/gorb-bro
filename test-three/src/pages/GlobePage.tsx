import React, { useState } from 'react';
import Globe from '../components/Globe';
import Profiler from '../components/Profiler';

const GlobePage: React.FC = () => {
    const [_engine, setEngine] = useState<any>(null);

    const handleEngineReady = (globeEngine: any) => {
        setEngine(globeEngine);
    };

    const handleSatelliteUpdate = (_satellites: any[]) => {
        // Handle satellite updates
    };

    const handleTimeUpdate = (_time: Date) => {
        // Handle time updates
    };

    return (
        <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, position: 'relative' }}>
            <Globe
                style={{ width: '100%', height: '100%' }}
                onEngineReady={handleEngineReady}
                onSatelliteUpdate={handleSatelliteUpdate}
                onTimeUpdate={handleTimeUpdate}
            />

            <Profiler
                position="top-right"
                showFPS={true}
                showMemory={true}
                showRenderTime={true}
            />
        </div>
    );
};

export default GlobePage;
