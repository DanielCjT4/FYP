"use client";
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import Link from 'next/link';

export default function Login() {
    const { login } = useAuth();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleWeb3Login = async () => {
        setLoading(true);
        setError('');
        const res = await login();
        if (!res.success) {
            setError(res.error);
        }
        setLoading(false);
    };

    return (
        <div className="page-content" style={{ background: 'radial-gradient(circle at top, #1a1a2e, #0a0a0a)' }}>
            <Navbar />
            <div className="container" style={{ maxWidth: '480px' }}>
                <h1 className="gradient-text" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                    Welcome Back
                </h1>
                <p style={{ textAlign: 'center', color: '#888', marginBottom: '2.5rem' }}>
                    Authenticate with your blockchain identity
                </p>

                <div className="glass" style={{ padding: '2.5rem', borderRadius: '16px', textAlign: 'center' }}>

                    {/* Wallet Icon */}
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(0,240,255,0.15), rgba(0,255,136,0.15))',
                        border: '2px solid rgba(0,240,255,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 2rem auto', fontSize: '2rem'
                    }}>
                        🦊
                    </div>

                    <p style={{ color: '#aaa', marginBottom: '2rem', lineHeight: '1.6' }}>
                        Connect the MetaMask wallet you registered with. Your identity will be verified directly on the Ethereum blockchain — no passwords needed.
                    </p>

                    {error && (
                        <div style={{
                            padding: '1rem', marginBottom: '1.5rem', borderRadius: '8px',
                            background: 'rgba(255,0,60,0.1)', border: '1px solid rgba(255,0,60,0.3)', color: '#ff4444',
                            fontSize: '0.9rem'
                        }}>
                            {error}
                        </div>
                    )}

                    <button
                        onClick={handleWeb3Login}
                        className="btn-primary"
                        disabled={loading}
                        style={{
                            width: '100%', padding: '1.2rem', fontSize: '1.15rem',
                            opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '0.8rem'
                        }}
                    >
                        {loading ? (
                            'Verifying On-Chain Identity...'
                        ) : (
                            <>🔗 Connect Wallet to Login</>
                        )}
                    </button>

                    <p style={{ marginTop: '1.5rem', color: '#666', fontSize: '0.85rem' }}>
                        Don&apos;t have an account?{' '}
                        <Link href="/register" style={{ color: 'var(--primary)' }}>Register with Wallet</Link>
                    </p>
                </div>

                {/* Security Note */}
                <div style={{
                    marginTop: '2rem', padding: '1rem', borderRadius: '8px',
                    background: 'rgba(0,240,255,0.05)', border: '1px solid rgba(0,240,255,0.1)',
                    textAlign: 'center'
                }}>
                    <p style={{ color: '#666', fontSize: '0.8rem', margin: 0 }}>
                        🔒 Your identity is stored immutably on the Ethereum blockchain. No centralized database stores your credentials.
                    </p>
                </div>

            </div>
        </div>
    );
}
