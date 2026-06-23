"use client";
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

/**
 * ReputationBadge — On-chain reputation score for an organization.
 * Derives stats by querying blockchain events to show:
 *   - Total reports received
 *   - Acceptance / Rejection rate
 *   - Dispute rate
 *   - Average response time
 *   - Vault balance (escrow)
 * 
 * Props:
 *   - contract: ethers.Contract instance
 *   - orgAddress: the organization's wallet address
 *   - showVault: boolean (show escrow balance, default true)
 *   - compact: boolean (smaller layout for cards, default false)
 */
export default function ReputationBadge({ contract, orgAddress, showVault = true, compact = false }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!contract || !orgAddress) return;
        fetchReputation();
    }, [contract, orgAddress]);

    const fetchReputation = async () => {
        setLoading(true);
        try {
            // 1. Get all reports submitted TO this org
            const submitFilter = contract.filters.ReportSubmitted(null, null, orgAddress);
            const submitEvents = await contract.queryFilter(submitFilter);
            const totalReports = submitEvents.length;

            // Build a map of reportId -> submission block timestamp
            const reportTimestamps = {};
            for (const evt of submitEvents) {
                const block = await evt.getBlock();
                reportTimestamps[Number(evt.args.id)] = Number(block.timestamp);
            }

            // 2. Get all status changes by this org
            const statusFilter = contract.filters.StatusChanged(null, null, orgAddress);
            const statusEvents = await contract.queryFilter(statusFilter);

            let acknowledged = 0;
            let rejected = 0;
            let responseTimes = [];
            const acceptedReportIds = new Set();

            // Track first response per report
            const firstResponses = {};

            for (const evt of statusEvents) {
                const reportId = Number(evt.args.id);
                const statusNum = Number(evt.args.status);

                // Track first response time
                if (!firstResponses[reportId] && reportTimestamps[reportId]) {
                    const block = await evt.getBlock();
                    const responseTime = Number(block.timestamp) - reportTimestamps[reportId];
                    responseTimes.push(responseTime);
                    firstResponses[reportId] = true;
                }

                if (statusNum === 1) acknowledged++;
                else if (statusNum === 2) acceptedReportIds.add(reportId);
                else if (statusNum === 3) rejected++;
            }

            // 3. Count disputes (any report that reached Disputed status for this org)
            // We check all StatusChanged events where status = 4 (Disputed)
            const allStatusFilter = contract.filters.StatusChanged();
            const allStatusEvents = await contract.queryFilter(allStatusFilter);
            
            let disputed = 0;
            for (const evt of allStatusEvents) {
                const reportId = Number(evt.args.id);
                const statusNum = Number(evt.args.status);
                if (statusNum === 4 && reportTimestamps[reportId] !== undefined) {
                    disputed++;
                }
            }

            // 4. Vault balance
            let vaultBalance = '0';
            if (showVault) {
                const vault = await contract.orgVaults(orgAddress);
                vaultBalance = ethers.formatEther(vault);
            }

            // 5. Payout count and total
            const payoutFilter = contract.filters.PayoutReleased();
            const payoutEvents = await contract.queryFilter(payoutFilter);
            let totalPaid = 0n;
            let payoutCount = 0;
            for (const evt of payoutEvents) {
                // Check if this payout was from a report belonging to this org
                const reportId = Number(evt.args.reportId);
                if (reportTimestamps[reportId] !== undefined) {
                    totalPaid += evt.args.amount;
                    payoutCount++;
                    acceptedReportIds.add(reportId); // Payout means it was accepted
                }
            }

            const validated = acceptedReportIds.size;

            // Calculate stats
            const acceptanceRate = totalReports > 0
                ? Math.round((validated / totalReports) * 100)
                : null;
            const rejectionRate = totalReports > 0
                ? Math.round((rejected / totalReports) * 100)
                : null;
            const disputeRate = totalReports > 0
                ? Math.round((disputed / totalReports) * 100)
                : null;

            const avgResponseSec = responseTimes.length > 0
                ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
                : null;

            setStats({
                totalReports,
                validated,
                rejected,
                disputed,
                acceptanceRate,
                rejectionRate,
                disputeRate,
                avgResponseTime: avgResponseSec ? formatDuration(avgResponseSec) : null,
                vaultBalance,
                totalPaid: ethers.formatEther(totalPaid),
                payoutCount
            });
        } catch (err) {
            console.error("Reputation fetch error:", err);
            setStats(null);
        } finally {
            setLoading(false);
        }
    };

    const formatDuration = (seconds) => {
        if (seconds < 60) return `${Math.round(seconds)}s`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ${minutes % 60}m`;
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
    };

    const getTrustLevel = () => {
        if (!stats || stats.totalReports === 0) return { label: 'New', color: '#888', bg: 'rgba(136,136,136,0.1)' };
        if (stats.acceptanceRate >= 70 && stats.disputeRate <= 15) return { label: 'Trusted', color: '#00ff88', bg: 'rgba(0,255,136,0.08)' };
        if (stats.acceptanceRate >= 40) return { label: 'Moderate', color: '#ffcc00', bg: 'rgba(255,204,0,0.08)' };
        return { label: 'Caution', color: '#ff6600', bg: 'rgba(255,102,0,0.08)' };
    };

    if (loading) {
        return (
            <div style={{
                ...styles.container,
                ...(compact ? styles.compact : {}),
                padding: compact ? '0.6rem 0.8rem' : '1rem',
                color: '#555'
            }}>
                <span style={{ fontSize: '0.8rem' }}>Loading reputation...</span>
            </div>
        );
    }

    if (!stats) return null;

    const trust = getTrustLevel();

    if (compact) {
        // Compact mode for program cards
        return (
            <div style={{ ...styles.container, ...styles.compact }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {/* Trust badge */}
                    <span style={{
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        color: trust.color,
                        background: trust.bg,
                        border: `1px solid ${trust.color}30`,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '10px'
                    }}>
                        {trust.label}
                    </span>

                    {stats.totalReports > 0 && (
                        <>
                            <span style={{ fontSize: '0.75rem', color: '#666' }}>
                                {stats.acceptanceRate}% accepted
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#444' }}>•</span>
                            <span style={{ fontSize: '0.75rem', color: '#666' }}>
                                {stats.totalReports} reports
                            </span>
                            {stats.avgResponseTime && (
                                <>
                                    <span style={{ fontSize: '0.75rem', color: '#444' }}>•</span>
                                    <span style={{ fontSize: '0.75rem', color: '#666' }}>
                                        ⏱ {stats.avgResponseTime} avg
                                    </span>
                                </>
                            )}
                        </>
                    )}

                    {showVault && (
                        <>
                            <span style={{ fontSize: '0.75rem', color: '#444' }}>•</span>
                            <span style={{
                                fontSize: '0.75rem',
                                color: parseFloat(stats.vaultBalance) > 1 ? '#00ff88' : '#ff6600',
                                fontWeight: '600'
                            }}>
                                🔒 {parseFloat(stats.vaultBalance).toFixed(2)} ETH escrow
                            </span>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // Full mode
    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <span style={{ fontSize: '1rem' }}>📊</span>
                <span>Organization Trust Score</span>
                <span style={{
                    marginLeft: 'auto',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: trust.color,
                    background: trust.bg,
                    border: `1px solid ${trust.color}30`,
                    padding: '0.2rem 0.7rem',
                    borderRadius: '10px'
                }}>
                    {trust.label}
                </span>
            </div>

            <div style={styles.grid}>
                {/* Acceptance Rate */}
                <div style={styles.statCard}>
                    <div style={styles.statIcon}>🛡️</div>
                    <div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#fff' }}>
                            {stats.acceptanceRate !== null ? `${stats.acceptanceRate}%` : '—'}
                        </div>
                        <div style={styles.statLabel}>Acceptance Rate</div>
                    </div>
                </div>

                {/* Avg Response */}
                <div style={styles.statCard}>
                    <div style={styles.statIcon}>⏱️</div>
                    <div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#fff' }}>
                            {stats.avgResponseTime || '—'}
                        </div>
                        <div style={styles.statLabel}>Avg Response</div>
                    </div>
                </div>

                {/* Dispute Rate */}
                <div style={styles.statCard}>
                    <div style={styles.statIcon}>⚖️</div>
                    <div>
                        <div style={{
                            fontSize: '1.3rem',
                            fontWeight: '700',
                            color: stats.disputeRate > 20 ? '#ff6600' : '#fff'
                        }}>
                            {stats.disputeRate !== null ? `${stats.disputeRate}%` : '—'}
                        </div>
                        <div style={styles.statLabel}>Dispute Rate</div>
                    </div>
                </div>

                {/* Vault Balance */}
                {showVault && (
                    <div style={styles.statCard}>
                        <div style={styles.statIcon}>💰</div>
                        <div>
                            <div style={{
                                fontSize: '1.3rem',
                                fontWeight: '700',
                                color: parseFloat(stats.vaultBalance) > 1 ? '#00ff88' : '#ff6600'
                            }}>
                                {parseFloat(stats.vaultBalance).toFixed(2)} ETH
                            </div>
                            <div style={styles.statLabel}>Vault Escrow</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail row */}
            <div style={styles.detailRow}>
                <span>📋 {stats.totalReports} total reports</span>
                <span style={{ color: '#333' }}>|</span>
                <span style={{ color: '#00ff88' }}>✅ {stats.validated} validated</span>
                <span style={{ color: '#333' }}>|</span>
                <span style={{ color: '#ff4444' }}>❌ {stats.rejected} rejected</span>
                <span style={{ color: '#333' }}>|</span>
                <span style={{ color: '#ff6600' }}>⚖️ {stats.disputed} disputed</span>
                {stats.payoutCount > 0 && (
                    <>
                        <span style={{ color: '#333' }}>|</span>
                        <span style={{ color: '#00f0ff' }}>💸 {stats.totalPaid} ETH paid out</span>
                    </>
                )}
            </div>

            <div style={styles.footer}>
                🔒 All metrics derived from immutable blockchain events
            </div>
        </div>
    );
}

const styles = {
    container: {
        background: 'rgba(10, 15, 25, 0.8)',
        border: '1px solid rgba(0, 240, 255, 0.1)',
        borderRadius: '12px',
        overflow: 'hidden'
    },
    compact: {
        padding: '0.5rem 0.8rem',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '8px',
        marginTop: '0.5rem'
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
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '1px',
        background: 'rgba(255,255,255,0.04)',
        margin: '0'
    },
    statCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1rem 1.25rem',
        background: 'rgba(10, 15, 25, 0.9)'
    },
    statIcon: {
        fontSize: '1.5rem',
        opacity: 0.8
    },
    statLabel: {
        fontSize: '0.75rem',
        color: '#666',
        marginTop: '0.1rem'
    },
    detailRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1.25rem',
        fontSize: '0.78rem',
        color: '#888',
        flexWrap: 'wrap',
        borderTop: '1px solid rgba(255,255,255,0.04)'
    },
    footer: {
        padding: '0.6rem 1.25rem',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        fontSize: '0.72rem',
        color: '#333',
        textAlign: 'center'
    }
};
