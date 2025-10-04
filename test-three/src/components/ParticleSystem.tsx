import React, { useEffect, useRef } from 'react';
import { ParticleEngine } from '../engine/ParticleEngine';

interface ParticleSystemProps {
    style?: React.CSSProperties;
    particleCount?: number;
    autoRotate?: boolean;
    rotationSpeed?: number;
    onEngineReady?: (engine: ParticleEngine) => void;
}

const ParticleSystem: React.FC<ParticleSystemProps> = ({
    style,
    particleCount = 100000,
    autoRotate = false,
    rotationSpeed = 0.001,
    onEngineReady
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<ParticleEngine | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Initialize the particle engine
        const engine = new ParticleEngine({
            container: containerRef.current,
            enableControls: true,
            particleCount,
            autoRotate,
            rotationSpeed
        });

        // Set up event handlers
        engine.onEngineReadyCallback(() => {
            if (onEngineReady) {
                onEngineReady(engine);
            }
        });

        engineRef.current = engine;
        engine.start();

        // Cleanup
        return () => {
            if (engineRef.current) {
                engineRef.current.stop();
                engineRef.current.dispose();
                engineRef.current = null;
            }
        };
    }, [particleCount, autoRotate, rotationSpeed, onEngineReady]);

    return <div ref={containerRef} style={style} />;
};

export default ParticleSystem;
