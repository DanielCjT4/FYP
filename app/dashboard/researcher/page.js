"use client";
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';
import AuditTrail from '../../components/AuditTrail';
import ReputationBadge from '../../components/ReputationBadge';
import { useWallet } from '../../contexts/WalletContext';
import styles from './researcher.module.css';

export default function ResearcherDashboard() {
    const { user, loading } = useAuth();
    const { account, contract, connectWallet, disconnectWallet } = useWallet();
    const [view, setView] = useState('my-submissions');
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [selectedProgram, setSelectedProgram] = useState(null);
    const [showDisputeModal, setShowDisputeModal] = useState(false);
    const [disputeReportId, setDisputeReportId] = useState(null);
    const [disputeReason, setDisputeReason] = useState('');
    const [disputeStatus, setDisputeStatus] = useState('');

    // Form Data
    const [formData, setFormData] = useState({ title: '', severity: 'None', description: '', collaborators: '' });
    const [cvssScore, setCvssScore] = useState(0.0); // 0.0–10.0

    // CVSS v3.1 helpers
    const getCvssLabel = (score) => {
        const s = parseFloat(score);
        if (s === 0) return 'None';
        if (s <= 3.9) return 'Low';
        if (s <= 6.9) return 'Medium';
        if (s <= 8.9) return 'High';
        return 'Critical';
    };
    const getCvssColor = (score) => {
        const s = parseFloat(score);
        if (s === 0) return '#888';
        if (s <= 3.9) return '#00ff88';
        if (s <= 6.9) return '#ffcc00';
        if (s <= 8.9) return '#ff8800';
        return '#ff003c';
    };
    const getCvssGradient = (score) => {
        const s = parseFloat(score);
        if (s === 0) return 'rgba(136,136,136,0.15)';
        if (s <= 3.9) return 'rgba(0,255,136,0.12)';
        if (s <= 6.9) return 'rgba(255,204,0,0.12)';
        if (s <= 8.9) return 'rgba(255,136,0,0.12)';
        return 'rgba(255,0,60,0.12)';
    };
    const handleCvssChange = (val) => {
        const score = parseFloat(val);
        setCvssScore(score);
        setFormData(prev => ({ ...prev, severity: getCvssLabel(score) }));
    };
    const [collaborators, setCollaborators] = useState([]); // [{ address: '', split: '' }]
    const [file, setFile] = useState(null);
    const [uploadingIPFS, setUploadingIPFS] = useState(false);

    const handleAddCollaborator = () => {
        setCollaborators([...collaborators, { address: '', split: '' }]);
    };

    const handleRemoveCollaborator = (index) => {
        setCollaborators(collaborators.filter((_, i) => i !== index));
    };

    const handleUpdateCollaborator = (index, field, value) => {
        const updated = collaborators.map((c, i) => {
            if (i === index) return { ...c, [field]: value };
            return c;
        });
        setCollaborators(updated);
    };
    const [ipfsCid, setIpfsCid] = useState('');
    const [submitStatus, setSubmitStatus] = useState('');

    // Dynamic Programs from DB (created by Organizations)
    const [programs, setPrograms] = useState([]);

    // Enrollment State
    const [enrollmentCounts, setEnrollmentCounts] = useState({}); // programId => count
    const [myEnrollments, setMyEnrollments] = useState({}); // programId => true/false
    const [expandedProgram, setExpandedProgram] = useState(null); // programId for showing participants
    const [programParticipants, setProgramParticipants] = useState([]); // wallet addresses
    const [enrollingId, setEnrollingId] = useState(null); // currently enrolling programId
    const [leavingId, setLeavingId] = useState(null); // currently leaving programId

    // Chat/Comments State
    const [chatReportId, setChatReportId] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [sendingChat, setSendingChat] = useState(false);
    const [loadingChat, setLoadingChat] = useState(false);
    const [auditReportId, setAuditReportId] = useState(null); // Currently expanded audit trail

    useEffect(() => {
        async function fetchPrograms() {
            if (!contract) return;
            try {
                const count = await contract.programCount();
                const total = Number(count);
                const activePrograms = [];
                for (let i = 1; i <= total; i++) {
                    const prog = await contract.programs(i);
                    const id = Number(prog.id);
                    if (id === 0 || !prog.active) continue;
                    // Parse IPFS details
                    let details = { name: `Program #${id}`, scopeType: 'Limited', inScope: '', outOfScope: '', focusAreas: '', safeHarbor: true, description: '', bountyLowMin: '0', bountyLowMax: '0', bountyMediumMin: '0', bountyMediumMax: '0', bountyHighMin: '0', bountyHighMax: '0', bountyCriticalMin: '0', bountyCriticalMax: '0', orgName: '', slaResponse: '', slaTriage: '', slaBounty: '', disclosurePolicy: '', assets: [], testingCredentials: '', trafficRules: '', exclusions: '' };
                    try {
                        const res = await fetch(`/api/ipfs/read?cid=${prog.detailsCid}`);
                        if (res.ok) details = { ...details, ...(await res.json()) };
                    } catch {}
                    activePrograms.push({
                        id,
                        name: details.name,
                        logo: details.name.charAt(0).toUpperCase(),
                        scopeType: details.scopeType || 'Limited',
                        inScope: details.inScope || details.scope || '',
                        outOfScope: details.outOfScope || '',
                        focusAreas: details.focusAreas || '',
                        safeHarbor: details.safeHarbor !== undefined ? details.safeHarbor : true,
                        description: details.description || '',
                        orgUsername: details.orgName || '',
                        orgAddress: prog.organization,
                        bounty: `${details.bountyCriticalMax || details.bountyHighMax || '0'} ETH`,
                        bountyLowMin: details.bountyLowMin || '0',
                        bountyLowMax: details.bountyLowMax || '0',
                        bountyMediumMin: details.bountyMediumMin || '0',
                        bountyMediumMax: details.bountyMediumMax || '0',
                        bountyHighMin: details.bountyHighMin || '0',
                        bountyHighMax: details.bountyHighMax || '0',
                        bountyCriticalMin: details.bountyCriticalMin || '0',
                        bountyCriticalMax: details.bountyCriticalMax || '0',
                        createdAt: prog.createdAt ? Number(prog.createdAt) : null,
                        // New SLA & brief fields
                        slaResponse: details.slaResponse || '',
                        slaTriage: details.slaTriage || '',
                        slaBounty: details.slaBounty || '',
                        disclosurePolicy: details.disclosurePolicy || '',
                        assets: Array.isArray(details.assets) ? details.assets : [],
                        testingCredentials: details.testingCredentials || '',
                        trafficRules: details.trafficRules || '',
                        exclusions: details.exclusions || ''
                    });
                }
                setPrograms(activePrograms);
            } catch (err) {
                console.error("Failed to fetch programs:", err);
            }
        }
        fetchPrograms();
    }, [contract]);

    // Fetch enrollment counts from smart contract
    useEffect(() => {
        async function fetchEnrollments() {
            if (!contract || programs.length === 0) return;
            const counts = {};
            const enrolled = {};
            for (const prog of programs) {
                try {
                    const count = await contract.getProgramResearcherCount(prog.id);
                    counts[prog.id] = Number(count);
                    if (account) {
                        const isEnr = await contract.isEnrolled(prog.id, account);
                        enrolled[prog.id] = isEnr;
                    }
                } catch { counts[prog.id] = 0; }
            }
            setEnrollmentCounts(counts);
            setMyEnrollments(enrolled);
        }
        fetchEnrollments();
    }, [contract, programs, account]);

    // Join a program on-chain
    const handleJoinProgram = async (programId) => {
        // Auto-connect wallet if not connected yet
        if (!account || !contract) {
            try {
                await connectWallet();
            } catch {
                return alert("Please connect your MetaMask wallet first.");
            }
            // After connecting, account/contract may still be null until re-render
            return alert("Wallet connected! Please click 'Join Program' again.");
        }
        setEnrollingId(programId);
        try {
            console.log("Joining program with ID:", programId);
            const tx = await contract.joinProgram(programId);
            await tx.wait();
            setMyEnrollments(prev => ({ ...prev, [programId]: true }));
            setEnrollmentCounts(prev => ({ ...prev, [programId]: (prev[programId] || 0) + 1 }));
        } catch (err) {
            console.error("Join program error:", err);
            if (err.reason) alert(err.reason);
            else if (err.message?.includes("user rejected")) alert("Transaction cancelled.");
            else alert("Enrollment failed. Check console for details.");
        } finally {
            setEnrollingId(null);
        }
    };

    // Leave a program on-chain
    const handleLeaveProgram = async (programId) => {
        if (!account || !contract) return alert("Wallet not connected.");
        setLeavingId(programId);
        try {
            console.log("Leaving program with ID:", programId);
            const tx = await contract.leaveProgram(programId);
            await tx.wait();
            setMyEnrollments(prev => {
                const next = { ...prev };
                delete next[programId];
                return next;
            });
            setEnrollmentCounts(prev => ({ ...prev, [programId]: Math.max(0, (prev[programId] || 0) - 1) }));
        } catch (err) {
            console.error("Leave program error:", err);
            if (err.reason) alert(err.reason);
            else if (err.message?.includes("user rejected")) alert("Transaction cancelled.");
            else alert("Unenrollment failed. Check console for details.");
        } finally {
            setLeavingId(null);
        }
    };

    // View participants for a program
    const handleViewParticipants = async (programId) => {
        if (expandedProgram === programId) { setExpandedProgram(null); return; }
        setExpandedProgram(programId);
        try {
            const addresses = await contract.getProgramResearchers(programId);
            setProgramParticipants(addresses);
        } catch { setProgramParticipants([]); }
    };

    // Open chat thread for a report (off-chain & decrypted)
    const openChat = async (reportId) => {
        if (chatReportId === reportId) { setChatReportId(null); return; }
        setChatReportId(reportId);
        setLoadingChat(true);
        setChatMessages([]);
        try {
            const res = await fetch(`/api/reports/discussion?reportId=${reportId}&userAddress=${account}&username=${user?.username}`);
            const data = await res.json();
            if (data.success && data.comments) {
                const msgs = data.comments.map(c => ({
                    sender: c.sender,
                    senderName: c.senderName,
                    text: c.text,
                    timestamp: c.timestamp,
                    isMe: c.sender.toLowerCase() === account?.toLowerCase() || c.sender.toLowerCase() === user?.username?.toLowerCase()
                }));
                setChatMessages(msgs);
            }
        } catch (err) { console.error('Chat load error:', err); }
        setLoadingChat(false);
    };

    // Send a comment off-chain (encrypted & fast)
    const handleSendComment = async (reportId) => {
        if (!chatInput.trim() || !account) return;
        setSendingChat(true);
        try {
            const res = await fetch('/api/reports/discussion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reportId,
                    sender: account,
                    senderName: user?.username || account,
                    text: chatInput.trim()
                })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Failed to send comment');

            setChatMessages(prev => [...prev, {
                sender: account,
                senderName: user?.username || account,
                text: chatInput.trim(),
                timestamp: Date.now(),
                isMe: true
            }]);
            setChatInput('');
        } catch (err) {
            console.error(err);
            alert('Failed to send comment. ' + err.message);
        }
        setSendingChat(false);
    };

    // Authentic Submissions Tracking
    const [submissions, setSubmissions] = useState([]);

    // Fetch persistent reports from local DB on mount
    useEffect(() => {
        async function fetchReports() {
            try {
                const res = await fetch("/api/reports");
                const data = await res.json();
                if (data.success && data.reports) {
                    const userReports = data.reports.filter(r => 
                        r.researcher?.toLowerCase() === user?.username?.toLowerCase() || 
                        r.researcher?.toLowerCase() === account?.toLowerCase() ||
                        (Array.isArray(r.collaborators) && r.collaborators.some(collab => {
                            const address = typeof collab === 'string' ? collab : (collab?.address || '');
                            return address.toLowerCase() === user?.username?.toLowerCase() || 
                                   address.toLowerCase() === account?.toLowerCase();
                        }))
                    );
                    
                    const formatted = userReports.map(r => ({
                        id: r.id,
                        program: r.program,
                        date: r.timestamp ? r.timestamp.split('T')[0] : "Unknown",
                        status: r.status,
                        statusLabel: r.status.charAt(0).toUpperCase() + r.status.slice(1)
                    })).reverse();
                    
                    setSubmissions(formatted);
                }
            } catch (err) {
                console.error("Failed to fetch persistent reports:", err);
            }
        }
        
        if (user || account) {
            fetchReports();
        }
    }, [user, account]);

    // Helpers
    const getStatusColor = (status) => {
        switch (status) {
            case 'submitted': return '#888';
            case 'under_review': return '#FFD700';
            case 'triaged': return '#00f0ff';
            case 'resolved': return '#00ff88';
            case 'rejected': return '#ff003c';
            default: return '#fff';
        }
    };

    const handleFileChange = async (e) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setIpfsCid('');
        }
    };

    const handleSubmitReport = async (e) => {
        e.preventDefault();
        
        if (!contract || !account) {
            alert("Wallet not connected or contract not initialized.");
            return;
        }
        
        if (!file) {
            alert("Please select a file to attach.");
            return;
        }

        try {
            let finalCid = ipfsCid;
            
            // 0. Upload to IPFS first
            if (!finalCid) {
                setSubmitStatus('Uploading File to IPFS...');
                setUploadingIPFS(true);
                
                const ipfsFormData = new FormData();
                ipfsFormData.append("file", file);

                const res = await fetch("/api/ipfs", {
                    method: "POST",
                    body: ipfsFormData,
                });

                const data = await res.json();
                
                if (data.IpfsHash) {
                    finalCid = data.IpfsHash;
                    setIpfsCid(finalCid);
                } else {
                    throw new Error(data.error || "Unknown IPFS error");
                }
                setUploadingIPFS(false);
            }

            setSubmitStatus('Checking Wallet Registration...');
            
            // 1. Check if user is registered as a Researcher on the blockchain
            const userProfile = await contract.users(account);
            if (Number(userProfile.role) !== 1) { // 1 = Role.Researcher
                setSubmitStatus('Registering Wallet as Researcher...');
                const regTx = await contract.registerUser(1, user?.username || "Researcher", "");
                await regTx.wait();
            }

            // Ensure a target program is selected so we don't send to a null address
            if (!selectedProgram) {
                alert("Please select a target Bounty Program before submitting your report.");
                setSubmitStatus('');
                setUploadingIPFS(false);
                return;
            }
            // Validate and parse dynamic collaborators & splits
            const validCollabs = collaborators.filter(c => c.address.trim() !== '' && c.split !== '');
            const collabAddresses = validCollabs.map(c => c.address.trim());
            const collabSplits = validCollabs.map(c => Number(c.split));

            const totalSplitPercent = collabSplits.reduce((sum, s) => sum + s, 0);
            if (totalSplitPercent > 100) {
                alert("The total collaborator split percentages cannot exceed 100%!");
                setSubmitStatus('');
                setUploadingIPFS(false);
                return;
            }

            setSubmitStatus('Awaiting Signature (Check MetaMask)...');
            
            // 2. Call the submitReport function on the Smart Contract
            const tx = await contract.submitReport(
                selectedProgram.orgAddress,
                finalCid,
                collabAddresses,
                collabSplits
            );
            
            setSubmitStatus('Mining Transaction...');
            
            // 3. Wait for the blockchain to mine the block (Gas Fee spent)
            const receipt = await tx.wait();
            
            let blockchainId;
            for (const log of receipt.logs) {
                try {
                    const parsed = contract.interface.parseLog(log);
                    if (parsed && parsed.name === 'ReportSubmitted') {
                        blockchainId = Number(parsed.args[0]);
                        break;
                    }
                } catch(e) { }
            }
            setSubmitStatus('Saving to Database...');

            // 4. Send the finalized Blockchain data + CID to the Backend to persist in db.json
            const dbRes = await fetch("/api/reports/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: formData.title,
                    description: formData.description,
                    severity: formData.severity,
                    cvssScore: cvssScore,
                    program: selectedProgram?.name || "Unknown",
                    researcher: user?.username || account,
                    id: blockchainId,
                    cid: finalCid,
                    txHash: receipt.hash,
                    organization: selectedProgram.orgAddress,
                    collaborators: validCollabs
                })
            });

            if (!dbRes.ok) throw new Error("Database mapping failed");
            
            const dbData = await dbRes.json();
            
            setSubmitStatus('Report Submitted to Chain & DB!');
            
            // Wait a moment then close and update UI
            setTimeout(() => {
                setShowSubmitModal(false);
                setSubmitStatus('');
                setIpfsCid('');
                setFile(null);
                setFormData({ title: '', severity: 'None', description: '', collaborators: '' });
                setCollaborators([]);
                setCvssScore(0.0);
                
                const newVisibleSub = {
                    id: dbData.report.id,
                    program: dbData.report.program,
                    date: dbData.report.timestamp.split('T')[0],
                    status: dbData.report.status,
                    statusLabel: 'Submitted'
                };
                
                setSubmissions([newVisibleSub, ...submissions]);
            }, 2000);

        } catch (error) {
            console.error("Blockchain Submission Failed:", error);
            
            if (error.reason) {
                alert(`Transaction Failed: ${error.reason}`);
            } else if (error.message && error.message.includes("user rejected")) {
                alert("Transaction Cancelled by User");
            } else {
                alert(`Transaction Failed: ${error.message || "Unknown error"}`);
            }
            setSubmitStatus('');
            setUploadingIPFS(false);
        }
    };

    const handleDispute = async (e) => {
        e.preventDefault();
        if (!contract || !account) return alert("Wallet not connected");
        if (!disputeReason) return;
        
        setDisputeStatus("Uploading Claim to IPFS...");
        try {
            const blob = new Blob([JSON.stringify({ reason: disputeReason, researcher: user?.username })], { type: 'application/json' });
            const disputeFormData = new FormData();
            disputeFormData.append("file", blob, "dispute.json");
            
            const ipfsRes = await fetch("/api/ipfs", { method: "POST", body: disputeFormData });
            const ipfsData = await ipfsRes.json();
            const disputeCid = ipfsData.IpfsHash;

            setDisputeStatus("Executing Smart Contract (Gas)...");
            const tx = await contract.raiseDispute(disputeReportId, disputeCid);
            await tx.wait();

            setDisputeStatus("Updating Global DB...");
            await fetch("/api/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reportId: disputeReportId, 
                    status: 'disputed',
                    disputeCid: disputeCid,
                    txHash: tx.hash
                })
            });

            const updated = submissions.map(s => s.id === disputeReportId ? { ...s, status: 'disputed', statusLabel: 'Disputed' } : s);
            setSubmissions(updated);
            
            setShowDisputeModal(false);
            setDisputeReason('');
            setDisputeReportId(null);
        } catch (error) {
            console.error(error);
            alert("Dispute generation failed");
        } finally {
            setDisputeStatus('');
        }
    };

    const StatusBadge = ({ status, label }) => (
        <span style={{
            background: `${getStatusColor(status)}20`,
            color: getStatusColor(status),
            padding: '0.3rem 0.8rem',
            borderRadius: '20px',
            fontSize: '0.85rem',
            border: `1px solid ${getStatusColor(status)}40`
        }}>
            {label}
        </span>
    );

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#888' }}>
                <h2>Loading Profile...</h2>
            </div>
        );
    }

    if (!user || user.role !== 'Researcher') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⛔</div>
                <h1 style={{ fontSize: '2.5rem', color: '#ff003c', marginBottom: '1rem', fontWeight: '800', letterSpacing: '-1px' }}>Unauthorized Access</h1>
                <p style={{ fontSize: '1.1rem', color: '#888', marginBottom: '2rem' }}>You do not have the required "Researcher" role to view this dashboard.</p>
                <button onClick={() => window.location.href = '/'} style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Return to Home
                </button>
            </div>
        );
    }

    return (
        <div className={`page-content ${styles.pageContainer}`}>
            <Navbar />

            {/* A. Menu Items */}
            <div className={styles.stickyNav}>
                <div className={`container ${styles.navContainer}`}>
                    <div className={styles.navTabs}>
                        {['Bounty Programs', 'My Submissions', 'Wallet/Earnings'].map(item => {
                            const key = item.toLowerCase().replace(/ /g, '-').replace('/', '-');
                            return (
                                <button
                                    key={key}
                                    onClick={() => setView(key)}
                                    className={`${styles.tabButton} ${view === key ? styles.tabButtonActive : ''}`}
                                >
                                    {item}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className={`container ${styles.contentContainer}`}>

                {/* VIEW: BOUNTY PROGRAMS */}
                {view === 'bounty-programs' && (
                    <div className={styles.programList}>
                        {programs.length === 0 ? (
                            <div className={`glass ${styles.emptyState}`}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                                <h3 style={{ color: '#fff', margin: '0 0 0.5rem' }}>No Active Programs</h3>
                                <p style={{ color: '#666', margin: 0 }}>No organizations have active bounty programs yet.</p>
                            </div>
                        ) : programs.map(prog => (
                            <div key={prog.id} className={`glass ${styles.programCard}`}>
                                <div className={styles.programCardBody}>
                                    <div className={styles.programHeader}>
                                        <div className={styles.programTitleGroup}>
                                            <div className={styles.programLogo}>
                                                {prog.logo}
                                            </div>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{prog.name}</h3>
                                                <span style={{ fontSize: '0.8rem', color: '#666' }}>by {prog.orgUsername || 'Organization'}</span>
                                            </div>
                                        </div>
                                        <span className={styles.programBounty}>Up to {prog.bounty}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0' }}>
                                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', color: '#ddd' }}>{prog.scopeType} Scope</span>
                                        {prog.safeHarbor && <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'rgba(0,255,136,0.1)', borderRadius: '4px', color: '#00ff88' }}>🛡️ Safe Harbor</span>}
                                    </div>
                                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px', marginBottom: '0.5rem' }}>
                                        <p style={{ color: '#aaa', margin: '0', fontSize: '0.85rem' }}><strong>In-Scope:</strong> {prog.inScope}</p>
                                        {prog.outOfScope && <p style={{ color: '#ff4444', margin: '0.3rem 0 0', fontSize: '0.85rem' }}><strong>Off-Limits:</strong> {prog.outOfScope}</p>}
                                        {prog.focusAreas && <p style={{ color: '#00f0ff', margin: '0.3rem 0 0', fontSize: '0.85rem' }}><strong>Focus Areas:</strong> {prog.focusAreas}</p>}
                                    </div>
                                    {prog.description && <p style={{ color: '#555', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>{prog.description}</p>}

                                    {/* On-Chain Reputation Badge */}
                                    {prog.orgAddress && (
                                        <ReputationBadge contract={contract} orgAddress={prog.orgAddress} compact={true} />
                                    )}

                                    {/* Enrolled Partner View details */}
                                    {myEnrollments[prog.id] && (
                                        <div style={{
                                            marginTop: '1.25rem',
                                            padding: '1.25rem',
                                            borderRadius: '8px',
                                            background: 'rgba(0, 240, 255, 0.03)',
                                            border: '1px dashed rgba(0, 240, 255, 0.3)',
                                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                                            textAlign: 'left'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid rgba(0, 240, 255, 0.1)', paddingBottom: '0.5rem' }}>
                                                <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#00f0ff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    🔑 Enrolled Partner Details
                                                </h4>
                                                <span style={{ fontSize: '0.7rem', color: '#ffaa00', fontFamily: 'monospace' }}>
                                                    Created: {prog.createdAt ? new Date(prog.createdAt * 1000).toLocaleDateString() : 'Unknown'}
                                                </span>
                                            </div>

                                            {/* Organization Details */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                                                <div>
                                                    <span style={{ color: '#888' }}>🏢 Host Organization:</span>{' '}
                                                    <strong style={{ color: '#fff' }}>{prog.orgUsername || 'Verified Org'}</strong>
                                                </div>
                                                <div>
                                                    <span style={{ color: '#888' }}>⛓️ On-Chain Signer Wallet:</span>{' '}
                                                    <code style={{ color: '#ffaa00', background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                                        {prog.orgAddress}
                                                    </code>
                                                </div>
                                            </div>

                                            {/* SLA Badges */}
                                            {(prog.slaResponse || prog.slaTriage || prog.slaBounty) && (
                                                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem', fontWeight: 'bold' }}>⏱️ Response SLAs</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                        {prog.slaResponse && (
                                                            <div style={{ padding: '0.4rem 0.75rem', background: 'rgba(0,240,255,0.08)', border: '1px solid rgba(0,240,255,0.2)', borderRadius: '4px', fontSize: '0.8rem' }}>
                                                                <div style={{ color: '#666', fontSize: '0.65rem', textTransform: 'uppercase' }}>First Response</div>
                                                                <div style={{ color: '#00f0ff', fontWeight: '600' }}>{prog.slaResponse}</div>
                                                            </div>
                                                        )}
                                                        {prog.slaTriage && (
                                                            <div style={{ padding: '0.4rem 0.75rem', background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.2)', borderRadius: '4px', fontSize: '0.8rem' }}>
                                                                <div style={{ color: '#666', fontSize: '0.65rem', textTransform: 'uppercase' }}>Triage</div>
                                                                <div style={{ color: '#ffaa00', fontWeight: '600' }}>{prog.slaTriage}</div>
                                                            </div>
                                                        )}
                                                        {prog.slaBounty && (
                                                            <div style={{ padding: '0.4rem 0.75rem', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '4px', fontSize: '0.8rem' }}>
                                                                <div style={{ color: '#666', fontSize: '0.65rem', textTransform: 'uppercase' }}>Bounty Paid</div>
                                                                <div style={{ color: '#00ff88', fontWeight: '600' }}>{prog.slaBounty}</div>
                                                            </div>
                                                        )}
                                                        {prog.disclosurePolicy && (
                                                            <div style={{ padding: '0.4rem 0.75rem', background: 'rgba(255,0,60,0.08)', border: '1px solid rgba(255,0,60,0.2)', borderRadius: '4px', fontSize: '0.8rem' }}>
                                                                <div style={{ color: '#666', fontSize: '0.65rem', textTransform: 'uppercase' }}>Disclosure</div>
                                                                <div style={{ color: '#ff6688', fontWeight: '600' }}>{prog.disclosurePolicy}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Asset Scope Table (dynamic) or fallback text */}
                                            {prog.assets && prog.assets.length > 0 ? (
                                                <div style={{ marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.75rem' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem', fontWeight: 'bold' }}>🏗️ Asset Scope Table</div>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                                {['Identifier', 'Type', 'Tier', 'Eligible'].map(h => (
                                                                    <th key={h} style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: '#666', fontWeight: '600', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {prog.assets.map((asset, idx) => (
                                                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                                    <td style={{ padding: '0.4rem 0.5rem', color: '#00f0ff', fontFamily: 'monospace', fontSize: '0.8rem' }}>{asset.identifier}</td>
                                                                    <td style={{ padding: '0.4rem 0.5rem', color: '#ddd' }}>{asset.type}</td>
                                                                    <td style={{ padding: '0.4rem 0.5rem', color: asset.tier?.includes('Tier 1') ? '#ff003c' : asset.tier?.includes('Tier 2') ? '#ffaa00' : '#00ff88', fontSize: '0.75rem' }}>{asset.tier}</td>
                                                                    <td style={{ padding: '0.4rem 0.5rem' }}>
                                                                        <span style={{ color: asset.eligible ? '#00ff88' : '#ff4444', fontWeight: '600', fontSize: '0.75rem' }}>{asset.eligible ? '✅ Yes' : '🚫 No'}</span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div style={{ marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.75rem' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.35rem', fontWeight: 'bold' }}>🎯 Scope</div>
                                                    <p style={{ color: '#aaa', margin: 0, fontSize: '0.85rem' }}><strong style={{ color: '#00f0ff' }}>In-Scope:</strong> {prog.inScope || '—'}</p>
                                                    {prog.outOfScope && <p style={{ color: '#ff4444', margin: '0.3rem 0 0', fontSize: '0.85rem' }}><strong>Off-Limits:</strong> {prog.outOfScope}</p>}
                                                    {prog.focusAreas && <p style={{ color: '#00f0ff', margin: '0.3rem 0 0', fontSize: '0.85rem' }}><strong>Focus Areas:</strong> {prog.focusAreas}</p>}
                                                </div>
                                            )}

                                            {/* Bounty Reward Structure Table */}
                                            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem' }}>
                                                <div style={{ fontSize: '0.75rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem', fontWeight: 'bold' }}>🏆 Authorized Bounty Reward Tiers</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.5rem', textAlign: 'center' }}>
                                                    <div style={{ background: 'rgba(255, 0, 60, 0.08)', border: '1px solid rgba(255, 0, 60, 0.2)', borderRadius: '4px', padding: '0.4rem 0.2rem' }}>
                                                        <div style={{ fontSize: '0.65rem', color: '#ff003c', fontWeight: '700' }}>CRITICAL</div>
                                                        <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 'bold', marginTop: '0.2rem' }}>
                                                            {prog.bountyCriticalMin === prog.bountyCriticalMax 
                                                                ? (prog.bountyCriticalMin || '0') 
                                                                : `${prog.bountyCriticalMin || '0'} - ${prog.bountyCriticalMax || '0'}`} ETH
                                                        </div>
                                                    </div>
                                                    <div style={{ background: 'rgba(255, 170, 0, 0.08)', border: '1px solid rgba(255, 170, 0, 0.2)', borderRadius: '4px', padding: '0.4rem 0.2rem' }}>
                                                        <div style={{ fontSize: '0.65rem', color: '#ffaa00', fontWeight: '700' }}>HIGH</div>
                                                        <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 'bold', marginTop: '0.2rem' }}>
                                                            {prog.bountyHighMin === prog.bountyHighMax 
                                                                ? (prog.bountyHighMin || '0') 
                                                                : `${prog.bountyHighMin || '0'} - ${prog.bountyHighMax || '0'}`} ETH
                                                        </div>
                                                    </div>
                                                    <div style={{ background: 'rgba(0, 240, 255, 0.08)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '4px', padding: '0.4rem 0.2rem' }}>
                                                        <div style={{ fontSize: '0.65rem', color: '#00f0ff', fontWeight: '700' }}>MEDIUM</div>
                                                        <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 'bold', marginTop: '0.2rem' }}>
                                                            {prog.bountyMediumMin === prog.bountyMediumMax 
                                                                ? (prog.bountyMediumMin || '0') 
                                                                : `${prog.bountyMediumMin || '0'} - ${prog.bountyMediumMax || '0'}`} ETH
                                                        </div>
                                                    </div>
                                                    <div style={{ background: 'rgba(0, 255, 136, 0.08)', border: '1px solid rgba(0, 255, 136, 0.2)', borderRadius: '4px', padding: '0.4rem 0.2rem' }}>
                                                        <div style={{ fontSize: '0.65rem', color: '#00ff88', fontWeight: '700' }}>LOW</div>
                                                        <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 'bold', marginTop: '0.2rem' }}>
                                                            {prog.bountyLowMin === prog.bountyLowMax 
                                                                ? (prog.bountyLowMin || '0') 
                                                                : `${prog.bountyLowMin || '0'} - ${prog.bountyLowMax || '0'}`} ETH
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Testing Guidelines */}
                                            {(prog.testingCredentials || prog.trafficRules) && (
                                                <div style={{ marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.75rem' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem', fontWeight: 'bold' }}>🧪 Testing Guidelines</div>
                                                    {prog.testingCredentials && (
                                                        <div style={{ marginBottom: '0.5rem' }}>
                                                            <div style={{ fontSize: '0.7rem', color: '#ffaa00', marginBottom: '0.2rem' }}>Test Credentials &amp; Accounts</div>
                                                            <p style={{ color: '#ccc', margin: 0, fontSize: '0.82rem', lineHeight: '1.5' }}>{prog.testingCredentials}</p>
                                                        </div>
                                                    )}
                                                    {prog.trafficRules && (
                                                        <div>
                                                            <div style={{ fontSize: '0.7rem', color: '#ffaa00', marginBottom: '0.2rem' }}>Traffic &amp; Automation Rules</div>
                                                            <p style={{ color: '#ccc', margin: 0, fontSize: '0.82rem', lineHeight: '1.5' }}>{prog.trafficRules}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Exclusions */}
                                            {prog.exclusions && (
                                                <div style={{ marginBottom: '1rem', background: 'rgba(255,0,60,0.04)', border: '1px solid rgba(255,0,60,0.12)', borderRadius: '6px', padding: '0.75rem' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#ff4444', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.4rem', fontWeight: 'bold' }}>🚫 Do Not Report (Exclusions)</div>
                                                    <p style={{ color: '#ccc', margin: 0, fontSize: '0.82rem', lineHeight: '1.5' }}>{prog.exclusions}</p>
                                                </div>
                                            )}

                                            {/* Submissions Instruction */}
                                            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#aaa', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <span>🛡️</span>
                                                <span>Safe harbor active. Submit your findings using the <strong>Submit Report</strong> button.</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Enrollment + Actions Row */}
                                    <div className={styles.actionRow}>
                                        <button
                                            onClick={() => handleViewParticipants(prog.id)}
                                            className={styles.participantsToggle}
                                        >
                                            👥 {enrollmentCounts[prog.id] || 0} researchers enrolled
                                            <span style={{ fontSize: '0.7rem' }}>{expandedProgram === prog.id ? '▲' : '▼'}</span>
                                        </button>
                                        <div className={styles.buttonGroup}>
                                            {!myEnrollments[prog.id] ? (
                                                <button
                                                    onClick={() => handleJoinProgram(prog.id)}
                                                    disabled={enrollingId === prog.id}
                                                    className={styles.joinButton}
                                                    style={{ opacity: enrollingId === prog.id ? 0.5 : 1 }}
                                                >
                                                    {enrollingId === prog.id ? '⏳ Joining...' : '🔗 Join Program'}
                                                </button>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <span className={styles.enrolledBadge}>
                                                        ✅ Enrolled
                                                    </span>
                                                    <button
                                                        onClick={() => handleLeaveProgram(prog.id)}
                                                        disabled={leavingId === prog.id}
                                                        style={{ 
                                                            padding: '0.4rem 0.8rem',
                                                            borderRadius: '6px',
                                                            background: 'rgba(255, 50, 50, 0.1)',
                                                            color: '#ff4d4d',
                                                            border: '1px solid rgba(255, 50, 50, 0.2)',
                                                            cursor: leavingId === prog.id ? 'not-allowed' : 'pointer',
                                                            fontSize: '0.85rem',
                                                            fontWeight: '600',
                                                            opacity: leavingId === prog.id ? 0.5 : 1,
                                                            transition: 'all 0.2s ease'
                                                        }}
                                                        onMouseOver={(e) => {
                                                            if (leavingId !== prog.id) {
                                                                e.currentTarget.style.background = 'rgba(255, 50, 50, 0.2)';
                                                            }
                                                        }}
                                                        onMouseOut={(e) => {
                                                            if (leavingId !== prog.id) {
                                                                e.currentTarget.style.background = 'rgba(255, 50, 50, 0.1)';
                                                            }
                                                        }}
                                                    >
                                                        {leavingId === prog.id ? '⏳ Leaving...' : '🚪 Leave'}
                                                    </button>
                                                </div>
                                            )}
                                            <button
                                                className={`btn-primary ${styles.submitButton}`}
                                                onClick={() => { setSelectedProgram(prog); setShowSubmitModal(true); }}
                                                disabled={!myEnrollments[prog.id]}
                                                title={!myEnrollments[prog.id] ? "You must join this program before submitting a report" : ""}
                                                style={{ 
                                                    opacity: !myEnrollments[prog.id] ? 0.5 : 1, 
                                                    cursor: !myEnrollments[prog.id] ? 'not-allowed' : 'pointer',
                                                    filter: !myEnrollments[prog.id] ? 'grayscale(100%)' : 'none'
                                                }}
                                            >
                                                {myEnrollments[prog.id] ? 'Submit Report' : '🔒 Enroll to Submit'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Participants List */}
                                {expandedProgram === prog.id && (
                                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem 2rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem' }}>Enrolled Researchers</div>
                                        {programParticipants.length === 0 ? (
                                            <p style={{ color: '#555', fontSize: '0.85rem', margin: 0 }}>No researchers enrolled yet. Be the first!</p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                {programParticipants.map((addr, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0' }}>
                                                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: `hsl(${(i * 67) % 360}, 60%, 40%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#fff', fontWeight: '700', flexShrink: 0 }}>
                                                            {i + 1}
                                                        </div>
                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: addr.toLowerCase() === account?.toLowerCase() ? '#00ff88' : '#aaa' }}>
                                                            {addr.substring(0, 6)}...{addr.substring(38)}
                                                            {addr.toLowerCase() === account?.toLowerCase() && ' (You)'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* VIEW: MY SUBMISSIONS (Critical View) */}
                {view === 'my-submissions' && (
                    <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                        <h2 className="gradient-text" style={{ marginBottom: '1.5rem' }}>Submission Tracking</h2>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ color: '#888', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                                    <th style={{ padding: '1rem' }}>Report ID</th>
                                    <th style={{ padding: '1rem' }}>Program</th>
                                    <th style={{ padding: '1rem' }}>Submitted Date</th>
                                    <th style={{ padding: '1rem' }}>Status</th>
                                    <th style={{ padding: '1rem', textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map(sub => (
                                    <React.Fragment key={sub.id}>
                                        <tr style={{ borderBottom: chatReportId === sub.id ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '1rem', fontFamily: 'monospace' }}>#{sub.id}</td>
                                            <td style={{ padding: '1rem' }}>{sub.program}</td>
                                            <td style={{ padding: '1rem', color: '#aaa' }}>{sub.date}</td>
                                            <td style={{ padding: '1rem' }}>
                                                <StatusBadge status={sub.status} label={sub.statusLabel} />
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={() => openChat(sub.id)}
                                                    style={{
                                                        background: chatReportId === sub.id ? 'rgba(0,240,255,0.1)' : 'transparent',
                                                        border: '1px solid rgba(0,240,255,0.3)',
                                                        color: 'var(--primary)',
                                                        padding: '0.3rem 0.8rem',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8rem'
                                                    }}
                                                >
                                                    💬 Chat
                                                </button>
                                                {sub.status === 'rejected' && (
                                                    <button 
                                                        onClick={() => { setDisputeReportId(sub.id); setShowDisputeModal(true); }}
                                                        style={{
                                                            background: 'transparent',
                                                            border: '1px solid #ff003c',
                                                            color: '#ff003c',
                                                            padding: '0.3rem 0.8rem',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            fontSize: '0.8rem'
                                                        }}
                                                    >
                                                        Dispute
                                                    </button>
                                                )}
                                                {sub.status === 'resolved' && (
                                                    <span style={{ color: '#00ff88', fontSize: '0.8rem', padding: '0.3rem 0' }}>✅ Paid</span>
                                                )}
                                                <button
                                                    onClick={() => setAuditReportId(auditReportId === sub.id ? null : sub.id)}
                                                    style={{
                                                        background: auditReportId === sub.id ? 'rgba(0,240,255,0.1)' : 'transparent',
                                                        border: '1px solid rgba(0,240,255,0.15)',
                                                        color: '#888',
                                                        padding: '0.3rem 0.8rem',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8rem'
                                                    }}
                                                >
                                                    🔗 Audit
                                                </button>
                                            </td>
                                        </tr>
                                        {/* Inline Chat Thread */}
                                        {chatReportId === sub.id && (
                                            <tr><td colSpan="5" style={{ padding: 0 }}>
                                                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,240,255,0.1)', borderRadius: '0 0 12px 12px', padding: '1.25rem', margin: '0 0.5rem 0.5rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                        <div style={{ fontSize: '0.85rem', color: '#888' }}>💬 Discussion with Organization — Report #{sub.id}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#00ff88' }}>🔒 Securely Encrypted Off-Chain</div>
                                                    </div>
                                                    <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 0' }}>
                                                        {loadingChat ? (
                                                            <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>Loading messages...</div>
                                                        ) : chatMessages.length === 0 ? (
                                                            <div style={{ textAlign: 'center', color: '#555', padding: '2rem' }}>No messages yet. Start the conversation with the Organization.</div>
                                                        ) : chatMessages.map((msg, i) => (
                                                            <div key={i} style={{ display: 'flex', justifyContent: msg.isMe ? 'flex-end' : 'flex-start' }}>
                                                                <div style={{
                                                                    maxWidth: '70%', padding: '0.6rem 1rem', borderRadius: '12px',
                                                                    background: msg.isMe ? 'rgba(0,240,255,0.1)' : 'rgba(255,255,255,0.05)',
                                                                    border: msg.isMe ? '1px solid rgba(0,240,255,0.2)' : '1px solid rgba(255,255,255,0.06)'
                                                                }}>
                                                                    <div style={{ fontSize: '0.7rem', color: msg.isMe ? '#00f0ff' : '#a855f7', marginBottom: '0.25rem' }}>
                                                                        {msg.isMe ? 'You' : 'Organization'} • {new Date(msg.timestamp).toLocaleString()}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.9rem', color: '#ddd' }}>{msg.text}</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <input
                                                            type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                                                            onKeyDown={e => e.key === 'Enter' && !sendingChat && handleSendComment(sub.id)}
                                                            placeholder="Type a message... (securely encrypted off-chain)"
                                                            style={{ flex: 1, padding: '0.7rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                                                        />
                                                        <button
                                                            onClick={() => handleSendComment(sub.id)}
                                                            disabled={sendingChat || !chatInput.trim()}
                                                            style={{ padding: '0.7rem 1.2rem', borderRadius: '8px', background: 'var(--primary)', color: '#000', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem', opacity: sendingChat ? 0.5 : 1 }}
                                                        >
                                                            {sendingChat ? '⏳' : 'Send'}
                                                        </button>
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#00ff88', marginTop: '0.5rem' }}>🔒 Securely encrypted with AES-256-GCM. Zero gas, zero wait time.</div>
                                                </div>
                                            </td></tr>
                                        )}
                                    {/* Audit Trail Row */}
                                    {auditReportId === sub.id && (
                                        <tr><td colSpan="5" style={{ padding: '0 0.5rem 1rem' }}>
                                            <AuditTrail contract={contract} reportId={sub.id} account={account} />
                                        </td></tr>
                                    )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* VIEW: WALLET & EARNINGS */}
                {view === 'wallet-earnings' && (
                    <WalletEarningsView account={account} contract={contract} user={user} submissions={submissions} connectWallet={connectWallet} />
                )}

            </div>

            {/* C. Action View: "Submit Report" (Modal) */}
            {showSubmitModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
                    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="glass" style={{ width: '600px', padding: '2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0 }}>Submit Report: <span style={{ color: 'var(--primary)' }}>{selectedProgram?.name}</span></h2>
                            <button onClick={() => setShowSubmitModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                        </div>

                        <form onSubmit={handleSubmitReport}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Title</label>
                                <input
                                    type="text"
                                    className="glass"
                                    style={{ width: '100%', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px' }}
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    required
                                />
                            </div>

                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.75rem', fontSize: '0.9rem' }}>CVSS v3.1 Score</label>
                                {/* Score display badge */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem',
                                    padding: '0.75rem 1rem', borderRadius: '8px',
                                    background: getCvssGradient(cvssScore),
                                    border: `1px solid ${getCvssColor(cvssScore)}33`,
                                    transition: 'all 0.3s ease'
                                }}>
                                    <div style={{ textAlign: 'center', minWidth: '60px' }}>
                                        <div style={{ fontSize: '1.8rem', fontWeight: '800', color: getCvssColor(cvssScore), lineHeight: 1, fontFamily: 'monospace', transition: 'color 0.3s' }}>
                                            {cvssScore.toFixed(1)}
                                        </div>
                                        <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '0.2rem' }}>Score</div>
                                    </div>
                                    <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '1rem' }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: '700', color: getCvssColor(cvssScore), transition: 'color 0.3s' }}>
                                            {getCvssLabel(cvssScore)}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.1rem' }}>
                                            {cvssScore === 0 ? 'No security impact' :
                                             cvssScore <= 3.9 ? 'Limited impact, low exploitability' :
                                             cvssScore <= 6.9 ? 'Moderate impact, some complexity' :
                                             cvssScore <= 8.9 ? 'Significant impact, low complexity' :
                                             'Full system compromise possible'}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#555', textAlign: 'right', minWidth: '90px' }}>
                                        {cvssScore === 0 ? '0.0' : cvssScore <= 3.9 ? '0.1 – 3.9' : cvssScore <= 6.9 ? '4.0 – 6.9' : cvssScore <= 8.9 ? '7.0 – 8.9' : '9.0 – 10.0'}
                                    </div>
                                </div>
                                {/* CVSS Slider */}
                                <div style={{ position: 'relative', padding: '0 0.25rem' }}>
                                    <input
                                        type="range"
                                        min="0" max="10" step="0.1"
                                        value={cvssScore}
                                        onChange={e => handleCvssChange(e.target.value)}
                                        style={{
                                            width: '100%', height: '6px', cursor: 'pointer',
                                            appearance: 'none', outline: 'none', borderRadius: '3px',
                                            background: `linear-gradient(to right, ${getCvssColor(cvssScore)} 0%, ${getCvssColor(cvssScore)} ${cvssScore * 10}%, rgba(255,255,255,0.1) ${cvssScore * 10}%, rgba(255,255,255,0.1) 100%)`,
                                            accentColor: getCvssColor(cvssScore)
                                        }}
                                    />
                                    {/* Severity markers */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.65rem', color: '#555' }}>
                                        <span style={{ color: '#888' }}>0.0<br/>None</span>
                                        <span style={{ color: '#00ff88', marginLeft: '18%' }}>3.9<br/>Low</span>
                                        <span style={{ color: '#ffcc00' }}>6.9<br/>Med</span>
                                        <span style={{ color: '#ff8800' }}>8.9<br/>High</span>
                                        <span style={{ color: '#ff003c' }}>10.0<br/>Crit</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Description</label>
                                <textarea
                                    className="glass"
                                    style={{ width: '100%', minHeight: '100px', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px' }}
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    required
                                />
                            </div>

                            <div style={{ marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.06)', padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.1)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', color: '#aaa', fontSize: '0.9rem', fontWeight: '600' }}>👥 Co-Submitters & Splits</label>
                                    <button
                                        type="button"
                                        onClick={handleAddCollaborator}
                                        style={{ background: 'rgba(0,240,255,0.1)', color: 'var(--primary)', border: '1px solid rgba(0,240,255,0.3)', borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                        + Add Collaborator
                                    </button>
                                </div>

                                {collaborators.length === 0 ? (
                                    <p style={{ color: '#555', fontSize: '0.8rem', margin: '0.5rem 0' }}>No collaborators added. You will receive 100% of the bounty reward.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {collaborators.map((c, index) => (
                                            <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                <input
                                                    type="text"
                                                    className="glass"
                                                    style={{ flex: 1, padding: '0.6rem', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace' }}
                                                    placeholder="Collaborator Wallet (0x...)"
                                                    value={c.address}
                                                    onChange={e => handleUpdateCollaborator(index, 'address', e.target.value)}
                                                    required
                                                />
                                                <input
                                                    type="number"
                                                    className="glass"
                                                    min="1"
                                                    max="99"
                                                    style={{ width: '80px', padding: '0.6rem', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', textAlign: 'center' }}
                                                    placeholder="Split %"
                                                    value={c.split}
                                                    onChange={e => handleUpdateCollaborator(index, 'split', e.target.value)}
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveCollaborator(index)}
                                                    style={{ background: 'transparent', border: 'none', color: '#ff003c', fontSize: '1.2rem', cursor: 'pointer', padding: '0 0.5rem' }}
                                                >
                                                    &times;
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ marginBottom: '2rem', border: '2px dashed rgba(255,255,255,0.1)', padding: '2rem', textAlign: 'center', borderRadius: '8px', cursor: 'pointer' }}>
                                <input type="file" onChange={handleFileChange} style={{ display: 'none' }} id="file-upload" />
                                <label htmlFor="file-upload" style={{ cursor: 'pointer' }}>
                                    {uploadingIPFS ? (
                                        <span style={{ color: 'var(--primary)' }}>Uploading to IPFS...</span>
                                    ) : ipfsCid ? (
                                        <span style={{ color: '#00ff88' }}>CID Generated: {ipfsCid.substring(0, 10)}...</span>
                                    ) : file ? (
                                        <span style={{ color: '#00ff88' }}>Ready to Upload: {file.name}</span>
                                    ) : (
                                        <span style={{ color: '#aaa' }}>Drag & Drop PDF or Click to Browse</span>
                                    )}
                                </label>
                            </div>

                            {!account ? (
                                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                                    <p style={{ color: '#ffaa00', marginBottom: '1rem' }}>You must connect your blockchain wallet to sign this submission.</p>
                                    <button
                                        type="button"
                                        onClick={() => connectWallet(user?.role)}
                                        className="btn-secondary"
                                        style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}
                                    >
                                        Connect Wallet
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}
                                    disabled={!file || uploadingIPFS || submitStatus !== ''}
                                >
                                    {submitStatus ? submitStatus : "Sign & Submit (Gas Required)"}
                                </button>
                            )}
                        </form>
                    </div>
                </div>
            )}

            {/* D. Dispute Modal */}
            {showDisputeModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
                    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="glass" style={{ width: '500px', padding: '2rem', borderRadius: '12px', border: '1px solid rgba(255,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, color: '#ff003c' }}>Dispute Rejection</h2>
                            <button onClick={() => { setShowDisputeModal(false); setDisputeReason(''); setDisputeStatus(''); }} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                        </div>
                        
                        <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                            By raising a dispute, a decentralized Tribunal of Security Validators will randomly audit this report. Your claim will be permanently stored on IPFS.
                        </p>

                        <form onSubmit={handleDispute}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Your Claim against Organization</label>
                                <textarea
                                    className="glass"
                                    style={{ width: '100%', minHeight: '120px', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem' }}
                                    placeholder="Explain why the Organization's rejection is unfair..."
                                    value={disputeReason}
                                    onChange={e => setDisputeReason(e.target.value)}
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', background: '#ff003c', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '1rem' }}
                                disabled={!!disputeStatus}
                            >
                                {disputeStatus ? disputeStatus : "Submit Dispute Request (Gas Fee)"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Wallet & Earnings Sub-Component ───
function WalletEarningsView({ account, contract, user, submissions, connectWallet }) {
    const [ethBalance, setEthBalance] = useState(null);
    const [onChainProfile, setOnChainProfile] = useState(null);
    const [payouts, setPayouts] = useState([]);
    const [totalEarned, setTotalEarned] = useState('0');
    const [loadingProfile, setLoadingProfile] = useState(true);

    const fetchWalletData = async () => {
        setLoadingProfile(true);
        try {
            const provider = contract.runner?.provider || new ethers.BrowserProvider(window.ethereum);

            // 1. Fetch ETH Balance
            const bal = await provider.getBalance(account);
            setEthBalance(ethers.formatEther(bal));

            // 2. Fetch on-chain profile
            const profile = await contract.users(account);
            setOnChainProfile({
                role: Number(profile[0]),
                name: profile[1],
                profileCid: profile[2],
                isRegistered: profile[3]
            });

            // 3. Fetch payout history from PayoutReleased events
            try {
                const filter = contract.filters.PayoutReleased(null, account, null, null);
                const events = await contract.queryFilter(filter);
                const payoutList = events.map(e => ({
                    reportId: Number(e.args[0]),
                    validator: e.args[2],
                    amount: ethers.formatEther(e.args[3]),
                    txHash: e.transactionHash,
                    blockNumber: e.blockNumber
                }));
                setPayouts(payoutList);
                const total = payoutList.reduce((sum, p) => sum + parseFloat(p.amount), 0);
                setTotalEarned(total.toFixed(4));
            } catch {
                // PayoutReleased event may not exist yet
                setPayouts([]);
            }

        } catch (err) {
            console.error("Wallet data fetch error:", err);
        }
        setLoadingProfile(false);
    };

    useEffect(() => {
        const load = async () => {
            await Promise.resolve();
            if (!account || !contract) {
                setLoadingProfile(false);
                return;
            }
            await fetchWalletData();
        };
        load();
    }, [account, contract]);

    const roleNames = ['None', 'Researcher', 'Organization', 'Validator'];
    const resolvedCount = submissions.filter(s => s.status === 'resolved').length;
    const rejectedCount = submissions.filter(s => s.status === 'rejected').length;
    const disputedCount = submissions.filter(s => s.status === 'disputed').length;
    const successRate = submissions.length > 0 ? Math.round((resolvedCount / submissions.length) * 100) : 0;

    if (!account) {
        return (
            <div className="glass" style={{ padding: '4rem', textAlign: 'center', borderRadius: '16px', maxWidth: '600px', margin: '0 auto' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</div>
                <h2 style={{ color: '#fff', marginBottom: '1rem' }}>Wallet Auto-Connected</h2>
                <p style={{ color: '#aaa', marginBottom: '2rem', lineHeight: '1.6' }}>
                    Your wallet should connect automatically. If not, click below to reconnect.
                </p>
                <button onClick={() => connectWallet(user?.role)} className="btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
                    Reconnect Wallet
                </button>
            </div>
        );
    }

    if (loadingProfile) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }}>⛓️</div>
                Loading on-chain data...
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* ── Row 1: Identity Card + Balance ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Identity Card */}
                <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{
                            width: '50px', height: '50px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.5rem', fontWeight: 'bold', color: '#fff'
                        }}>
                            {onChainProfile?.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                            <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff' }}>
                                {onChainProfile?.name || user?.username || 'Unknown'}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>
                                {onChainProfile ? roleNames[onChainProfile.role] : user?.role} • Verified On-Chain
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.25rem' }}>Wallet Address</div>
                            <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#ccc', wordBreak: 'break-all' }}>{account}</div>
                        </div>
                        {onChainProfile?.profileCid && (
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.25rem' }}>IPFS Profile CID</div>
                                <a
                                    href={`/api/ipfs/read?cid=${onChainProfile.profileCid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--primary)', wordBreak: 'break-all' }}
                                >
                                    {onChainProfile.profileCid}
                                </a>
                            </div>
                        )}
                    </div>
                </div>

                {/* Balance Card */}
                <div className="glass" style={{ padding: '2rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '0.5rem' }}>Current Balance</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-1px' }}>
                        <span className="gradient-text">{ethBalance ? parseFloat(ethBalance).toFixed(4) : '0.0000'}</span>
                    </div>
                    <div style={{ fontSize: '1rem', color: '#888', marginBottom: '1.5rem' }}>ETH</div>
                    <div style={{
                        background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)',
                        borderRadius: '8px', padding: '0.6rem 1.2rem', fontSize: '0.85rem', color: '#00ff88'
                    }}>
                        💰 Total Earned: {totalEarned} ETH
                    </div>
                </div>
            </div>

            {/* ── Row 2: Stats Grid ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                {[
                    { label: 'Reports Submitted', value: submissions.length, icon: '📄', color: 'var(--primary)' },
                    { label: 'Resolved', value: resolvedCount, icon: '✅', color: '#00ff88' },
                    { label: 'Success Rate', value: `${successRate}%`, icon: '📊', color: '#a855f7' },
                    { label: 'Disputes Raised', value: disputedCount, icon: '⚖️', color: '#ff003c' },
                ].map((stat, i) => (
                    <div key={i} className="glass" style={{ padding: '1.5rem', borderRadius: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '800', color: stat.color, letterSpacing: '-1px' }}>{stat.value}</div>
                        <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '0.25rem' }}>{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* ── Row 3: Payout History ── */}
            <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                <h3 style={{ margin: '0 0 1.5rem', color: '#fff', fontSize: '1.1rem' }}>
                    💸 Payout History
                </h3>
                {payouts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#555' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🏦</div>
                        <p style={{ margin: 0 }}>No bounty payouts received yet.</p>
                        <p style={{ fontSize: '0.85rem', color: '#444', marginTop: '0.5rem' }}>
                            Payouts appear here after an Organization validates and rewards your report.
                        </p>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ color: '#666', borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                <th style={{ padding: '0.75rem 1rem' }}>Report</th>
                                <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                                <th style={{ padding: '0.75rem 1rem' }}>TX Hash</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Block</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payouts.map((p, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>#{p.reportId}</td>
                                    <td style={{ padding: '0.75rem 1rem', color: '#00ff88', fontWeight: '600' }}>{p.amount} ETH</td>
                                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#888' }}>
                                        {p.txHash.substring(0, 10)}...{p.txHash.substring(58)}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#666' }}>#{p.blockNumber}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
