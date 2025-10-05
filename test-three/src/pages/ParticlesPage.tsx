import React from "react";
import ParticleSystem from "../components/ParticleSystem";
import Profiler from "../components/Profiler";

const ParticlesPage: React.FC = () => {
    return (
        <div style={{ width: "100vw", height: "100vh", margin: 0, padding: 0, position: "relative" }}>
            <ParticleSystem style={{ width: "100%", height: "100%" }} />

            <Profiler position="top-right" showFPS={true} showMemory={true} showRenderTime={true} />

            {/* Controls Info */}
            <div
                style={{
                    position: "fixed",
                    bottom: "20px",
                    left: "20px",
                    zIndex: 1000,
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    color: "white",
                    padding: "15px",
                    borderRadius: "10px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    lineHeight: "1.4",
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    maxWidth: "250px",
                }}
            >
                <div style={{ fontWeight: "bold", marginBottom: "8px", color: "#00ffff" }}>🎮 Camera Controls</div>
                <div>
                    🖱️ <strong>Left Click + Drag:</strong> Rotate
                </div>
                <div>
                    🖱️ <strong>Right Click + Drag:</strong> Pan
                </div>
                <div>
                    🖱️ <strong>Scroll:</strong> Zoom In/Out
                </div>
                <div>
                    ⌨️ <strong>Double Click:</strong> Reset View
                </div>
                <div style={{ marginTop: "8px", fontSize: "10px", color: "#888" }}>1M particles • Interactive 3D exploration</div>
            </div>
        </div>
    );
};

export default ParticlesPage;
