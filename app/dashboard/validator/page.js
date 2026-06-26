"use client";
import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { useAuth } from '../../contexts/AuthContext';
import { useWallet } from '../../contexts/WalletContext';
import Navbar from '../../components/Navbar';
import AuditTrail from '../../components/AuditTrail';
import styles from './validator.module.css';

function getExtensionFromMime(mimeType) {
    if (!mimeType) return '';
    const cleanMime = mimeType.toLowerCase().trim().split(';')[0];
    const mimeMap = {
        'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png',
        'image/gif': '.gif', 'image/webp': '.webp', 'video/mp4': '.mp4',
        'video/webm': '.webm', 'text/plain': '.txt', 'application/json': '.json',
    };
    return mimeMap[cleanMime] || '';
}

export default function ValidatorDashboard() {
    const { user, loading } = useAuth();
    const { account, contract, connectWallet, disconnectWallet } = useWallet();
    const [view, setView] = useState('open-disputes');
    const [selectedDispute, setSelectedDispute] = useState(null);
    const [disputes, setDisputes] = useState([]);
    const [resolvedCases, setResolvedCases] = useState([]);

    const [activeClaim, setActiveClaim] = useState('');
    const [activeDefense, setActiveDefense] = useState('');
    const [bountyAmount, setBountyAmount] = useState('');
    const [actionStatus, setActionStatus] = useState('');

    // Chat thread state
    const [chatMessages, setChatMessages] = useState([]);
    const [loadingChat, setLoadingChat] = useState(false);
    const [chatError, setChatError] = useState('');
    const [showChat, setShowChat] = useState(false);
    const chatEndRef = useRef(null);

    // PoC evidence state
    const [pocType, setPocType] = useState(null);
    const [pocUrl, setPocUrl] = useState(null);
    const [pocBlob, setPocBlob] = useState(null);
    const [pocLoading, setPocLoading] = useState(false);
    const [pocError, setPocError] = useState('');

    // Wallet/Earnings state
    const [ethBalance, setEthBalance] = useState(null);
    const [totalEarned, setTotalEarned] = useState('0');
    const [payoutEvents, setPayoutEvents] = useState([]);

    // Fetch disputes on mount
    useEffect(() => {
        async function fetchDisputes() {
            try {
                const res = await fetch("/api/reports");
                const data = await res.json();
                if (data.success && data.reports) {
                    setDisputes(data.reports.filter(r => r.status === 'disputed'));
                    setResolvedCases(data.reports.filter(r => r.status === 'resolved' || (r.status === 'rejected' && r.disputeCid)));
                }
            } catch (e) { console.error(e); }
        }
        fetchDisputes();
    }, []);

    // Fetch wallet data when viewing earnings
    useEffect(() => {
        if (view === 'earnings' && account && contract) {
            fetchEarnings();
        }
    }, [view, account, contract]);

    // Scroll chat to bottom
    useEffect(() => {
        if (showChat && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, showChat]);

    const fetchEarnings = async () => {
        try {
            const provider = contract.runner?.provider || new ethers.BrowserProvider(window.ethereum);
            const bal = await provider.getBalance(account);
            setEthBalance(ethers.formatEther(bal));
            try {
                const filter = contract.filters.PayoutReleased(null, null, account, null);
                const events = await contract.queryFilter(filter);
                const list = events.map(e => ({
                    reportId: Number(e.args[0]),
                    researcher: e.args[1],
                    totalBounty: ethers.formatEther(e.args[3]),
                    validatorCut: (parseFloat(ethers.formatEther(e.args[3])) * 0.1).toFixed(4),
                    txHash: e.transactionHash,
                    blockNumber: e.blockNumber
                }));
                setPayoutEvents(list);
                const total = list.reduce((sum, p) => sum + parseFloat(p.validatorCut), 0);
                setTotalEarned(total.toFixed(4));
            } catch {
                setPayoutEvents([]);
            }
        } catch (err) {
            console.error("Earnings fetch error:", err);
        }
    };

    const fetchIpfsString = async (cid) => {
        try {
            const res = await fetch(`/api/ipfs/read?cid=${cid}`);
            const data = await res.json();
            return data.reason || JSON.stringify(data, null, 2);
        } catch (e) { return "Error loading IPFS: " + cid; }
    };

    // Load PoC evidence file
    const loadPocEvidence = async (cid) => {
        if (!cid) { setPocType(null); return; }
        setPocLoading(true);
        setPocError('');
        setPocType(null);
        if (pocUrl && pocUrl.startsWith('blob:')) URL.revokeObjectURL(pocUrl);
        setPocUrl(null);
        setPocBlob(null);

        try {
            const res = await fetch(`/api/ipfs/read?cid=${cid}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const contentType = res.headers.get('content-type') || 'application/octet-stream';
            const blob = await res.blob();
            setPocBlob(blob);
            const blobUrl = URL.createObjectURL(blob);
            setPocUrl(blobUrl);
            if (contentType.startsWith('image/')) setPocType('image');
            else if (contentType.startsWith('video/')) setPocType('video');
            else if (contentType.includes('pdf')) setPocType('pdf');
            else if (contentType.includes('json') || contentType.includes('text')) {
                const text = await blob.text();
                setPocType('text');
                setPocUrl(text);
            } else setPocType('other');
        } catch (e) {
            setPocError(e.message || 'Failed to load evidence');
            setPocType('error');
        } finally {
            setPocLoading(false);
        }
    };

    // Load discussion thread (validator read-only access)
    const loadChatThread = async (reportId) => {
        if (!account) return;
        setLoadingChat(true);
        setChatError('');
        setChatMessages([]);
        try {
            const res = await fetch(
                `/api/reports/discussion?reportId=${reportId}&userAddress=${account}&username=${user?.username || ''}&isValidator=true`
            );
            const data = await res.json();
            if (data.success && data.comments) {
                setChatMessages(data.comments);
            } else if (data.error) {
                setChatError(data.error);
            }
        } catch (e) {
            setChatError('Failed to load discussion thread.');
        } finally {
            setLoadingChat(false);
        }
    };

    const openTribunal = async (d) => {
        setSelectedDispute(d);
        setActiveClaim('Fetching IPFS evidence...');
        setActiveDefense('Fetching IPFS evidence...');
        setShowChat(false);
        setChatMessages([]);
        setPocType(null);
        setPocUrl(null);

        // Fetch claim & defense texts in parallel
        const [claim, defense] = await Promise.all([
            d.disputeCid ? fetchIpfsString(d.disputeCid) : Promise.resolve("No claim document uploaded"),
            d.rejectionCid ? fetchIpfsString(d.rejectionCid) : Promise.resolve("No defense document uploaded"),
        ]);
        setActiveClaim(claim);
        setActiveDefense(defense);

        // Load PoC evidence file
        if (d.cid) loadPocEvidence(d.cid);

        // Pre-load chat thread
        loadChatThread(d.id);
    };

    const handleVote = async (decision) => {
        if (!account || !contract) return alert("Wallet not connected. Please refresh the page.");
        if (decision === 'Valid' && (!bountyAmount || isNaN(bountyAmount))) return alert("Set a valid bounty amount");

        setActionStatus("Executing on-chain verdict...");
        try {
            const isValid = decision === 'Valid';
            const amountWei = isValid ? ethers.parseEther(bountyAmount.toString()) : 0;

            const tx = await contract.resolveDispute(selectedDispute.id, isValid, amountWei);
            await tx.wait();

            setActionStatus("Syncing database...");
            await fetch("/api/reports", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reportId: selectedDispute.id,
                    status: isValid ? 'resolved' : 'rejected',
                    txHash: tx.hash
                })
            });

            setResolvedCases([{ ...selectedDispute, status: isValid ? 'resolved' : 'rejected', verdict: decision }, ...resolvedCases]);
            setDisputes(disputes.filter(d => d.id !== selectedDispute.id));
            setSelectedDispute(null);
            setBountyAmount('');
        } catch (error) {
            console.error(error);
            if (error.reason) alert(`Transaction failed: ${error.reason}`);
            else alert("Transaction failed. Ensure the Organization's vault has enough escrow balance.");
        } finally {
            setActionStatus('');
        }
    };

    const getSeverityColor = (sev) => {
        switch (sev?.toLowerCase()) {
            case 'critical': return '#ff003c';
            case 'high': return '#ff6600';
            case 'medium': return '#ffcc00';
            case 'low': return '#00ff88';
            default: return '#888';
        }
    };

    const formatTs = (ts) => ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    const tabs = [
        { key: 'open-disputes', label: 'Open Disputes', count: disputes.length },
        { key: 'history', label: 'Resolved Cases' },
        { key: 'earnings', label: 'Wallet & Earnings' },
    ];

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#888' }}>
                <h2>Loading Profile...</h2>
            </div>
        );
    }

    if (!user || user.role !== 'Validator') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⛔</div>
                <h1 style={{ fontSize: '2.5rem', color: '#ff003c', marginBottom: '1rem', fontWeight: '800', letterSpacing: '-1px' }}>Unauthorized Access</h1>
                <p style={{ fontSize: '1.1rem', color: '#888', marginBottom: '2rem' }}>You do not have the required "Validator" role to view this dashboard.</p>
                <button onClick={() => window.location.href = '/'} style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Return to Home
                </button>
            </div>
        );
    }

    return (
        <div className={`page-content ${styles.pageContainer}`}>
            <Navbar />

            {/* Navigation */}
            <div className={styles.stickyNav}>
                <div className={`container ${styles.navContainer}`}>
                    {tabs.map(tab => (
                        <button key={tab.key}
                            onClick={() => { setView(tab.key); setSelectedDispute(null); }}
                            className={`${styles.tabButton} ${view === tab.key && !selectedDispute ? styles.tabButtonActive : ''}`}
                        >
                            {tab.label}
                            {tab.count > 0 && (
                                <span className={styles.tabCountBadge}>{tab.count}</span>
                            )}
                        </button>
                    ))}
                    {selectedDispute && (
                        <div className={styles.tribunalHeader}>
                            ⚖️ Tribunal #{selectedDispute.id}
                        </div>
                    )}
                </div>
            </div>

            {/* Wallet Connection Banner */}
            {!account && (
                <div className="container" style={{ paddingBottom: 0 }}>
                    <div className="glass" style={{
                        padding: '1.5rem 2rem', borderRadius: '12px',
                        border: '1px solid rgba(255, 170, 0, 0.25)', background: 'rgba(255, 170, 0, 0.04)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap'
                    }}>
                        <div>
                            <h4 style={{ margin: '0 0 0.3rem', color: '#ffaa00', fontSize: '1rem' }}>⚠️ Wallet Not Connected</h4>
                            <p style={{ margin: 0, color: '#888', fontSize: '0.85rem' }}>
                                Connect your MetaMask wallet to access blockchain dispute arbitration tribunal and review audit trails.
                            </p>
                        </div>
                        <button onClick={() => connectWallet('Validator')} className="btn-primary"
                            style={{ padding: '0.7rem 1.8rem', whiteSpace: 'nowrap', fontSize: '0.9rem' }}>
                            🔗 Connect Wallet
                        </button>
                    </div>
                </div>
            )}

            {/* Connected Wallet Indicator */}
            {account && (
                <div className="container" style={{ paddingBottom: 0 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem',
                        borderRadius: '8px', background: 'rgba(0, 255, 136, 0.04)',
                        border: '1px solid rgba(0, 255, 136, 0.12)', fontSize: '0.8rem', color: '#00ff88'
                    }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ff88', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                        <span>Connected:</span>
                        <span style={{ fontFamily: 'monospace', color: '#aaa' }}>
                            {account.substring(0, 6)}...{account.substring(38)}
                        </span>
                        <button onClick={disconnectWallet} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}>
                            Disconnect
                        </button>
                    </div>
                </div>
            )}

            <div className={`container ${styles.contentContainer}`}>

                {/* ═══ VIEW: OPEN DISPUTES ═══ */}
                {view === 'open-disputes' && !selectedDispute && (
                    <div className={styles.disputesList}>
                        {disputes.length === 0 ? (
                            <div className={`glass ${styles.emptyState}`}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚖️</div>
                                <h3 style={{ color: '#fff', margin: '0 0 0.5rem' }}>No Active Disputes</h3>
                                <p style={{ color: '#666', margin: 0 }}>When a researcher disputes a rejection, it will appear here for arbitration.</p>
                            </div>
                        ) : disputes.map(d => (
                            <div key={d.id} className={`glass ${styles.disputeCard}`} style={{ borderLeft: `4px solid ${getSeverityColor(d.severity)}` }}>
                                <div className={styles.disputeCardBody}>
                                    <div className={styles.disputeTitleGroup}>
                                        <span className={styles.disputeId}>#{d.id}</span>
                                        <h3 className={styles.disputeTitle}>{d.title || 'Untitled Report'}</h3>
                                        <span style={{
                                            background: `${getSeverityColor(d.severity)}15`, color: getSeverityColor(d.severity),
                                            padding: '0.15rem 0.6rem', borderRadius: '10px', fontSize: '0.75rem',
                                            border: `1px solid ${getSeverityColor(d.severity)}30`
                                        }}>{d.severity || 'Unknown'}</span>
                                        {d.cvssScore != null && (
                                            <span style={{ fontSize: '0.75rem', color: '#888', fontFamily: 'monospace' }}>
                                                CVSS {d.cvssScore}
                                            </span>
                                        )}
                                    </div>
                                    <div className={styles.disputeMeta}>
                                        <span>📋 {d.program || 'Unknown Program'}</span>
                                        <span style={{ margin: '0 0.5rem', color: '#333' }}>•</span>
                                        <span>👤 {d.researcher || 'Unknown'}</span>
                                        <span style={{ margin: '0 0.5rem', color: '#333' }}>•</span>
                                        <span>🕒 Submitted {d.timestamp?.split('T')[0] || '—'}</span>
                                    </div>
                                </div>
                                <button onClick={() => openTribunal(d)} className={`btn-primary ${styles.enterTribunalButton}`}>
                                    ⚖️ Enter Tribunal
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* ═══ VIEW: TRIBUNAL ═══ */}
                {selectedDispute && (
                    <div>
                        <button onClick={() => { setSelectedDispute(null); setBountyAmount(''); }} className={styles.backButton}>
                            ← Back to disputes
                        </button>

                        {/* ── Report Intelligence Banner ── */}
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(255,0,60,0.06) 0%, rgba(0,0,0,0.4) 100%)',
                            border: '1px solid rgba(255,0,60,0.15)', borderRadius: '12px',
                            padding: '1.25rem 1.75rem', marginBottom: '1.5rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'monospace', color: '#555', fontSize: '0.85rem' }}>#{selectedDispute.id}</span>
                                        <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#fff' }}>{selectedDispute.title || 'Untitled Report'}</h2>
                                        <span style={{
                                            background: `${getSeverityColor(selectedDispute.severity)}18`,
                                            color: getSeverityColor(selectedDispute.severity),
                                            padding: '0.2rem 0.7rem', borderRadius: '10px', fontSize: '0.8rem',
                                            border: `1px solid ${getSeverityColor(selectedDispute.severity)}30`,
                                            fontWeight: '700'
                                        }}>{selectedDispute.severity || '—'}</span>
                                        {selectedDispute.cvssScore != null && (
                                            <span style={{
                                                background: 'rgba(255,170,0,0.08)', color: '#ffaa00',
                                                padding: '0.2rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem',
                                                border: '1px solid rgba(255,170,0,0.2)', fontFamily: 'monospace'
                                            }}>CVSS {parseFloat(selectedDispute.cvssScore).toFixed(1)}</span>
                                        )}
                                    </div>
                                    {selectedDispute.description && (
                                        <p style={{ color: '#888', margin: '0 0 0.75rem', fontSize: '0.88rem', lineHeight: '1.6', maxWidth: '700px' }}>
                                            {selectedDispute.description}
                                        </p>
                                    )}
                                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
                                        {[
                                            { icon: '📋', label: 'Program', value: selectedDispute.program || '—' },
                                            { icon: '👤', label: 'Researcher', value: selectedDispute.researcher || '—' },
                                            { icon: '🕒', label: 'Submitted', value: selectedDispute.timestamp?.split('T')[0] || '—' },
                                        ].map(({ icon, label, value }) => (
                                            <div key={label}>
                                                <span style={{ color: '#555' }}>{icon} {label}: </span>
                                                <span style={{ color: '#ccc' }}>{value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* CVSS Gauge */}
                                {selectedDispute.cvssScore != null && (
                                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                                        <div style={{
                                            width: '72px', height: '72px', borderRadius: '50%',
                                            background: `conic-gradient(${getSeverityColor(selectedDispute.severity)} ${selectedDispute.cvssScore * 10}%, rgba(255,255,255,0.06) 0%)`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            position: 'relative'
                                        }}>
                                            <div style={{
                                                width: '52px', height: '52px', borderRadius: '50%',
                                                background: '#0a0a0a', display: 'flex', alignItems: 'center',
                                                justifyContent: 'center', flexDirection: 'column'
                                            }}>
                                                <span style={{ fontSize: '1rem', fontWeight: '800', color: getSeverityColor(selectedDispute.severity) }}>
                                                    {parseFloat(selectedDispute.cvssScore).toFixed(1)}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#555', marginTop: '0.3rem', textTransform: 'uppercase' }}>CVSS v3.1</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── 3-Column Evidence Grid ── */}
                        <div className={styles.tribunalGrid}>

                            {/* Column 1: Researcher's Claim + PoC Preview */}
                            <div className={`glass ${styles.columnPanel}`}>
                                <h3 className={styles.columnHeader} style={{ color: '#00ff88' }}>
                                    🟢 Researcher&apos;s Dispute Claim
                                </h3>
                                <div className={styles.cidRow}>
                                    Dispute CID: <span className={styles.cidHash}>{selectedDispute.disputeCid?.substring(0, 20) || '—'}...</span>
                                </div>
                                <div className={`${styles.documentContent} ${styles.claimContent}`}>
                                    {activeClaim}
                                </div>

                                {/* PoC Evidence Preview */}
                                <div style={{
                                    marginTop: '1rem', borderTop: '1px solid rgba(0,255,136,0.1)',
                                    paddingTop: '1rem'
                                }}>
                                    <div style={{ fontSize: '0.75rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.6rem', fontWeight: '600' }}>
                                        📎 Original PoC Evidence File
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#555', fontFamily: 'monospace', marginBottom: '0.5rem' }}>
                                        CID: {selectedDispute.cid?.substring(0, 24) || '—'}...
                                    </div>

                                    {pocLoading && (
                                        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#555', fontSize: '0.85rem' }}>
                                            <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#00ff88', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                                            Loading evidence...
                                        </div>
                                    )}

                                    {!pocLoading && pocType === 'image' && (
                                        <img src={pocUrl} alt="PoC Evidence" style={{ maxWidth: '100%', borderRadius: '6px', border: '1px solid rgba(0,255,136,0.15)' }} />
                                    )}
                                    {!pocLoading && pocType === 'video' && (
                                        <video controls src={pocUrl} style={{ width: '100%', borderRadius: '6px' }} />
                                    )}
                                    {!pocLoading && pocType === 'pdf' && (
                                        <iframe src={pocUrl} style={{ width: '100%', height: '200px', borderRadius: '6px', border: '1px solid rgba(0,255,136,0.15)', background: '#000' }} title="PoC PDF" />
                                    )}
                                    {!pocLoading && pocType === 'text' && (
                                        <pre style={{
                                            background: 'rgba(0,0,0,0.4)', padding: '0.75rem', borderRadius: '6px',
                                            fontSize: '0.75rem', color: '#ccc', overflow: 'auto', maxHeight: '160px',
                                            border: '1px solid rgba(0,255,136,0.1)', lineHeight: '1.5'
                                        }}>{pocUrl}</pre>
                                    )}
                                    {!pocLoading && pocType === 'other' && (
                                        <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.8rem', color: '#888' }}>
                                            📄 Binary file — cannot preview inline.
                                            <br />
                                            <a href={pocUrl} download style={{ color: '#00f0ff', textDecoration: 'none', marginTop: '0.3rem', display: 'inline-block' }}>
                                                ⬇️ Download Evidence File
                                            </a>
                                        </div>
                                    )}
                                    {!pocLoading && pocType === 'error' && (
                                        <div style={{ padding: '0.75rem', background: 'rgba(255,0,60,0.05)', borderRadius: '6px', fontSize: '0.8rem', color: '#ff6666', border: '1px solid rgba(255,0,60,0.1)' }}>
                                            ⚠️ {pocError || 'Could not load evidence file'}
                                        </div>
                                    )}
                                    {!pocLoading && !pocType && !selectedDispute.cid && (
                                        <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#555' }}>No evidence file attached</div>
                                    )}
                                </div>
                            </div>

                            {/* Column 2: Org Defense + Chat Thread */}
                            <div className={`glass ${styles.columnPanel}`} style={{ overflow: 'hidden' }}>
                                <h3 className={styles.columnHeader} style={{ color: '#ff003c' }}>
                                    🔴 Organization&apos;s Defense
                                </h3>
                                <div className={styles.cidRow}>
                                    Rejection CID: <span className={styles.cidHash}>{selectedDispute.rejectionCid?.substring(0, 20) || '—'}...</span>
                                </div>
                                <div className={`${styles.documentContent} ${styles.defenseContent}`}>
                                    {activeDefense}
                                </div>

                                {/* Discussion Thread Toggle */}
                                <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,0,60,0.1)', paddingTop: '1rem' }}>
                                    <button
                                        onClick={() => setShowChat(prev => !prev)}
                                        style={{
                                            width: '100%', padding: '0.65rem 1rem', borderRadius: '8px',
                                            background: showChat ? 'rgba(0,240,255,0.08)' : 'rgba(255,255,255,0.04)',
                                            border: `1px solid ${showChat ? 'rgba(0,240,255,0.25)' : 'rgba(255,255,255,0.1)'}`,
                                            color: showChat ? '#00f0ff' : '#888', cursor: 'pointer',
                                            fontSize: '0.82rem', display: 'flex', alignItems: 'center',
                                            gap: '0.5rem', transition: 'all 0.2s'
                                        }}
                                    >
                                        <span>💬</span>
                                        <span>Researcher ↔ Org Discussion Thread</span>
                                        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.75rem', color: '#555' }}>
                                            {chatMessages.length} messages
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#555' }}>{showChat ? '▲' : '▼'}</span>
                                    </button>

                                    {showChat && (
                                        <div style={{
                                            marginTop: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px',
                                            border: '1px solid rgba(0,240,255,0.1)', overflow: 'hidden'
                                        }}>
                                            {/* Read-only notice */}
                                            <div style={{
                                                padding: '0.5rem 0.75rem', background: 'rgba(0,240,255,0.05)',
                                                borderBottom: '1px solid rgba(0,240,255,0.08)',
                                                fontSize: '0.72rem', color: '#4af', display: 'flex', alignItems: 'center', gap: '0.4rem'
                                            }}>
                                                <span>🔒</span> Read-only view — for arbitration purposes only
                                            </div>

                                            <div style={{ maxHeight: '260px', overflowY: 'auto', padding: '0.75rem' }}>
                                                {loadingChat && (
                                                    <div style={{ textAlign: 'center', color: '#555', padding: '1rem', fontSize: '0.82rem' }}>
                                                        <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.08)', borderTopColor: '#00f0ff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 0.4rem' }} />
                                                        Loading thread...
                                                    </div>
                                                )}
                                                {chatError && (
                                                    <div style={{ color: '#ff6666', fontSize: '0.82rem', padding: '0.5rem', background: 'rgba(255,0,60,0.05)', borderRadius: '6px' }}>
                                                        ⚠️ {chatError}
                                                    </div>
                                                )}
                                                {!loadingChat && !chatError && chatMessages.length === 0 && (
                                                    <div style={{ textAlign: 'center', color: '#444', fontSize: '0.82rem', padding: '1rem' }}>
                                                        No messages in this discussion.
                                                    </div>
                                                )}
                                                {!loadingChat && chatMessages.map((msg, i) => (
                                                    <div key={i} style={{
                                                        marginBottom: '0.6rem', padding: '0.6rem 0.75rem',
                                                        borderRadius: '8px', background: 'rgba(255,255,255,0.03)',
                                                        border: '1px solid rgba(255,255,255,0.05)'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', alignItems: 'center' }}>
                                                            <span style={{
                                                                fontSize: '0.75rem', fontWeight: '600',
                                                                color: msg.senderName === selectedDispute.researcher ? '#00ff88' : '#ff8888'
                                                            }}>
                                                                {msg.senderName === selectedDispute.researcher ? '🟢' : '🔴'} {msg.senderName || msg.sender}
                                                            </span>
                                                            <span style={{ fontSize: '0.65rem', color: '#444' }}>
                                                                {formatTs(msg.timestamp)}
                                                            </span>
                                                        </div>
                                                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#ccc', lineHeight: '1.5' }}>
                                                            {msg.text}
                                                        </p>
                                                    </div>
                                                ))}
                                                <div ref={chatEndRef} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Column 3: Verdict Panel */}
                            <div className="glass" style={{ padding: '1.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <h3 style={{ margin: '0 0 1rem', color: '#fff' }}>⚖️ Your Verdict</h3>

                                {/* Arbitration Tokenomics */}
                                <div style={{ background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.15)', padding: '0.85rem', borderRadius: '10px', marginBottom: '1rem' }}>
                                    <h4 style={{ color: '#ffaa00', margin: '0 0 0.4rem', fontSize: '0.8rem' }}>💱 Arbitration Tokenomics</h4>
                                    <p style={{ fontSize: '0.78rem', color: '#aaa', margin: 0, lineHeight: '1.5' }}>
                                        If ruled <strong style={{ color: '#00ff88' }}>Valid</strong>: Org Vault→<strong>90%</strong> Researcher + <strong style={{ color: '#ffaa00' }}>10%</strong> You.
                                    </p>
                                </div>

                                {/* Checklist for Validator */}
                                <div style={{ background: 'rgba(0,240,255,0.03)', border: '1px solid rgba(0,240,255,0.1)', borderRadius: '10px', padding: '0.85rem', marginBottom: '1rem' }}>
                                    <h4 style={{ color: '#00f0ff', margin: '0 0 0.6rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📋 Evidence Checklist</h4>
                                    {[
                                        { label: 'Claim document loaded', ok: activeClaim && activeClaim !== 'Fetching IPFS evidence...' && activeClaim !== 'No claim document uploaded' },
                                        { label: 'Defense document loaded', ok: activeDefense && activeDefense !== 'Fetching IPFS evidence...' && activeDefense !== 'No defense document uploaded' },
                                        { label: 'PoC evidence file', ok: pocType && pocType !== 'error' },
                                        { label: 'Discussion thread reviewed', ok: showChat && chatMessages.length > 0 },
                                        { label: 'Audit trail verified', ok: true },
                                    ].map(({ label, ok }) => (
                                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', fontSize: '0.8rem' }}>
                                            <span style={{ color: ok ? '#00ff88' : '#555', fontSize: '0.85rem' }}>{ok ? '✅' : '⬜'}</span>
                                            <span style={{ color: ok ? '#ccc' : '#555' }}>{label}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Case Summary */}
                                <div style={{ marginBottom: '1rem', fontSize: '0.82rem' }}>
                                    {[
                                        { label: 'Report', value: `#${selectedDispute.id} — ${selectedDispute.title || 'Untitled'}` },
                                        { label: 'Severity', value: selectedDispute.severity || '—', color: getSeverityColor(selectedDispute.severity) },
                                        { label: 'CVSS', value: selectedDispute.cvssScore != null ? parseFloat(selectedDispute.cvssScore).toFixed(1) : '—' },
                                        { label: 'Program', value: selectedDispute.program || '—' },
                                        { label: 'Researcher', value: selectedDispute.researcher || '—' },
                                    ].map(({ label, value, color }) => (
                                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ color: '#555' }}>{label}</span>
                                            <span style={{ color: color || '#fff', maxWidth: '170px', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Bounty Input */}
                                <label style={{ display: 'block', marginBottom: '0.4rem', color: '#888', fontSize: '0.82rem' }}>
                                    Bounty Award (ETH) — only for Valid ruling
                                </label>
                                <input
                                    type="number" step="0.01"
                                    className="glass"
                                    style={{ width: '100%', padding: '0.75rem', color: '#fff', border: 'none', borderRadius: '8px', marginBottom: '0.4rem', boxSizing: 'border-box' }}
                                    placeholder="e.g. 2.5"
                                    value={bountyAmount} onChange={e => setBountyAmount(e.target.value)}
                                />
                                {bountyAmount && !isNaN(bountyAmount) && parseFloat(bountyAmount) > 0 && (
                                    <div style={{ fontSize: '0.78rem', color: '#888', marginBottom: '1rem' }}>
                                        Researcher gets <span style={{ color: '#00ff88' }}>{(parseFloat(bountyAmount) * 0.9).toFixed(4)} ETH</span> • You earn <span style={{ color: '#ffaa00' }}>{(parseFloat(bountyAmount) * 0.1).toFixed(4)} ETH</span>
                                    </div>
                                )}

                                {/* Vote Buttons */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: 'auto' }}>
                                    <button
                                        onClick={() => handleVote('Valid')} disabled={!!actionStatus}
                                        style={{
                                            padding: '0.9rem', borderRadius: '10px', fontWeight: '700', fontSize: '0.9rem',
                                            background: 'linear-gradient(135deg, #00ff88, #00cc6a)', color: '#000', border: 'none', cursor: 'pointer',
                                            opacity: actionStatus ? 0.6 : 1, transition: 'opacity 0.2s'
                                        }}
                                    >
                                        {actionStatus || "✅ Rule: Valid (Pay Researcher)"}
                                    </button>
                                    <button
                                        onClick={() => handleVote('Invalid')} disabled={!!actionStatus}
                                        style={{
                                            padding: '0.9rem', borderRadius: '10px', fontWeight: '600', fontSize: '0.9rem',
                                            background: 'transparent', border: '1px solid #ff003c', color: '#ff003c', cursor: 'pointer',
                                            opacity: actionStatus ? 0.6 : 1, transition: 'opacity 0.2s'
                                        }}
                                    >
                                        ❌ Rule: Invalid (Dismiss)
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* On-Chain Audit Trail */}
                        <div style={{ marginTop: '2rem' }}>
                            <AuditTrail contract={contract} reportId={selectedDispute.id} account={account} />
                        </div>
                    </div>
                )}

                {/* ═══ VIEW: RESOLVED HISTORY ═══ */}
                {view === 'history' && (
                    <div>
                        <h2 style={{ margin: '0 0 1.5rem', color: '#fff' }}>Resolved Cases</h2>
                        {resolvedCases.length === 0 ? (
                            <div className="glass" style={{ padding: '4rem', textAlign: 'center', borderRadius: '16px' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📜</div>
                                <p style={{ color: '#666', margin: 0 }}>No resolved dispute cases yet.</p>
                            </div>
                        ) : (
                            <div className="glass" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left' }}>
                                            {['Report', 'Program', 'Researcher', 'Severity', 'Outcome', 'Date'].map(h => (
                                                <th key={h} style={{ padding: '1rem', color: '#666', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {resolvedCases.map(c => (
                                            <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{ fontFamily: 'monospace', color: '#888' }}>#{c.id}</span>{' '}
                                                    <span style={{ color: '#ccc' }}>{c.title || 'Untitled'}</span>
                                                </td>
                                                <td style={{ padding: '1rem', color: '#888' }}>{c.program || '—'}</td>
                                                <td style={{ padding: '1rem', color: '#888', fontSize: '0.85rem' }}>{c.researcher || '—'}</td>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{ color: getSeverityColor(c.severity), fontSize: '0.85rem' }}>{c.severity || '—'}</span>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{
                                                        background: c.status === 'resolved' ? 'rgba(0,255,136,0.08)' : 'rgba(255,0,60,0.08)',
                                                        color: c.status === 'resolved' ? '#00ff88' : '#ff003c',
                                                        padding: '0.25rem 0.75rem', borderRadius: '10px', fontSize: '0.8rem',
                                                        border: `1px solid ${c.status === 'resolved' ? 'rgba(0,255,136,0.2)' : 'rgba(255,0,60,0.2)'}`
                                                    }}>
                                                        {c.status === 'resolved' ? '✅ Valid' : '❌ Invalid'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem', color: '#666', fontSize: '0.85rem' }}>{c.timestamp?.split('T')[0] || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ VIEW: WALLET & EARNINGS ═══ */}
                {view === 'earnings' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                            {[
                                { icon: '⚖️', label: 'Cases Resolved', value: resolvedCases.length, color: '#ff003c' },
                                { icon: '💰', label: 'Total Earned (10% Fees)', value: `${totalEarned} ETH`, color: '#ffaa00' },
                                { icon: '💎', label: 'Current Balance', value: ethBalance ? `${parseFloat(ethBalance).toFixed(4)} ETH` : '—', color: '#00ff88' },
                                { icon: '📊', label: 'Payout Events', value: payoutEvents.length, color: 'var(--primary)' },
                            ].map((s, i) => (
                                <div key={i} className="glass" style={{ padding: '1.5rem', borderRadius: '12px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{s.icon}</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: '800', color: s.color, letterSpacing: '-1px' }}>{s.value}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '0.25rem' }}>{s.label}</div>
                                </div>
                            ))}
                        </div>

                        <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                            <h3 style={{ margin: '0 0 1rem', color: '#fff' }}>Validator Identity</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {[
                                    { label: 'Wallet', value: account || user?.wallet || '—', mono: true },
                                    { label: 'Role', value: 'Validator', color: '#ff003c' },
                                    { label: 'Name', value: user?.username || '—' },
                                ].map(({ label, value, mono, color }) => (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <span style={{ color: '#666', fontSize: '0.85rem' }}>{label}</span>
                                        <span style={{ fontFamily: mono ? 'monospace' : 'inherit', color: color || '#ccc', fontSize: '0.85rem' }}>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                            <h3 style={{ margin: '0 0 1.5rem', color: '#fff' }}>💸 Arbitration Fee History</h3>
                            {payoutEvents.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: '#555' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🏦</div>
                                    <p style={{ margin: 0 }}>No arbitration fees earned yet.</p>
                                    <p style={{ fontSize: '0.85rem', color: '#444', marginTop: '0.5rem' }}>
                                        You earn a 10% fee from every dispute you resolve in favor of the researcher.
                                    </p>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ color: '#666', borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                            {['Report', 'Total Bounty', 'Your Cut (10%)', 'TX Hash', 'Block'].map(h => (
                                                <th key={h} style={{ padding: '0.75rem 1rem' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payoutEvents.map((p, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>#{p.reportId}</td>
                                                <td style={{ padding: '0.75rem 1rem', color: '#ccc' }}>{p.totalBounty} ETH</td>
                                                <td style={{ padding: '0.75rem 1rem', color: '#ffaa00', fontWeight: '600' }}>{p.validatorCut} ETH</td>
                                                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#888' }}>
                                                    {p.txHash.substring(0, 10)}...{p.txHash.substring(58)}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', color: '#666' }}>#{p.blockNumber}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
