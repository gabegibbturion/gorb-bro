import React, { useEffect, useRef, useState } from "react";

interface ProfilerProps {
    style?: React.CSSProperties;
    className?: string;
    showFPS?: boolean;
    showMemory?: boolean;
    showRenderTime?: boolean;
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

interface PerformanceData {
    fps: number;
    memory: number;
    renderTime: number;
    frameCount: number;
}

const Profiler: React.FC<ProfilerProps> = ({ style, className, showFPS = true, showMemory = true, showRenderTime = true, position = "top-right" }) => {
    const [performanceData, setPerformanceData] = useState<PerformanceData>({
        fps: 0,
        memory: 0,
        renderTime: 0,
        frameCount: 0,
    });

    const frameCountRef = useRef(0);
    const lastTimeRef = useRef(performance.now());
    const fpsHistoryRef = useRef<number[]>([]);
    const renderStartRef = useRef(0);

    useEffect(() => {
        const updatePerformance = () => {
            const now = performance.now();
            const deltaTime = now - lastTimeRef.current;

            frameCountRef.current++;

            // Calculate FPS every 100ms
            if (deltaTime >= 100) {
                const fps = Math.round((frameCountRef.current * 1000) / deltaTime);

                // Smooth FPS calculation using moving average
                fpsHistoryRef.current.push(fps);
                if (fpsHistoryRef.current.length > 10) {
                    fpsHistoryRef.current.shift();
                }

                const avgFps = Math.round(fpsHistoryRef.current.reduce((sum, f) => sum + f, 0) / fpsHistoryRef.current.length);

                // Get memory usage (if available)
                const memory = (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024) : 0;

                setPerformanceData((prev) => ({
                    ...prev,
                    fps: avgFps,
                    memory,
                    frameCount: frameCountRef.current,
                }));

                frameCountRef.current = 0;
                lastTimeRef.current = now;
            }

            requestAnimationFrame(updatePerformance);
        };

        const rafId = requestAnimationFrame(updatePerformance);

        return () => {
            cancelAnimationFrame(rafId);
        };
    }, []);

    const getPositionStyles = () => {
        const baseStyles: React.CSSProperties = {
            position: "fixed",
            zIndex: 1000,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "10px",
            borderRadius: "5px",
            fontFamily: "monospace",
            fontSize: "12px",
            lineHeight: "1.4",
            minWidth: "150px",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
        };

        switch (position) {
            case "top-left":
                return { ...baseStyles, top: "10px", left: "10px" };
            case "top-right":
                return { ...baseStyles, top: "10px", right: "10px" };
            case "bottom-left":
                return { ...baseStyles, bottom: "10px", left: "10px" };
            case "bottom-right":
                return { ...baseStyles, bottom: "10px", right: "10px" };
            default:
                return { ...baseStyles, top: "10px", right: "10px" };
        }
    };

    const getFPSColor = (fps: number) => {
        if (fps >= 55) return "#00ff00"; // Green
        if (fps >= 30) return "#ffff00"; // Yellow
        return "#ff0000"; // Red
    };

    const getMemoryColor = (memory: number) => {
        if (memory < 50) return "#00ff00"; // Green
        if (memory < 100) return "#ffff00"; // Yellow
        return "#ff0000"; // Red
    };

    return (
        <div
            className={className}
            style={{
                ...getPositionStyles(),
                ...style,
            }}
        >
            {showFPS && <div style={{ color: getFPSColor(performanceData.fps) }}>FPS: {performanceData.fps}</div>}

            {showMemory && performanceData.memory > 0 && <div style={{ color: getMemoryColor(performanceData.memory) }}>Memory: {performanceData.memory}MB</div>}

            {showRenderTime && <div style={{ color: "#00ffff" }}>Frames: {performanceData.frameCount}</div>}

            <div style={{ color: "#888", fontSize: "10px", marginTop: "5px" }}>{new Date().toLocaleTimeString()}</div>
        </div>
    );
};

export default Profiler;
