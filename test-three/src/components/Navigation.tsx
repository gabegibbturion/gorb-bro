import React from "react";
import { Link, useLocation } from "react-router-dom";

const Navigation: React.FC = () => {
    const location = useLocation();

    const navItems = [
        { path: "/", label: "Home", icon: "🏠" },
        { path: "/globe", label: "Globe", icon: "🌍" },
    ];

    return (
        <nav
            style={{
                position: "fixed",
                top: "10px",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1000,
                display: "flex",
                gap: "6px",
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                padding: "6px 8px",
                borderRadius: "8px",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                maxWidth: "calc(100vw - 20px)",
                flexWrap: "wrap",
                justifyContent: "center",
            }}
        >
            {navItems.map((item) => (
                <Link
                    key={item.path}
                    to={item.path}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 10px",
                        backgroundColor: location.pathname === item.path ? "#007bff" : "transparent",
                        color: "white",
                        textDecoration: "none",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "500",
                        transition: "all 0.3s ease",
                        border: location.pathname === item.path ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid transparent",
                        whiteSpace: "nowrap",
                        minWidth: "fit-content",
                    }}
                    onMouseEnter={(e) => {
                        if (location.pathname !== item.path) {
                            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (location.pathname !== item.path) {
                            e.currentTarget.style.backgroundColor = "transparent";
                        }
                    }}
                >
                    <span style={{ fontSize: "14px" }}>{item.icon}</span>
                    {item.label}
                </Link>
            ))}
        </nav>
    );
};

export default Navigation;
