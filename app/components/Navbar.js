"use client";
import { useAuth } from "../contexts/AuthContext";
import Link from "next/link";

export default function Navbar() {
    const { user, logout } = useAuth();

    // Role Mapping for simple checks
    const isResearcher = user?.role === "Researcher";
    const isOrg = user?.role === "Organization";
    const isValidator = user?.role === "Validator";

    // Dynamic Logo Link
    const getHomeLink = () => {
        if (!user) return "/";
        if (isResearcher) return "/dashboard/researcher";
        if (isOrg) return "/dashboard/org";
        if (isValidator) return "/dashboard/validator";
        return "/";
    };

    return (
        <nav className="glass" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '70px',
            padding: '0 2rem',
            zIndex: 100,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
            <Link href={getHomeLink()} style={{ textDecoration: 'none' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', letterSpacing: '1px' }}>
                    <span style={{ color: '#fff' }}>Decen</span>
                    <span className="gradient-text">Bug</span>
                </div>
            </Link>

            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                {!user ? (
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <Link href="/register" className="btn-secondary" style={{ fontSize: '0.9rem', padding: '0.5rem 1.5rem' }}>Register</Link>
                        <Link href="/login" className="btn-primary" style={{ fontSize: '0.9rem', padding: '0.5rem 1.5rem' }}>
                            Login
                        </Link>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <Link href="/dashboard/profile" style={{ textDecoration: 'none', textAlign: 'right', lineHeight: '1.2', transition: 'opacity 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        >
                            <div style={{ fontSize: '0.9rem', color: '#fff' }}>{user.username}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>
                                {user.role}{user.wallet ? ` • ${user.wallet.substring(0,6)}...${user.wallet.substring(38)}` : ''}
                            </div>
                        </Link>
                        <button
                            onClick={logout}
                            style={{
                                background: 'rgba(255, 0, 60, 0.1)',
                                border: '1px solid rgba(255, 0, 60, 0.3)',
                                color: '#ff003c',
                                padding: '0.5rem 1rem',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.8rem'
                            }}
                        >
                            Logout
                        </button>
                    </div>
                )}
            </div>
        </nav>
    );
}
