import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navigation: React.FC = () => {
    const location = useLocation();

    const navItems = [
        { path: '/', label: 'Home', icon: '🏠' },
        { path: '/globe', label: 'Globe', icon: '🌍' },
        { path: '/particles', label: 'Particles', icon: '✨' }
    ];

    return (
        <nav style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            zIndex: 1000,
            display: 'flex',
            gap: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: '10px',
            borderRadius: '10px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
            {navItems.map((item) => (
                <Link
                    key={item.path}
                    to={item.path}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 16px',
                        backgroundColor: location.pathname === item.path ? '#007bff' : 'transparent',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '500',
                        transition: 'all 0.3s ease',
                        border: location.pathname === item.path ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid transparent'
                    }}
                    onMouseEnter={(e) => {
                        if (location.pathname !== item.path) {
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (location.pathname !== item.path) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }
                    }}
                >
                    <span style={{ fontSize: '16px' }}>{item.icon}</span>
                    {item.label}
                </Link>
            ))}
        </nav>
    );
};

export default Navigation;
