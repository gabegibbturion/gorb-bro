import React from "react";
import { Link } from "react-router-dom";
import Profiler from "../components/Profiler";

const HomePage: React.FC = () => {
    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
                margin: 0,
                padding: 0,
                position: "relative",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                color: "white",
                fontFamily: "Arial, sans-serif",
            }}
        >
            <div style={{ textAlign: "center", maxWidth: "600px", padding: "40px" }}>
                <h1 style={{ fontSize: "3rem", marginBottom: "20px", fontWeight: "bold" }}>Three.js React App</h1>

                <p style={{ fontSize: "1.2rem", marginBottom: "40px", opacity: 0.9 }}>Explore interactive 3D visualizations with satellite tracking and particle systems</p>

                <div style={{ display: "flex", gap: "20px", justifyContent: "center", flexWrap: "wrap" }}>
                    <Link
                        to="/globe"
                        style={{
                            display: "inline-block",
                            padding: "15px 30px",
                            backgroundColor: "rgba(255, 255, 255, 0.2)",
                            color: "white",
                            textDecoration: "none",
                            borderRadius: "10px",
                            border: "2px solid rgba(255, 255, 255, 0.3)",
                            fontSize: "1.1rem",
                            fontWeight: "bold",
                            transition: "all 0.3s ease",
                            backdropFilter: "blur(10px)",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.3)";
                            e.currentTarget.style.transform = "translateY(-2px)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
                            e.currentTarget.style.transform = "translateY(0)";
                        }}
                    >
                        🌍 Globe View
                    </Link>

                    <Link
                        to="/particles"
                        style={{
                            display: "inline-block",
                            padding: "15px 30px",
                            backgroundColor: "rgba(255, 255, 255, 0.2)",
                            color: "white",
                            textDecoration: "none",
                            borderRadius: "10px",
                            border: "2px solid rgba(255, 255, 255, 0.3)",
                            fontSize: "1.1rem",
                            fontWeight: "bold",
                            transition: "all 0.3s ease",
                            backdropFilter: "blur(10px)",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.3)";
                            e.currentTarget.style.transform = "translateY(-2px)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
                            e.currentTarget.style.transform = "translateY(0)";
                        }}
                    >
                        ✨ Particle System
                    </Link>
                </div>

                <div style={{ marginTop: "40px", fontSize: "0.9rem", opacity: 0.7 }}>
                    <p>Features: Real-time satellite tracking • 1M particle system • Performance monitoring</p>
                </div>
            </div>

            <Profiler position="bottom-right" showFPS={true} showMemory={false} showRenderTime={false} />
        </div>
    );
};

export default HomePage;
