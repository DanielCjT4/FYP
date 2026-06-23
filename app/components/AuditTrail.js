"use client";
import { useState, useEffect } from 'react';

/**
 * AuditTrail — On-chain transparency timeline for a report.
 * Queries blockchain events (ReportSubmitted, StatusChanged, CommentAdded, PayoutReleased)
 * and renders a verifiable, timestamped lifecycle trail.
 * 
 * Props:
 *   - contract: ethers.Contract instance
 *   - reportId: uint256 report ID
 *   - account: current user's wallet address (for highlighting "you")
 */
export default function AuditTrail({ contract, reportId, account }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const statusLabels = {
        0: 'Submitted',
        1: 'Acknowledged',
        2: 'Validated',
        3: 'Rejected',
        4: 'Disputed',
        5: 'Resolved'
    };

    const statusIcons = {
        0: '📤',
        1: '👁️',
        2: '✅',
        3: '❌',
        4: '⚖️',
        5: '🏁'
    };

    const statusColors = {
        0: '#888',
        1: '#ffcc00',
        2: '#00ff88',
        3: '#ff003c',
        4: '#ff6600',
        5: '#00f0ff'
    };

    useEffect(() => {
        if (!contract || !reportId) return;
        fetchAuditTrail();
    }, [contract, reportId]);

    const fetchAuditTrail = async () => {
        setLoading(true);
        setError(null);
        try {
            const timeline = [];

            // 1. ReportSubmitted event
            const submitFilter = contract.filters.ReportSubmitted(reportId);
            const submitEvents = await contract.queryFilter(submitFilter);
            for (const evt of submitEvents) {
                const block = await evt.getBlock();
                timeline.push({
                    type: 'status',
                    status: 0,
                    icon: '📤',
                    label: 'Report Submitted',
                    color: '#888',
                    actor: evt.args.researcher,
                    blockNumber: evt.blockNumber,
                    timestamp: Number(block.timestamp) * 1000,
                    txHash: evt.transactionHash,
                    extra: `CID: ${evt.args.cid?.substring(0, 16)}...`
                });
            }

            // 2. StatusChanged events
            const statusFilter = contract.filters.StatusChanged(reportId);
            const statusEvents = await contract.queryFilter(statusFilter);
            for (const evt of statusEvents) {
                const block = await evt.getBlock();
                const statusNum = Number(evt.args.status);
                timeline.push({
                    type: 'status',
                    status: statusNum,
                    icon: statusIcons[statusNum] || '🔄',
                    label: statusLabels[statusNum] || `Status ${statusNum}`,
                    color: statusColors[statusNum] || '#fff',
                    actor: evt.args.updatedBy,
                    blockNumber: evt.blockNumber,
                    timestamp: Number(block.timestamp) * 1000,
                    txHash: evt.transactionHash,
                    extra: null
                });
            }

            // 3. CommentAdded events
            const commentFilter = contract.filters.CommentAdded(reportId);
            const commentEvents = await contract.queryFilter(commentFilter);
            for (const evt of commentEvents) {
                const block = await evt.getBlock();
                timeline.push({
                    type: 'comment',
                    icon: '💬',
                    label: 'Comment Added',
                    color: '#aaa',
                    actor: evt.args.sender,
                    blockNumber: evt.blockNumber,
                    timestamp: Number(block.timestamp) * 1000,
                    txHash: evt.transactionHash,
                    extra: `CID: ${evt.args.messageCid?.substring(0, 16)}...`
                });
            }

            // 4. PayoutReleased events
            const payoutFilter = contract.filters.PayoutReleased(reportId);
            const payoutEvents = await contract.queryFilter(payoutFilter);
            for (const evt of payoutEvents) {
                const block = await evt.getBlock();
                const { ethers } = await import('ethers');
                const amount = ethers.formatEther(evt.args.amount);
                timeline.push({
                    type: 'payout',
                    icon: '💰',
                    label: `Bounty Paid: ${amount} ETH`,
                    color: '#00ff88',
                    actor: evt.args.researcher,
                    blockNumber: evt.blockNumber,
                    timestamp: Number(block.timestamp) * 1000,
                    txHash: evt.transactionHash,
                    extra: evt.args.validator !== '0x0000000000000000000000000000000000000000'
                        ? `Validator: ${evt.args.validator.substring(0, 6)}...${evt.args.validator.substring(38)}`
                        : 'Direct payout by Organization'
                });
            }

            // Sort by block number, then by timestamp
            timeline.sort((a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp);

            // Calculate time deltas between events
            for (let i = 1; i < timeline.length; i++) {
                const delta = timeline[i].timestamp - timeline[i - 1].timestamp;
                timeline[i].timeDelta = formatDelta(delta);
            }

            setEvents(timeline);
        } catch (err) {
            console.error("Audit trail fetch error:", err);
            setError("Failed to load audit trail from blockchain.");
        } finally {
            setLoading(false);
        }
    };

    const formatDelta = (ms) => {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s later`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m later`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ${minutes % 60}m later`;
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h later`;
    };

    const formatTime = (ts) => {
        return new Date(ts).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
        });
    };

    const isMe = (addr) => addr?.toLowerCase() === account?.toLowerCase();

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <span style={{ fontSize: '1rem' }}>🔗</span>
                    <span>On-Chain Audit Trail</span>
                </div>
                <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                    <div style={styles.spinner}></div>
                    Reading blockchain events...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <span style={{ fontSize: '1rem' }}>🔗</span>
                    <span>On-Chain Audit Trail</span>
                </div>
                <div style={{ padding: '1.5rem', color: '#ff4444', fontSize: '0.9rem' }}>{error}</div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <span style={{ fontSize: '1rem' }}>🔗</span>
                <span>On-Chain Audit Trail</span>
                <span style={styles.badge}>{events.length} events</span>
            </div>

            {events.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#555', fontSize: '0.9rem' }}>
                    No on-chain events found for this report.
                </div>
            ) : (
                <div style={styles.timeline}>
                    {events.map((evt, i) => (
                        <div key={i} style={styles.event}>
                            {/* Timeline connector */}
                            <div style={styles.connector}>
                                <div style={{
                                    ...styles.dot,
                                    background: evt.color,
                                    boxShadow: `0 0 8px ${evt.color}40`
                                }}></div>
                                {i < events.length - 1 && <div style={styles.line}></div>}
                            </div>

                            {/* Event content */}
                            <div style={styles.eventContent}>
                                {/* Time delta badge */}
                                {evt.timeDelta && (
                                    <span style={styles.deltaBadge}>⏱ {evt.timeDelta}</span>
                                )}

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '1rem' }}>{evt.icon}</span>
                                    <span style={{ fontWeight: '600', color: evt.color, fontSize: '0.95rem' }}>
                                        {evt.label}
                                    </span>
                                </div>

                                <div style={styles.meta}>
                                    <span style={{ color: '#555' }}>by</span>
                                    <span style={{
                                        fontFamily: 'monospace',
                                        fontSize: '0.8rem',
                                        color: isMe(evt.actor) ? '#00f0ff' : '#888',
                                        background: 'rgba(255,255,255,0.04)',
                                        padding: '0.15rem 0.4rem',
                                        borderRadius: '4px'
                                    }}>
                                        {isMe(evt.actor) ? 'You' : `${evt.actor?.substring(0, 6)}...${evt.actor?.substring(38)}`}
                                    </span>
                                    <span style={{ color: '#333' }}>•</span>
                                    <span style={{ color: '#555', fontSize: '0.8rem' }}>
                                        Block #{evt.blockNumber}
                                    </span>
                                    <span style={{ color: '#333' }}>•</span>
                                    <span style={{ color: '#555', fontSize: '0.8rem' }}>
                                        {formatTime(evt.timestamp)}
                                    </span>
                                </div>

                                {evt.extra && (
                                    <div style={{
                                        marginTop: '0.3rem',
                                        fontSize: '0.78rem',
                                        color: '#444',
                                        fontFamily: 'monospace'
                                    }}>
                                        {evt.extra}
                                    </div>
                                )}

                                {/* TX Hash */}
                                <div style={{
                                    marginTop: '0.2rem',
                                    fontSize: '0.72rem',
                                    color: '#333',
                                    fontFamily: 'monospace'
                                }}>
                                    tx: {evt.txHash?.substring(0, 18)}...
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div style={styles.footer}>
                🔒 All events are immutable and verified from the blockchain
            </div>
        </div>
    );
}

const styles = {
    container: {
        background: 'rgba(10, 15, 25, 0.8)',
        border: '1px solid rgba(0, 240, 255, 0.1)',
        borderRadius: '12px',
        overflow: 'hidden',
        marginTop: '1rem'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '1rem 1.25rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontSize: '0.95rem',
        fontWeight: '600',
        color: '#fff'
    },
    badge: {
        marginLeft: 'auto',
        fontSize: '0.72rem',
        color: '#666',
        background: 'rgba(255,255,255,0.05)',
        padding: '0.2rem 0.5rem',
        borderRadius: '10px'
    },
    timeline: {
        padding: '1.25rem 1.25rem 0.5rem 1.25rem'
    },
    event: {
        display: 'flex',
        gap: '1rem',
        marginBottom: '0.25rem'
    },
    connector: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '20px',
        flexShrink: 0
    },
    dot: {
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        flexShrink: 0,
        marginTop: '6px'
    },
    line: {
        width: '2px',
        flex: 1,
        background: 'rgba(255,255,255,0.06)',
        minHeight: '20px'
    },
    eventContent: {
        flex: 1,
        paddingBottom: '1.25rem'
    },
    meta: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        marginTop: '0.35rem',
        flexWrap: 'wrap'
    },
    deltaBadge: {
        display: 'inline-block',
        fontSize: '0.7rem',
        color: '#ffaa00',
        background: 'rgba(255,170,0,0.08)',
        border: '1px solid rgba(255,170,0,0.15)',
        padding: '0.1rem 0.5rem',
        borderRadius: '10px',
        marginBottom: '0.3rem'
    },
    footer: {
        padding: '0.75rem 1.25rem',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        fontSize: '0.75rem',
        color: '#333',
        textAlign: 'center'
    },
    spinner: {
        width: '24px',
        height: '24px',
        border: '2px solid rgba(255,255,255,0.1)',
        borderTopColor: '#00f0ff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        margin: '0 auto 0.75rem auto'
    }
};
