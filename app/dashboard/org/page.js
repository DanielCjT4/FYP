"use client";
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';
import AuditTrail from '../../components/AuditTrail';
import ReputationBadge from '../../components/ReputationBadge';
import { useWallet } from '../../contexts/WalletContext';
import styles from './org.module.css';

function getExtensionFromMime(mimeType) {
    if (!mimeType) return '';
    const cleanMime = mimeType.toLowerCase().trim().split(';')[0];
    
    const mimeMap = {
        'application/pdf': '.pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-excel': '.xls',
        'text/plain': '.txt',
        'text/html': '.html',
        'application/json': '.json',
        'application/zip': '.zip',
        'application/x-zip-compressed': '.zip',
        'application/x-tar': '.tar',
        'application/x-rar-compressed': '.rar',
        'application/x-7z-compressed': '.7z',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
        'video/quicktime': '.mov'
    };
    
    if (mimeMap[cleanMime]) {
        return mimeMap[cleanMime];
    }
    
    const parts = cleanMime.split('/');
    if (parts.length === 2) {
        const subtype = parts[1];
        if (/^[a-zA-Z0-9]+$/.test(subtype)) {
            return `.${subtype}`;
        }
    }
    return '';
}

export default function OrgDashboard() {
    const { user } = useAuth();
    const { account, contract, connectWallet, disconnectWallet } = useWallet();
    const [view, setView] = useState('inbox'); // 'inbox', 'program-settings', 'financials'
    const [selectedReport, setSelectedReport] = useState(null);

    // ──── Financials State ────
    const [balance, setBalance] = useState("0.00");
    const [payoutHistory, setPayoutHistory] = useState([]);
    const [liabilities, setLiabilities] = useState(0);
    const [vaultBalance, setVaultBalance] = useState("0");
    const [vaultDepositAmount, setVaultDepositAmount] = useState("");

    // Live Database Tracking
    const [reports, setReports] = useState([]);

    // Fetch persistent reports from local DB on mount
    useEffect(() => {
        async function fetchReports() {
            try {
                const res = await fetch("/api/reports");
                const data = await res.json();
                if (data.success && data.reports) {
                    // For prototype: show all reports to the organization
                    const formatted = data.reports.map(r => ({
                        id: r.id,
                        severity: r.severity,
                        cvssScore: r.cvssScore || null,
                        date: r.timestamp ? r.timestamp.split('T')[0] : "Unknown",
                        locked: r.status === 'submitted',
                        title: r.title,
                        description: r.description,
                        status: r.status,
                        researcher: r.researcher || "Unknown",
                        collaborators: r.collaborators || [],
                        cid: r.cid,
                        txHash: r.txHash,
                        program: r.program || "Unknown",
                        ipfsContent: `CID: ${r.cid}\nTX: ${r.txHash}\nDesc: ${r.description}`
                    })).reverse();
                    setReports(formatted);
                }
            } catch (err) {
                console.error("Failed to fetch reports:", err);
            }
        }
        fetchReports();
    }, []);

    // Proof of Concept Preview States
    const [pocType, setPocType] = useState(null);
    const [pocUrl, setPocUrl] = useState(null);       // blob: URL (safe for preview & download)
    const [pocBlob, setPocBlob] = useState(null);     // raw Blob cached to avoid re-fetching
    const [pocFilename, setPocFilename] = useState('poc_evidence');
    const [detectingPoc, setDetectingPoc] = useState(false);
    const [pocExtension, setPocExtension] = useState('');
    const [downloading, setDownloading] = useState(false);

    // Download from the already-cached blob — zero additional Pinata requests
    const handleDownloadPoC = (filename) => {
        if (!pocBlob || downloading) return;
        setDownloading(true);
        try {
            const objectUrl = URL.createObjectURL(pocBlob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = filename || pocFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Small delay before revoking so the browser has time to start the download
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
        } catch (err) {
            console.error('Download failed:', err);
            alert('Download failed. The file could not be saved.');
        } finally {
            setDownloading(false);
        }
    };

    useEffect(() => {
        // Revoke previous blob URL to free memory
        if (pocUrl && pocUrl.startsWith('blob:')) {
            URL.revokeObjectURL(pocUrl);
        }
        setPocType(null);
        setPocUrl(null);
        setPocBlob(null);
        setPocExtension('');

        if (!selectedReport || !selectedReport.cid) return;

        setDetectingPoc(true);

        async function fetchAndCachePoc() {
            // Single GET request — decrypts on server and returns raw bytes
            const apiUrl = `/api/ipfs/read?cid=${selectedReport.cid}`;
            try {
                const response = await fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}${response.status === 429 ? ' — Pinata rate limit hit. Wait a moment and re-open the report.' : ''}`);
                }

                const contentType = response.headers.get('content-type') || 'application/octet-stream';
                const ext = getExtensionFromMime(contentType);
                setPocExtension(ext);

                const blob = await response.blob();
                setPocBlob(blob);

                // Create a local blob: URL for preview (never hits Pinata again)
                const blobUrl = URL.createObjectURL(blob);
                setPocUrl(blobUrl);

                if (contentType.startsWith('image/')) {
                    setPocType('image');
                } else if (contentType.startsWith('video/')) {
                    setPocType('video');
                } else if (contentType.includes('pdf')) {
                    setPocType('pdf');
                } else {
                    setPocType('other');
                }
            } catch (e) {
                console.error('Failed to load PoC:', e);
                setPocType('error');
                setPocExtension('');
                // Store the error message for display
                setPocFilename(e.message || 'Unknown error');
            } finally {
                setDetectingPoc(false);
            }
        }
        fetchAndCachePoc();

        // Cleanup blob URL when component unmounts or report changes
        return () => {
            setPocUrl(prev => {
                if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                return null;
            });
        };
    }, [selectedReport]);


    // Workflow State for Selected Report (if unlocked)
    const [workflowState, setWorkflowState] = useState('assessment');
    const [rejectionReason, setRejectionReason] = useState('');
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [bountyAmount, setBountyAmount] = useState('');
    const [actionStatus, setActionStatus] = useState('');

    // ──── Program Settings State ────
    const [programs, setPrograms] = useState([]);
    const [showCreateProgram, setShowCreateProgram] = useState(false);
    const [editingProgramId, setEditingProgramId] = useState(null); // null = create mode, number = edit mode
    const [programForm, setProgramForm] = useState({
        name: '', scopeType: 'Limited', inScope: '', outOfScope: '', focusAreas: '', safeHarbor: true, description: '',
        // CVSS-range bounty config: min/max ETH per tier
        bountyLowMin: '', bountyLowMax: '',
        bountyMediumMin: '', bountyMediumMax: '',
        bountyHighMin: '', bountyHighMax: '',
        bountyCriticalMin: '', bountyCriticalMax: '',
        // SLA Fields
        slaResponse: '2 business days', slaTriage: '5 business days', slaBounty: '14 business days after triage',
        disclosurePolicy: 'Coordinated Disclosure',
        assets: [],
        testingCredentials: '', trafficRules: '',
        exclusions: ''
    });

    const EMPTY_FORM = {
        name: '', scopeType: 'Limited', inScope: '', outOfScope: '', focusAreas: '', safeHarbor: true, description: '',
        bountyLowMin: '', bountyLowMax: '',
        bountyMediumMin: '', bountyMediumMax: '',
        bountyHighMin: '', bountyHighMax: '',
        bountyCriticalMin: '', bountyCriticalMax: '',
        slaResponse: '2 business days', slaTriage: '5 business days', slaBounty: '14 business days after triage',
        disclosurePolicy: 'Coordinated Disclosure', assets: [], testingCredentials: '', trafficRules: '', exclusions: ''
    };

    const handleAddAsset = () => {
        setProgramForm(prev => ({
            ...prev,
            assets: [...(prev.assets || []), { identifier: '', type: 'Web App', tier: 'Tier 1 (Mission Critical)', eligible: true }]
        }));
    };

    const handleRemoveAsset = (idx) => {
        setProgramForm(prev => ({ ...prev, assets: prev.assets.filter((_, i) => i !== idx) }));
    };

    const handleUpdateAsset = (idx, field, value) => {
        setProgramForm(prev => ({
            ...prev,
            assets: prev.assets.map((a, i) => i === idx ? { ...a, [field]: value } : a)
        }));
    };

    const handleEditProgram = (prog) => {
        setEditingProgramId(prog.id);
        setProgramForm({
            name: prog.name || '',
            scopeType: prog.scopeType || 'Limited',
            inScope: prog.inScope || '',
            outOfScope: prog.outOfScope || '',
            focusAreas: prog.focusAreas || '',
            safeHarbor: prog.safeHarbor !== undefined ? prog.safeHarbor : true,
            description: prog.description || '',
            // Support both old single-value and new min/max format
            bountyLowMin: prog.bountyLowMin || '',
            bountyLowMax: prog.bountyLowMax || '',
            bountyMediumMin: prog.bountyMediumMin || '',
            bountyMediumMax: prog.bountyMediumMax || '',
            bountyHighMin: prog.bountyHighMin || '',
            bountyHighMax: prog.bountyHighMax || '',
            bountyCriticalMin: prog.bountyCriticalMin || '',
            bountyCriticalMax: prog.bountyCriticalMax || '',
            slaResponse: prog.slaResponse || '2 business days',
            slaTriage: prog.slaTriage || '5 business days',
            slaBounty: prog.slaBounty || '14 business days after triage',
            disclosurePolicy: prog.disclosurePolicy || 'Coordinated Disclosure',
            assets: prog.assets || [],
            testingCredentials: prog.testingCredentials || '',
            trafficRules: prog.trafficRules || '',
            exclusions: prog.exclusions || ''
        });
        setShowCreateProgram(true);
    };

    const handleCancelEdit = () => {
        setEditingProgramId(null);
        setProgramForm(EMPTY_FORM);
        setShowCreateProgram(false);
    };

    // ──── Enrollment & Chat State ────
    const [enrollmentCounts, setEnrollmentCounts] = useState({});
    const [expandedProgram, setExpandedProgram] = useState(null);
    const [programParticipants, setProgramParticipants] = useState([]);
    const [chatReportId, setChatReportId] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [sendingChat, setSendingChat] = useState(false);
    const [loadingChat, setLoadingChat] = useState(false);

    // Fetch enrollment counts when programs load
    useEffect(() => {
        async function fetchEnrollments() {
            if (!contract || programs.length === 0) return;
            const counts = {};
            for (const prog of programs) {
                try {
                    const count = await contract.getProgramResearcherCount(prog.id);
                    counts[prog.id] = Number(count);
                } catch { counts[prog.id] = 0; }
            }
            setEnrollmentCounts(counts);
        }
        fetchEnrollments();
    }, [contract, programs]);

    const handleViewParticipants = async (programId) => {
        if (expandedProgram === programId) { setExpandedProgram(null); return; }
        setExpandedProgram(programId);
        try {
            const addresses = await contract.getProgramResearchers(programId);
            setProgramParticipants(addresses);
        } catch { setProgramParticipants([]); }
    };

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

    // Fetch Programs from Blockchain + IPFS
    useEffect(() => {
        async function fetchPrograms() {
            if (!contract) return;
            try {
                const count = await contract.programCount();
                const total = Number(count);
                const progs = [];
                for (let i = 1; i <= total; i++) {
                    const prog = await contract.programs(i);
                    const id = Number(prog.id);
                    if (id === 0) continue;
                    // Parse IPFS details
                    let details = { name: `Program #${id}`, scopeType: 'Limited', inScope: '', outOfScope: '', focusAreas: '', safeHarbor: true, description: '', bountyLowMin: '', bountyLowMax: '', bountyMediumMin: '', bountyMediumMax: '', bountyHighMin: '', bountyHighMax: '', bountyCriticalMin: '', bountyCriticalMax: '', slaResponse: '', slaTriage: '', slaBounty: '', disclosurePolicy: '', assets: [], testingCredentials: '', trafficRules: '', exclusions: '' };
                    try {
                        const res = await fetch(`/api/ipfs/read?cid=${prog.detailsCid}`);
                        if (res.ok) {
                            const ipfsData = await res.json();
                            // Migrate old single-value bounty to min/max if needed

                            details = { ...details, ...ipfsData };
                        }
                    } catch {}
                    progs.push({
                        id,
                        name: details.name,
                        organization: prog.organization,
                        active: prog.active,
                        detailsCid: prog.detailsCid,
                        scopeType: details.scopeType,
                        inScope: details.inScope,
                        outOfScope: details.outOfScope,
                        focusAreas: details.focusAreas,
                        safeHarbor: details.safeHarbor,
                        description: details.description,
                        // Support both legacy and new CVSS min/max format
                        bountyLowMin: details.bountyLowMin || '',
                        bountyLowMax: details.bountyLowMax || '',
                        bountyMediumMin: details.bountyMediumMin || '',
                        bountyMediumMax: details.bountyMediumMax || '',
                        bountyHighMin: details.bountyHighMin || '',
                        bountyHighMax: details.bountyHighMax || '',
                        bountyCriticalMin: details.bountyCriticalMin || '',
                        bountyCriticalMax: details.bountyCriticalMax || '',
                        slaResponse: details.slaResponse,
                        slaTriage: details.slaTriage,
                        slaBounty: details.slaBounty,
                        disclosurePolicy: details.disclosurePolicy,
                        assets: details.assets || [],
                        testingCredentials: details.testingCredentials,
                        trafficRules: details.trafficRules,
                        exclusions: details.exclusions,
                        createdAt: new Date(Number(prog.createdAt) * 1000).toISOString()
                    });
                }
                // Only show programs that belong to the currently connected org wallet
                const myProgs = account
                    ? progs.filter(p => p.organization?.toLowerCase() === account.toLowerCase())
                    : progs;
                setPrograms(myProgs);
            } catch (err) {
                console.error("Failed to fetch programs:", err);
            }
        }
        fetchPrograms();
    }, [contract, account]);

    // ──── Financials: single consolidated fetch ────
    const [financialsLoaded, setFinancialsLoaded] = useState(false);

    useEffect(() => {
        async function fetchFinancials() {
            if (!account || !contract || !window.ethereum) return;
            try {
                // 1. Live ETH Balance
                const provider = new ethers.BrowserProvider(window.ethereum);
                const bal = await provider.getBalance(account);
                setBalance(ethers.formatEther(bal));

                // 2. Vault Escrow Balance from Smart Contract
                const vault = await contract.orgVaults(account);
                setVaultBalance(ethers.formatEther(vault));

                // 3. Payout History from DB
                const res = await fetch("/api/payouts");
                const data = await res.json();
                if (data.success) {
                    const history = data.payouts.filter(p => p.orgWallet?.toLowerCase() === account.toLowerCase());
                    setPayoutHistory(history.reverse());
                }

                setFinancialsLoaded(true);
            } catch (err) {
                console.error("Error fetching financials:", err);
            }
        }
        fetchFinancials();
    }, [account, contract]);

    // Re-fetch balance when user navigates to financials tab (to get latest)
    useEffect(() => {
        async function refreshBalance() {
            if (view === 'financials' && account && window.ethereum) {
                try {
                    const provider = new ethers.BrowserProvider(window.ethereum);
                    const bal = await provider.getBalance(account);
                    setBalance(ethers.formatEther(bal));
                    if (contract) {
                        const vault = await contract.orgVaults(account);
                        setVaultBalance(ethers.formatEther(vault));
                    }
                } catch (err) {
                    console.error("Balance refresh error:", err);
                }
            }
        }
        refreshBalance();
    }, [view]);

    // Calculate Estimated Liabilities based on active reports
    useEffect(() => {
        // Find reports that are triaged or validated, rough estimate of 1.5 ETH per report
        const pendingReports = reports.filter(r => r.status === 'triaged' || r.status === 'validated');
        setLiabilities(pendingReports.length * 1.5);
    }, [reports]);

    const handleCreateProgram = async () => {
        if (!programForm.name || !programForm.inScope) return alert("Name and In-Scope Targets are required.");
        if (!account || !contract) return alert("Wallet not connected.");
        setActionStatus("Uploading program to IPFS...");
        try {
            // 1. Upload details to IPFS
            const details = { ...programForm, orgName: user?.username, createdAt: new Date().toISOString() };
            const blob = new Blob([JSON.stringify(details)], { type: 'application/json' });
            const fd = new FormData();
            fd.append('file', blob, 'program_details.json');
            const ipfsRes = await fetch('/api/ipfs', { method: 'POST', body: fd });
            const ipfsData = await ipfsRes.json();
            if (!ipfsData.IpfsHash) throw new Error('IPFS upload failed');

            // 2. Create on-chain
            setActionStatus("Confirm transaction in MetaMask...");
            const tx = await contract.createProgram(ipfsData.IpfsHash);
            await tx.wait();

            // 3. Add to local state
            const count = await contract.programCount();
            const newProg = {
                id: Number(count),
                ...details,
                active: true,
                organization: account,
                detailsCid: ipfsData.IpfsHash
            };
            setPrograms([...programs, newProg]);
            setProgramForm(EMPTY_FORM);
            setShowCreateProgram(false);
        } catch (err) {
            console.error(err);
            if (err.reason) alert(err.reason);
            else if (err.message?.includes("user rejected")) alert("Transaction cancelled.");
            else alert("Failed to create program.");
        } finally { setActionStatus(""); }
    };

    const handleUpdateProgram = async () => {
        if (!programForm.name || !programForm.inScope) return alert("Name and In-Scope Targets are required.");
        if (!account || !contract || !editingProgramId) return alert("Wallet not connected or no program selected.");
        setActionStatus("Uploading updated details to IPFS...");
        try {
            // 1. Upload new details to IPFS
            const details = { ...programForm, orgName: user?.username, updatedAt: new Date().toISOString() };
            const blob = new Blob([JSON.stringify(details)], { type: 'application/json' });
            const fd = new FormData();
            fd.append('file', blob, 'program_details.json');
            const ipfsRes = await fetch('/api/ipfs', { method: 'POST', body: fd });
            const ipfsData = await ipfsRes.json();
            if (!ipfsData.IpfsHash) throw new Error('IPFS upload failed');

            // 2. Update on-chain CID
            setActionStatus("Confirm transaction in MetaMask...");
            const tx = await contract.updateProgram(editingProgramId, ipfsData.IpfsHash);
            await tx.wait();

            // 3. Update local state
            setPrograms(programs.map(p => p.id === editingProgramId ? { ...p, ...details, detailsCid: ipfsData.IpfsHash } : p));
            handleCancelEdit();
            alert('Program updated successfully!');
        } catch (err) {
            console.error(err);
            if (err.reason) alert(err.reason);
            else if (err.message?.includes("user rejected")) alert("Transaction cancelled.");
            else alert("Failed to update program.");
        } finally { setActionStatus(""); }
    };

    const handleToggleProgram = async (id, currentActive) => {
        if (!account || !contract) return alert("Wallet not connected.");
        setActionStatus("Toggling program...");
        try {
            const tx = await contract.toggleProgram(id);
            await tx.wait();
            setPrograms(programs.map(p => p.id === id ? { ...p, active: !currentActive } : p));
        } catch (err) {
            console.error(err);
            if (err.reason) alert(err.reason);
            else alert("Toggle failed.");
        } finally { setActionStatus(""); }
    };

    const handleUnlock = async (id) => {
        // Simulate "Proof of View" transaction on-chain, but persist to DB
        const updated = reports.map(r => r.id === id ? { ...r, locked: false, status: 'under_review' } : r);
        setReports(updated);
        const report = updated.find(r => r.id === id);
        setSelectedReport(report);
        setWorkflowState('assessment');

        try {
            await fetch("/api/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportId: id, status: 'under_review' })
            });
        } catch (e) {
            console.error("Failed to update status to under review", e);
        }
    };

    const handleAccept = async () => {
        if (!account || !contract) return alert("Wallet disconnected");
        setActionStatus("Signing acceptance...");
        try {
            const tx = await contract.updateStatus(selectedReport.id, 2); // 2: Validated
            await tx.wait();

            await fetch("/api/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportId: selectedReport.id, status: 'triaged', txHash: tx.hash })
            });
            const updated = reports.map(r => r.id === selectedReport.id ? { ...r, status: 'triaged' } : r);
            setReports(updated);
            setWorkflowState('remediation');
        } catch (e) {
            console.error(e); alert("Failed taking action");
        } finally { setActionStatus(""); }
    };

    const handleReject = async () => {
        if (!rejectionReason) return alert("Reason required");
        if (!account || !contract) return alert("Wallet disconnected");

        setActionStatus("Uploading Reason to IPFS...");
        try {
            const blob = new Blob([JSON.stringify({ reason: rejectionReason, org: user?.username })], { type: 'application/json' });
            const formData = new FormData();
            formData.append("file", blob, "rejection.json");

            const ipfsRes = await fetch("/api/ipfs", { method: "POST", body: formData });
            const ipfsData = await ipfsRes.json();
            const rejectCid = ipfsData.IpfsHash;

            setActionStatus("Executing Smart Contract (Gas)...");
            const tx = await contract.rejectReport(selectedReport.id, rejectCid);
            await tx.wait();

            setActionStatus("Updating Global DB...");
            await fetch("/api/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reportId: selectedReport.id,
                    status: 'rejected',
                    rejectionCid: rejectCid,
                    txHash: tx.hash
                })
            });

            const updated = reports.map(r => r.id === selectedReport.id ? { ...r, status: 'rejected' } : r);
            setReports(updated);
            setShowRejectModal(false);
            setSelectedReport(null);

        } catch (error) {
            console.error(error);
            alert("Tx Failed");
        } finally {
            setActionStatus('');
        }
    };

    const handleResolve = () => setWorkflowState('payout');

    const handlePay = async () => {
        if (!account || !bountyAmount || !contract) return alert("Provide a valid bounty amount.");
        setActionStatus("Releasing Funds From Vault...");
        try {
            const amountInWei = ethers.parseEther(bountyAmount.toString());
            const tx = await contract.payBounty(selectedReport.id, amountInWei);
            await tx.wait();

            // Log the payout for financials
            await fetch("/api/payouts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orgWallet: account,
                    researcherWallet: selectedReport.researcher,
                    amountEth: bountyAmount,
                    reportId: selectedReport.id,
                    txHash: tx.hash
                })
            });

            // Update status
            await fetch("/api/reports", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportId: selectedReport.id, status: 'resolved' })
            });

            setActionStatus("Payment Released Successfully!");

            // Refresh Vault
            const val = await contract.orgVaults(account);
            setVaultBalance(ethers.formatEther(val));

            setTimeout(() => {
                setSelectedReport(null);
                setActionStatus("");
            }, 2000);
        } catch (error) {
            console.error(error);
            alert("Payment failed! Make sure your Vault has sufficient ETH deposited.");
            setActionStatus("");
        }
    };

    const handleFundVault = async () => {
        if (!vaultDepositAmount || isNaN(vaultDepositAmount)) return alert("Enter amount");
        setActionStatus("Locking ETH in Vault...");
        try {
            const val = ethers.parseEther(vaultDepositAmount);
            const tx = await contract.fundVault({ value: val });
            await tx.wait();
            setVaultDepositAmount("");

            // Refresh both Vault and Treasury Balance
            const newVal = await contract.orgVaults(account);
            setVaultBalance(ethers.formatEther(newVal));

            const provider = new ethers.BrowserProvider(window.ethereum);
            const bal = await provider.getBalance(account);
            setBalance(ethers.formatEther(bal));
        } catch (e) {
            console.error(e);
            alert("Failed to fund vault");
        } finally { setActionStatus(""); }
    };

    return (
        <div className={`page-content ${styles.pageContainer}`}>
            <Navbar />

            {/* Top Navigation */}
            <div className={styles.stickyNav}>
                <div className={`container ${styles.navContainer}`}>
                    {['Inbox', 'Program Settings', 'Financials'].map(item => {
                        const key = item.toLowerCase().replace(' ', '-');
                        return (
                            <button
                                key={key}
                                onClick={() => { setView(key); setSelectedReport(null); }}
                                className={`${styles.tabButton} ${view === key && !selectedReport ? styles.tabButtonActive : ''}`}
                            >
                                {item}
                            </button>
                        );
                    })}
                    {selectedReport && (
                        <div className={styles.workspaceHeader}>
                            &gt; Report Workstation #{selectedReport.id}
                        </div>
                    )}
                </div>
            </div>

            {/* Wallet Connection Banner */}
            {!account && (
                <div className="container" style={{ paddingBottom: 0 }}>
                    <div className="glass" style={{
                        padding: '1.5rem 2rem',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 170, 0, 0.25)',
                        background: 'rgba(255, 170, 0, 0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1.5rem',
                        flexWrap: 'wrap'
                    }}>
                        <div>
                            <h4 style={{ margin: '0 0 0.3rem', color: '#ffaa00', fontSize: '1rem' }}>⚠️ Wallet Not Connected</h4>
                            <p style={{ margin: 0, color: '#888', fontSize: '0.85rem' }}>
                                Connect your MetaMask wallet to access blockchain features — manage reports, create programs, and handle financials.
                            </p>
                        </div>
                        <button
                            onClick={() => connectWallet('Organization')}
                            className="btn-primary"
                            style={{ padding: '0.7rem 1.8rem', whiteSpace: 'nowrap', fontSize: '0.9rem' }}
                        >
                            🔗 Connect Wallet
                        </button>
                    </div>
                </div>
            )}

            {/* Connected Wallet Indicator */}
            {account && (
                <div className="container" style={{ paddingBottom: 0 }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.6rem 1rem',
                        borderRadius: '8px',
                        background: 'rgba(0, 255, 136, 0.04)',
                        border: '1px solid rgba(0, 255, 136, 0.12)',
                        fontSize: '0.8rem',
                        color: '#00ff88'
                    }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ff88', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                        <span>Connected:</span>
                        <span style={{ fontFamily: 'monospace', color: '#aaa' }}>
                            {account.substring(0, 6)}...{account.substring(38)}
                        </span>
                        <button
                            onClick={disconnectWallet}
                            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}
                        >
                            Disconnect
                        </button>
                    </div>
                </div>
            )}

            <div className={`container ${styles.contentContainer}`}>

                {/* VIEW: INBOX */}
                {view === 'inbox' && !selectedReport && (
                    <div className={styles.inboxList}>
                        {reports.length === 0 ? (
                            <div className={`glass ${styles.emptyState}`}>
                                No reports found in the database.
                            </div>
                        ) : reports.map(report => (
                            <div key={report.id} className={`glass ${styles.reportCard}`} style={{ opacity: !account ? 0.5 : 1 }}>
                                <div>
                                    <div className={styles.reportMetaGroup}>
                                        <span className={styles.reportId}>#{report.id}</span>
                                        <span className={styles.severityBadge} style={{
                                            color: report.severity === 'Critical' ? '#ff003c' : report.severity === 'High' ? '#ff8800' : report.severity === 'Medium' ? '#ffcc00' : '#00ff88'
                                        }}>
                                            {report.cvssScore ? `${parseFloat(report.cvssScore).toFixed(1)} ` : ''}{report.severity || '—'}
                                        </span>
                                        <span className={styles.reportDate}>{report.date}</span>
                                        <span className={styles.statusBadge}>
                                            {report.status.toUpperCase()}
                                        </span>
                                    </div>
                                    <h3 className={`${styles.reportTitle} ${report.locked ? styles.blurredTitle : ''}`}>
                                        {report.locked ? 'Hidden Title For Security' : report.title}
                                    </h3>
                                </div>

                                {report.locked ? (
                                    <button
                                        onClick={() => handleUnlock(report.id)}
                                        className={`btn-primary ${styles.unlockButton}`}
                                        disabled={!account}
                                    >
                                        <span>🔒</span> Unlock & Asses
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => { setSelectedReport(report); setWorkflowState(report.status === 'resolved' ? 'payout' : report.status === 'triaged' ? 'remediation' : 'assessment'); }}
                                        className="btn-secondary"
                                        disabled={!account}
                                    >
                                        Open Workspace
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* VIEW: REPORT WORKSPACE (Detail View) */}
                {selectedReport && (
                    <div className={styles.workspaceGrid}>

                        {/* Left Panel: Evidence + Chat */}
                        <div className={styles.mainPanel}>
                            <div className={`glass ${styles.evidenceCard}`}>
                                <div className={styles.evidenceHeader}>
                                    <h1 className={styles.evidenceTitle}>{selectedReport.title}</h1>
                                    <div className={styles.evidenceTags}>
                                        <span className={styles.evidenceTag} style={{
                                            color: selectedReport.severity === 'Critical' ? '#ff003c' : selectedReport.severity === 'High' ? '#ff8800' : selectedReport.severity === 'Medium' ? '#ffcc00' : '#00ff88',
                                            background: selectedReport.severity === 'Critical' ? 'rgba(255,0,60,0.12)' : selectedReport.severity === 'High' ? 'rgba(255,136,0,0.12)' : selectedReport.severity === 'Medium' ? 'rgba(255,204,0,0.12)' : 'rgba(0,255,136,0.12)',
                                            fontWeight: '700'
                                        }}>
                                            {selectedReport.cvssScore ? `CVSS ${parseFloat(selectedReport.cvssScore).toFixed(1)} · ` : ''}{selectedReport.severity}
                                        </span>
                                        <span className={styles.evidenceTag}>ID: #{selectedReport.id}</span>
                                    </div>
                                </div>
                                <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.9rem' }}>
                                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                                        <div>👤 <strong>Primary Researcher:</strong> <span style={{ color: 'var(--primary)', fontWeight: '600' }}>{selectedReport.researcher}</span></div>
                                        {selectedReport.collaborators && selectedReport.collaborators.length > 0 && (
                                            <div>👥 <strong>Collaborators & Splits:</strong>{' '}
                                                <span style={{ color: '#aaa' }}>
                                                    {selectedReport.collaborators.map(c => 
                                                        typeof c === 'string' ? c : `${c.address.substring(0, 6)}...${c.address.substring(38)} (${c.split}%)`
                                                    ).join(', ')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ lineHeight: '1.6', color: '#ddd' }}>
                                    <h4 style={{ color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>Vulnerability Description</h4>
                                    <p style={{ whiteSpace: 'pre-wrap', color: '#ccc', marginBottom: '2rem' }}>{selectedReport.description}</p>
                                    
                                    <h4 style={{ color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>⛓️ On-Chain Proof of Submission</h4>
                                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'monospace', color: '#888', wordBreak: 'break-all', marginBottom: '2rem' }}>
                                        <div><strong>IPFS CID:</strong> <span style={{ color: '#00f0ff' }}>{selectedReport.cid}</span></div>
                                        <div style={{ marginTop: '0.25rem' }}><strong>TX Hash:</strong> <span style={{ color: '#a855f7' }}>{selectedReport.txHash}</span></div>
                                    </div>

                                    <h4 style={{ color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>📁 Decrypted Proof of Concept (PoC) Evidence</h4>
                                    <div style={{ margin: '1rem 0' }}>
                                        {detectingPoc ? (
                                            <div style={{ padding: '3rem', textAlign: 'center', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', color: '#666' }}>
                                                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
                                                <div>Fetching &amp; decrypting PoC from IPFS...</div>
                                                <div style={{ fontSize: '0.75rem', marginTop: '0.4rem', color: '#444' }}>This happens once — the file is cached locally after.</div>
                                            </div>
                                        ) : pocType === 'error' ? (
                                            <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,0,60,0.06)', border: '1px dashed rgba(255,0,60,0.25)', borderRadius: '8px' }}>
                                                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</div>
                                                <div style={{ color: '#ff4444', fontWeight: '600', marginBottom: '0.4rem' }}>Failed to load PoC evidence</div>
                                                <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '1rem', maxWidth: '360px', margin: '0 auto 1rem' }}>{pocFilename}</div>
                                                <button
                                                    onClick={() => { setSelectedReport(null); setTimeout(() => setSelectedReport(selectedReport), 100); }}
                                                    style={{ padding: '0.5rem 1.2rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#aaa', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                                                >
                                                    🔄 Retry
                                                </button>
                                            </div>
                                        ) : pocType === 'image' ? (

                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                                                <img src={pocUrl} alt="PoC" style={{ maxWidth: '100%', maxHeight: '450px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }} />
                                                <button
                                                    onClick={() => handleDownloadPoC(`poc_report_${selectedReport.id}${pocExtension}`)}
                                                    disabled={downloading}
                                                    style={{ padding: '0.5rem 1.2rem', background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.3)', color: '#00f0ff', borderRadius: '6px', cursor: downloading ? 'not-allowed' : 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                                >
                                                    {downloading ? '⏳ Downloading...' : '⬇️ Download Image'}
                                                </button>
                                            </div>
                                        ) : pocType === 'video' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                                                <video src={pocUrl} controls style={{ maxWidth: '100%', maxHeight: '450px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }} />
                                                <button
                                                    onClick={() => handleDownloadPoC(`poc_report_${selectedReport.id}${pocExtension}`)}
                                                    disabled={downloading}
                                                    style={{ padding: '0.5rem 1.2rem', background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.3)', color: '#00f0ff', borderRadius: '6px', cursor: downloading ? 'not-allowed' : 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                                >
                                                    {downloading ? '⏳ Downloading...' : '⬇️ Download Video'}
                                                </button>
                                            </div>
                                        ) : pocType === 'pdf' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                <embed src={pocUrl} type="application/pdf" width="100%" height="550px" style={{ borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }} />
                                                <button
                                                    onClick={() => handleDownloadPoC(`poc_report_${selectedReport.id}${pocExtension}`)}
                                                    disabled={downloading}
                                                    style={{ padding: '0.5rem 1.2rem', background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.3)', color: '#00f0ff', borderRadius: '6px', cursor: downloading ? 'not-allowed' : 'pointer', fontSize: '0.8rem', alignSelf: 'center', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                                >
                                                    {downloading ? '⏳ Downloading...' : '⬇️ Download PDF'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ padding: '2.5rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px', textAlign: 'center' }}>
                                                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📄</div>
                                                <h4 style={{ margin: '0 0 0.5rem', color: '#fff' }}>Proof of Concept File</h4>
                                                <p style={{ fontSize: '0.85rem', color: '#888', margin: '0 0 1.25rem' }}>This document cannot be previewed natively (e.g. Word, ZIP, or binary file).</p>
                                                <button
                                                    onClick={() => handleDownloadPoC(`poc_report_${selectedReport.id}${pocExtension || '.bin'}`)}
                                                    disabled={downloading}
                                                    className="btn-primary"
                                                    style={{ padding: '0.6rem 1.8rem', fontSize: '0.85rem', cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.7 : 1 }}
                                                >
                                                    {downloading ? '⏳ Preparing Download...' : '⬇️ Download Decrypted PoC'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Off-Chain Chat Thread */}
                            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem' }}>💬 Discussion with Researcher</h3>
                                    <span style={{ fontSize: '0.75rem', color: '#00ff88' }}>🔒 Securely Encrypted Off-Chain</span>
                                </div>

                                {/* Load thread on first render */}
                                {chatReportId !== selectedReport.id && (
                                    <button
                                        onClick={() => openChat(selectedReport.id)}
                                        style={{ width: '100%', padding: '1rem', background: 'rgba(0,240,255,0.05)', border: '1px solid rgba(0,240,255,0.15)', borderRadius: '8px', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.9rem' }}
                                    >
                                        Load Conversation Thread
                                    </button>
                                )}

                                {chatReportId === selectedReport.id && (
                                    <>
                                        <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 0' }}>
                                            {loadingChat ? (
                                                <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>Loading messages...</div>
                                            ) : chatMessages.length === 0 ? (
                                                <div style={{ textAlign: 'center', color: '#555', padding: '2rem' }}>No messages yet. Start communicating with the researcher.</div>
                                            ) : chatMessages.map((msg, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: msg.isMe ? 'flex-end' : 'flex-start' }}>
                                                    <div style={{
                                                        maxWidth: '70%', padding: '0.6rem 1rem', borderRadius: '12px',
                                                        background: msg.isMe ? 'rgba(168,85,247,0.1)' : 'rgba(0,240,255,0.08)',
                                                        border: msg.isMe ? '1px solid rgba(168,85,247,0.2)' : '1px solid rgba(0,240,255,0.15)'
                                                    }}>
                                                        <div style={{ fontSize: '0.7rem', color: msg.isMe ? '#a855f7' : '#00f0ff', marginBottom: '0.25rem' }}>
                                                            {msg.isMe ? 'You (Org)' : (msg.senderName || 'Researcher')} • {new Date(msg.timestamp).toLocaleString()}
                                                        </div>
                                                        <div style={{ fontSize: '0.9rem', color: '#ddd' }}>{msg.text}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <input
                                                type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && !sendingChat && handleSendComment(selectedReport.id)}
                                                placeholder="Reply to researcher... (securely encrypted off-chain)"
                                                style={{ flex: 1, padding: '0.7rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                                            />
                                            <button
                                                onClick={() => handleSendComment(selectedReport.id)}
                                                disabled={sendingChat || !chatInput.trim()}
                                                style={{ padding: '0.7rem 1.2rem', borderRadius: '8px', background: '#a855f7', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem', opacity: sendingChat ? 0.5 : 1 }}
                                            >
                                                {sendingChat ? '⏳' : 'Send'}
                                            </button>
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#00ff88', marginTop: '0.5rem' }}>🔒 Securely encrypted with AES-256-GCM. Zero gas, zero wait time.</div>
                                    </>
                                )}
                            </div>

                            {/* On-Chain Audit Trail */}
                            <AuditTrail contract={contract} reportId={selectedReport.id} account={account} />
                        </div>

                        {/* Right Panel: Workflow Controller */}
                        <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignSelf: 'start', position: 'sticky', top: '130px' }}>
                            <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>Workflow Action</h3>

                            {/* State 1: Assessment */}
                            {workflowState === 'assessment' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <p style={{ color: '#888', fontSize: '0.9rem' }}>Review the report validity.</p>
                                    <button onClick={handleAccept} className="btn-primary" style={{ width: '100%' }} disabled={!!actionStatus}>
                                        {actionStatus ? actionStatus : "Accept & Triage (Gas Fee)"}
                                    </button>
                                    <button onClick={() => setShowRejectModal(true)} style={{ width: '100%', padding: '1rem', background: 'transparent', border: '1px solid #ff003c', color: '#ff003c', borderRadius: '8px', cursor: 'pointer' }} disabled={!!actionStatus}>
                                        Reject Report
                                    </button>
                                </div>
                            )}

                            {/* State 2: Remediation */}
                            {workflowState === 'remediation' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ background: 'rgba(0,240,255,0.1)', color: 'var(--primary)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                                        Status: In Progress
                                    </div>
                                    <p style={{ color: '#888', fontSize: '0.9rem' }}>Team is fixing the issue...</p>
                                    <button onClick={handleResolve} className="btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={!!actionStatus}>
                                        {actionStatus ? actionStatus : "Mark as Resolved (Gas Fee)"}
                                    </button>
                                </div>
                            )}

                            {/* State 3: Payout */}
                            {workflowState === 'payout' && (() => {
                                // Derive CVSS context for this report
                                const cvss = parseFloat(selectedReport.cvssScore) || 0;
                                const severity = selectedReport.severity || '';
                                const prog = programs.find(p => p.name === selectedReport.program);

                                // Determine tier min/max from program config
                                const getTierRange = () => {
                                    if (!prog) return { min: 0, max: 2, tierMin: 0, tierMax: 10, label: 'Low', color: '#888' };
                                    if (cvss >= 9.0) return { min: parseFloat(prog.bountyCriticalMin||0), max: parseFloat(prog.bountyCriticalMax||2), tierMin: 9.0, tierMax: 10.0, label: 'Critical', color: '#ff003c' };
                                    if (cvss >= 7.0) return { min: parseFloat(prog.bountyHighMin||0),     max: parseFloat(prog.bountyHighMax||1.5),  tierMin: 7.0, tierMax: 8.9,  label: 'High',     color: '#ff8800' };
                                    if (cvss >= 4.0) return { min: parseFloat(prog.bountyMediumMin||0),   max: parseFloat(prog.bountyMediumMax||0.5), tierMin: 4.0, tierMax: 6.9,  label: 'Medium',   color: '#ffcc00' };
                                    if (cvss >= 0.1) return { min: parseFloat(prog.bountyLowMin||0),      max: parseFloat(prog.bountyLowMax||0.1),   tierMin: 0.1, tierMax: 3.9,  label: 'Low',      color: '#00ff88' };
                                    return { min: 0, max: parseFloat(prog.bountyLowMax||0.1), tierMin: 0, tierMax: 3.9, label: 'None', color: '#888' };
                                };
                                const { min: rMin, max: rMax, tierMin, tierMax, label: tierLabel, color: tierColor } = getTierRange();

                                // Interpolated suggested payout
                                const suggestedPayout = cvss > 0 && rMax > 0
                                    ? Math.min(rMax, rMin + ((cvss - tierMin) / (tierMax - tierMin)) * (rMax - rMin))
                                    : 0;

                                const sliderMin = rMin;
                                const sliderMax = rMax > 0 ? rMax : 5;

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {/* Resolved banner */}
                                        <div style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', padding: '0.75rem 1rem', borderRadius: '8px', textAlign: 'center', fontWeight: '600' }}>
                                            ✅ Issue Resolved — Release Bounty
                                        </div>

                                        {/* CVSS score chip */}
                                        {cvss > 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', background: `${tierColor}15`, border: `1px solid ${tierColor}33` }}>
                                                <div style={{ textAlign: 'center', minWidth: '52px' }}>
                                                    <div style={{ fontSize: '1.5rem', fontWeight: '800', color: tierColor, fontFamily: 'monospace', lineHeight: 1 }}>{cvss.toFixed(1)}</div>
                                                    <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase' }}>CVSS</div>
                                                </div>
                                                <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '0.75rem' }}>
                                                    <div style={{ color: tierColor, fontWeight: '700', fontSize: '0.9rem' }}>{tierLabel}</div>
                                                    <div style={{ color: '#666', fontSize: '0.75rem' }}>Range: {tierMin.toFixed(1)} – {tierMax.toFixed(1)} · Budget: {rMin} – {rMax} ETH</div>
                                                </div>
                                                {suggestedPayout > 0 && (
                                                    <button
                                                        onClick={() => setBountyAmount(suggestedPayout.toFixed(4))}
                                                        style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.3)', color: '#00f0ff', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}
                                                    >
                                                        ✨ Use Suggested<br/>{suggestedPayout.toFixed(4)} ETH
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Bounty slider */}
                                        <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <label style={{ fontSize: '0.82rem', color: '#aaa' }}>Bounty Amount (ETH)</label>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <input
                                                        type="number"
                                                        min="0" step="0.0001"
                                                        style={{ width: '100px', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', color: '#fff', fontSize: '0.9rem', textAlign: 'right' }}
                                                        value={bountyAmount}
                                                        onChange={e => setBountyAmount(e.target.value)}
                                                    />
                                                    <span style={{ color: '#666', fontSize: '0.8rem' }}>ETH</span>
                                                </div>
                                            </div>
                                            <input
                                                type="range"
                                                min={sliderMin} max={sliderMax} step="0.001"
                                                value={parseFloat(bountyAmount) || sliderMin}
                                                onChange={e => setBountyAmount(e.target.value)}
                                                style={{
                                                    width: '100%', height: '6px', cursor: 'pointer',
                                                    appearance: 'none', outline: 'none', borderRadius: '3px',
                                                    accentColor: '#00ff88',
                                                    background: `linear-gradient(to right, #00ff88 0%, #00ff88 ${sliderMax > 0 ? ((parseFloat(bountyAmount)||0)/sliderMax)*100 : 0}%, rgba(255,255,255,0.1) ${sliderMax > 0 ? ((parseFloat(bountyAmount)||0)/sliderMax)*100 : 0}%, rgba(255,255,255,0.1) 100%)`
                                                }}
                                            />
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#555', marginTop: '0.3rem' }}>
                                                <span>{sliderMin.toFixed(3)} ETH (Min)</span>
                                                {suggestedPayout > 0 && <span style={{ color: '#00f0ff' }}>✨ {suggestedPayout.toFixed(4)} ETH (Suggested)</span>}
                                                <span>{sliderMax.toFixed(3)} ETH (Max)</span>
                                            </div>
                                        </div>

                                        <button onClick={handlePay} className="btn-primary" style={{ width: '100%', background: '#00ff88', color: '#000', padding: '0.9rem', fontWeight: '700' }} disabled={!!actionStatus}>
                                            {actionStatus ? actionStatus : `🏦 Release ${bountyAmount || '0'} ETH from Escrow Vault`}
                                        </button>
                                    </div>
                                );
                            })()}

                        </div>
                    </div>
                )}

                {/* VIEW: FINANCIALS & WALLET */}
                {view === 'financials' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {!financialsLoaded && !account ? (
                            <div className="glass" style={{ padding: '4rem', textAlign: 'center', borderRadius: '16px' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }}>⏳</div>
                                <h3 style={{ color: '#fff', margin: '0 0 0.5rem' }}>Connecting to Wallet...</h3>
                                <p style={{ color: '#666', margin: 0 }}>Auto-connecting to your MetaMask. If this takes too long, try refreshing the page.</p>
                            </div>
                        ) : (
                            <>
                                {/* Your Organization Trust Score */}
                                {account && contract && (
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <ReputationBadge contract={contract} orgAddress={account} showVault={false} />
                                    </div>
                                )}

                                {/* Top Dashboard Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1.5rem' }}>

                                    {/* Vault Escrow Widget */}
                                    <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid #00f0ff' }}>
                                        <h4 style={{ color: '#aaa', margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Vault Escrow</h4>
                                        <h2 style={{ fontSize: '2rem', margin: 0, color: '#00f0ff' }}>
                                            {parseFloat(vaultBalance).toFixed(4)} <span style={{ fontSize: '1rem' }}>ETH</span>
                                        </h2>
                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                            <input type="number" step="0.01" placeholder="ETH" value={vaultDepositAmount} onChange={e => setVaultDepositAmount(e.target.value)}
                                                style={{ width: '70px', padding: '0.4rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.85rem' }} />
                                            <button onClick={handleFundVault} style={{ background: '#00f0ff', color: '#000', border: 'none', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem' }}>
                                                Lock ETH
                                            </button>
                                        </div>
                                        {actionStatus && <p style={{ color: '#ffaa00', fontSize: '0.8rem', marginTop: '0.5rem' }}>{actionStatus}</p>}
                                    </div>

                                    {/* Live Balance Widget */}
                                    <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid #00ff88' }}>
                                        <h4 style={{ color: '#aaa', margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Treasury Balance</h4>
                                        <h2 style={{ fontSize: '2rem', margin: 0 }}>
                                            {parseFloat(balance).toFixed(4)} <span style={{ fontSize: '1rem', color: '#00ff88' }}>ETH</span>
                                        </h2>
                                        <p style={{ color: '#555', fontSize: '0.8rem', margin: '0.5rem 0 0 0' }}>Network: Localhost (1337)</p>
                                    </div>

                                    {/* Signer Widget */}
                                    <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid var(--primary)' }}>
                                        <h4 style={{ color: '#aaa', margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Authorized Signer</h4>
                                        <p style={{ fontFamily: 'monospace', fontSize: '0.85rem', margin: 0, wordBreak: 'break-all', color: 'var(--primary)' }}>
                                            {account || user?.wallet || 'Not connected'}
                                        </p>
                                        <p style={{ color: '#555', fontSize: '0.75rem', margin: '0.5rem 0 0' }}>{user?.username || '—'}</p>
                                    </div>

                                    {/* Liabilities Widget */}
                                    <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid #ffcc00' }}>
                                        <h4 style={{ color: '#aaa', margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Est. Liabilities</h4>
                                        <h2 style={{ fontSize: '2rem', margin: 0 }}>
                                            ~{liabilities.toFixed(2)} <span style={{ fontSize: '1rem', color: '#ffcc00' }}>ETH</span>
                                        </h2>
                                        <p style={{ color: '#555', fontSize: '0.8rem', margin: '0.5rem 0 0 0' }}>Based on {reports.filter(r => r.status === 'triaged' || r.status === 'validated').length} active reports</p>
                                    </div>
                                </div>

                                {/* Payout History Ledger */}
                                <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                                    <h3 style={{ margin: '0 0 1.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>💸 Treasury Ledger (Payout History)</h3>

                                    {payoutHistory.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '3rem', color: '#555' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🏦</div>
                                            <p style={{ margin: 0 }}>No outbound transactions found.</p>
                                            <p style={{ fontSize: '0.85rem', color: '#444', marginTop: '0.5rem' }}>
                                                Payouts will appear here after you reward researchers for validated reports.
                                            </p>
                                        </div>
                                    ) : (
                                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ color: '#666', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.08)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Report</th>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Recipient</th>
                                                    <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                                                    <th style={{ padding: '0.75rem 1rem' }}>TX Hash</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {payoutHistory.map(p => (
                                                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                        <td style={{ padding: '0.75rem 1rem', color: '#888' }}>{new Date(p.timestamp).toLocaleDateString()}</td>
                                                        <td style={{ padding: '0.75rem 1rem' }}><span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>#{p.reportId}</span></td>
                                                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.85rem', color: '#00ccff' }}>
                                                            {p.researcherWallet?.substring(0, 6)}...{p.researcherWallet?.substring(38)}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', color: '#00ff88', fontWeight: '600' }}>{p.amountEth} ETH</td>
                                                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#666' }}>
                                                            {p.txHash ? `${p.txHash.substring(0, 10)}...` : '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* VIEW: PROGRAM SETTINGS */}
                {view === 'program-settings' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Header & Create/Edit Button */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0 }}>{editingProgramId ? `✏️ Edit Program #${editingProgramId}` : 'Your Bug Bounty Programs'}</h2>
                            <button
                                onClick={() => { if (showCreateProgram) { handleCancelEdit(); } else { setShowCreateProgram(true); } }}
                                className="btn-primary"
                                style={{ padding: '0.8rem 1.5rem' }}
                            >
                                {showCreateProgram ? 'Cancel' : '+ Create New Program'}
                            </button>
                        </div>

                        {/* Create / Edit Program Form */}
                        {showCreateProgram && (
                            <div className="glass" style={{ padding: '2rem', borderRadius: '12px', border: '1px solid rgba(0,240,255,0.3)' }}>
                                <h3 style={{ color: 'var(--primary)', marginTop: 0 }}>
                                    {editingProgramId ? `✏️ Edit Program #${editingProgramId}` : '🚀 New Bounty Program'}
                                </h3>

                                {/* === SECTION 1: Basic Info === */}
                                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,240,255,0.03)', borderRadius: '8px', border: '1px solid rgba(0,240,255,0.08)' }}>
                                    <div style={{ fontSize: '0.7rem', color: '#00f0ff', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '0.75rem' }}>📋 Program Details</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Program Name *</label>
                                            <input className="glass" style={{ width: '100%', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px', marginTop: '0.3rem' }}
                                                placeholder="e.g. Tesla Security" value={programForm.name}
                                                onChange={e => setProgramForm({ ...programForm, name: e.target.value })} />
                                        </div>
                                        <div>
                                            <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Scope Type *</label>
                                            <select className="glass" style={{ width: '100%', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px', marginTop: '0.3rem', appearance: 'none', background: 'rgba(255,255,255,0.05)' }}
                                                value={programForm.scopeType} onChange={e => setProgramForm({ ...programForm, scopeType: e.target.value })}>
                                                <option value="Limited" style={{ color: '#000' }}>Limited Scope (Restrictive, specific targets)</option>
                                                <option value="Wide" style={{ color: '#000' }}>Wide Scope (*.company.com)</option>
                                                <option value="Open" style={{ color: '#000' }}>Open Scope (Any externally facing asset)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '1rem' }}>
                                        <label style={{ color: '#aaa', fontSize: '0.85rem' }}>General Description</label>
                                        <textarea className="glass" style={{ width: '100%', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px', marginTop: '0.3rem', minHeight: '60px' }}
                                            placeholder="Overall summary of the bug bounty program..."
                                            value={programForm.description} onChange={e => setProgramForm({ ...programForm, description: e.target.value })} />
                                    </div>
                                    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                        <input type="checkbox" id="safeHarbor" checked={programForm.safeHarbor}
                                            onChange={e => setProgramForm({ ...programForm, safeHarbor: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                                        <label htmlFor="safeHarbor" style={{ color: '#aaa', fontSize: '0.85rem', cursor: 'pointer' }}>
                                            🛡️ Include Safe Harbor Policy (Protect researchers from legal action if rules are followed)
                                        </label>
                                    </div>
                                </div>

                                {/* === SECTION 2: SLA Configuration === */}
                                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,240,255,0.03)', borderRadius: '8px', border: '1px solid rgba(0,240,255,0.08)' }}>
                                    <div style={{ fontSize: '0.7rem', color: '#00f0ff', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '0.75rem' }}>⏱️ Response SLAs</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                        {[['slaResponse','Time to First Response','2 business days'],['slaTriage','Time to Triage','5 business days'],['slaBounty','Time to Bounty','14 business days after triage']].map(([key, label, ph]) => (
                                            <div key={key}>
                                                <label style={{ color: '#aaa', fontSize: '0.85rem' }}>{label}</label>
                                                <input className="glass" style={{ width: '100%', padding: '0.7rem', color: '#fff', border: 'none', borderRadius: '6px', marginTop: '0.3rem', fontSize: '0.85rem' }}
                                                    placeholder={ph} value={programForm[key]}
                                                    onChange={e => setProgramForm({ ...programForm, [key]: e.target.value })} />
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: '1rem' }}>
                                        <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Disclosure Policy</label>
                                        <select className="glass" style={{ width: '100%', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px', marginTop: '0.3rem', appearance: 'none', background: 'rgba(255,255,255,0.05)' }}
                                            value={programForm.disclosurePolicy} onChange={e => setProgramForm({ ...programForm, disclosurePolicy: e.target.value })}>
                                            <option value="Coordinated Disclosure" style={{ color: '#000' }}>Coordinated Disclosure (Researcher may publish after fix)</option>
                                            <option value="Strictly Non-Public" style={{ color: '#000' }}>Strictly Non-Public (No disclosure permitted)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* === SECTION 3: In-Scope / Out-of-Scope / Focus Areas === */}
                                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,240,255,0.03)', borderRadius: '8px', border: '1px solid rgba(0,240,255,0.08)' }}>
                                    <div style={{ fontSize: '0.7rem', color: '#00f0ff', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '0.75rem' }}>🎯 Target Scope</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ color: '#aaa', fontSize: '0.85rem' }}>In-Scope Targets *</label>
                                            <textarea className="glass" style={{ width: '100%', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px', marginTop: '0.3rem', minHeight: '80px' }}
                                                placeholder="api.company.com, auth.company.com..."
                                                value={programForm.inScope} onChange={e => setProgramForm({ ...programForm, inScope: e.target.value })} />
                                        </div>
                                        <div>
                                            <label style={{ color: '#ff4444', fontSize: '0.85rem' }}>Out-of-Scope / Off-Limits</label>
                                            <textarea className="glass" style={{ width: '100%', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px', marginTop: '0.3rem', minHeight: '80px' }}
                                                placeholder="Third-party vendors, DDoS, Phishing..."
                                                value={programForm.outOfScope} onChange={e => setProgramForm({ ...programForm, outOfScope: e.target.value })} />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '1rem' }}>
                                        <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Focus Areas &amp; Documentation</label>
                                        <textarea className="glass" style={{ width: '100%', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px', marginTop: '0.3rem', minHeight: '60px' }}
                                            placeholder="Please focus heavily on our new multi-tenant billing logic..."
                                            value={programForm.focusAreas} onChange={e => setProgramForm({ ...programForm, focusAreas: e.target.value })} />
                                    </div>
                                </div>

                                {/* === SECTION 4: Dynamic Asset Scope Table === */}
                                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,240,255,0.03)', borderRadius: '8px', border: '1px solid rgba(0,240,255,0.08)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ fontSize: '0.7rem', color: '#00f0ff', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>🏗️ Asset Scope Table</div>
                                        <button onClick={handleAddAsset} style={{ background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.3)', color: '#00f0ff', padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>+ Add Asset</button>
                                    </div>
                                    {programForm.assets.length === 0 ? (
                                        <p style={{ color: '#555', fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>No assets added yet. Click "+ Add Asset" to define specific targets with tiers.</p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {/* Table Header */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto auto', gap: '0.5rem', padding: '0.4rem 0.5rem', fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                <span>Identifier</span><span>Type</span><span>Tier</span><span>Eligible</span><span></span>
                                            </div>
                                            {programForm.assets.map((asset, idx) => (
                                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto auto', gap: '0.5rem', alignItems: 'center' }}>
                                                    <input className="glass" style={{ padding: '0.5rem', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.85rem' }}
                                                        placeholder="api.example.com" value={asset.identifier}
                                                        onChange={e => handleUpdateAsset(idx, 'identifier', e.target.value)} />
                                                    <select className="glass" style={{ padding: '0.5rem', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', appearance: 'none' }}
                                                        value={asset.type} onChange={e => handleUpdateAsset(idx, 'type', e.target.value)}>
                                                        {['Web App','API','Mobile (iOS)','Mobile (Android)','Smart Contract','Other'].map(t => <option key={t} value={t} style={{ color: '#000' }}>{t}</option>)}
                                                    </select>
                                                    <select className="glass" style={{ padding: '0.5rem', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', appearance: 'none' }}
                                                        value={asset.tier} onChange={e => handleUpdateAsset(idx, 'tier', e.target.value)}>
                                                        {['Tier 1 (Mission Critical)','Tier 2 (Core Infrastructure)','Tier 3 (Supporting Systems)'].map(t => <option key={t} value={t} style={{ color: '#000' }}>{t}</option>)}
                                                    </select>
                                                    <input type="checkbox" checked={asset.eligible} onChange={e => handleUpdateAsset(idx, 'eligible', e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer', margin: '0 auto' }} />
                                                    <button onClick={() => handleRemoveAsset(idx)} style={{ background: 'rgba(255,0,60,0.15)', border: '1px solid rgba(255,0,60,0.3)', color: '#ff4444', padding: '0.3rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* === SECTION 5: CVSS Bounty Ranges === */}
                                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,240,255,0.03)', borderRadius: '8px', border: '1px solid rgba(0,240,255,0.08)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <div style={{ fontSize: '0.7rem', color: '#00f0ff', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>🏆 CVSS Bounty Ranges (ETH)</div>
                                        <div style={{ fontSize: '0.65rem', color: '#555' }}>Drag sliders to set min &amp; max payout per tier</div>
                                    </div>
                                    {[
                                        { key: 'Low',      color: '#00ff88', range: '0.1 – 3.9',  bg: 'rgba(0,255,136,0.05)',  border: 'rgba(0,255,136,0.15)',  sliderMax: 2   },
                                        { key: 'Medium',   color: '#ffcc00', range: '4.0 – 6.9',  bg: 'rgba(255,204,0,0.05)',  border: 'rgba(255,204,0,0.15)',  sliderMax: 5   },
                                        { key: 'High',     color: '#ff8800', range: '7.0 – 8.9',  bg: 'rgba(255,136,0,0.05)', border: 'rgba(255,136,0,0.15)',  sliderMax: 10  },
                                        { key: 'Critical', color: '#ff003c', range: '9.0 – 10.0', bg: 'rgba(255,0,60,0.06)',  border: 'rgba(255,0,60,0.2)',    sliderMax: 20  }
                                    ].map(({ key, color, range, bg, border, sliderMax }) => {
                                        const minVal = parseFloat(programForm[`bounty${key}Min`]) || 0;
                                        const maxVal = parseFloat(programForm[`bounty${key}Max`]) || 0;
                                        const minPct = (minVal / sliderMax) * 100;
                                        const maxPct = (maxVal / sliderMax) * 100;
                                        return (
                                            <div key={key} style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', background: bg, border: `1px solid ${border}` }}>
                                                {/* Tier header */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <span style={{ color, fontWeight: '700', fontSize: '0.85rem', minWidth: '60px' }}>{key}</span>
                                                        <span style={{ color: '#555', fontSize: '0.7rem', fontFamily: 'monospace' }}>{range}</span>
                                                    </div>
                                                    {/* Min / Max badges */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
                                                        <span style={{ color: '#888' }}>Min:</span>
                                                        <input type="number" min="0" max={sliderMax} step="0.01"
                                                            style={{ width: '64px', padding: '0.2rem 0.4rem', background: 'rgba(255,255,255,0.07)', border: `1px solid ${border}`, borderRadius: '4px', color: '#fff', fontSize: '0.78rem', textAlign: 'center', outline: 'none' }}
                                                            value={programForm[`bounty${key}Min`]}
                                                            onChange={e => {
                                                                const v = Math.min(parseFloat(e.target.value) || 0, maxVal);
                                                                setProgramForm({ ...programForm, [`bounty${key}Min`]: String(v) });
                                                            }} />
                                                        <span style={{ color: '#555' }}>–</span>
                                                        <span style={{ color: '#888' }}>Max:</span>
                                                        <input type="number" min="0" max={sliderMax} step="0.01"
                                                            style={{ width: '64px', padding: '0.2rem 0.4rem', background: 'rgba(255,255,255,0.07)', border: `1px solid ${border}`, borderRadius: '4px', color: '#fff', fontSize: '0.78rem', textAlign: 'center', outline: 'none' }}
                                                            value={programForm[`bounty${key}Max`]}
                                                            onChange={e => {
                                                                const v = Math.max(parseFloat(e.target.value) || 0, minVal);
                                                                setProgramForm({ ...programForm, [`bounty${key}Max`]: String(v) });
                                                            }} />
                                                        <span style={{ color: '#888', fontSize: '0.7rem' }}>ETH</span>
                                                    </div>
                                                </div>
                                                {/* Dual-range slider track */}
                                                <div style={{ position: 'relative', height: '28px', display: 'flex', alignItems: 'center' }}>
                                                    {/* Track background */}
                                                    <div style={{ position: 'absolute', left: 0, right: 0, height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' }} />
                                                    {/* Filled range between min and max */}
                                                    <div style={{
                                                        position: 'absolute',
                                                        left: `${minPct}%`,
                                                        width: `${Math.max(0, maxPct - minPct)}%`,
                                                        height: '5px',
                                                        borderRadius: '3px',
                                                        background: `linear-gradient(90deg, ${color}99, ${color})`,
                                                        boxShadow: `0 0 6px ${color}55`,
                                                        transition: 'left 0.05s, width 0.05s',
                                                    }} />
                                                    {/* Slider styles injected inline via a trick: use className + global CSS */}
                                                    <style>{`
                                                        .bounty-slider-${key.toLowerCase()}::-webkit-slider-thumb {
                                                            -webkit-appearance: none;
                                                            width: 16px; height: 16px;
                                                            border-radius: 50%;
                                                            background: ${color};
                                                            border: 2px solid #0a0a0f;
                                                            cursor: pointer;
                                                            box-shadow: 0 0 6px ${color}88;
                                                            transition: box-shadow 0.2s;
                                                            pointer-events: auto;
                                                        }
                                                        .bounty-slider-${key.toLowerCase()}::-webkit-slider-thumb:hover {
                                                            box-shadow: 0 0 12px ${color};
                                                        }
                                                        .bounty-slider-${key.toLowerCase()}::-moz-range-thumb {
                                                            width: 16px; height: 16px;
                                                            border-radius: 50%;
                                                            background: ${color};
                                                            border: 2px solid #0a0a0f;
                                                            cursor: pointer;
                                                            box-shadow: 0 0 6px ${color}88;
                                                            pointer-events: auto;
                                                        }
                                                        .bounty-slider-${key.toLowerCase()} {
                                                            -webkit-appearance: none;
                                                            appearance: none;
                                                            position: absolute;
                                                            left: 0; right: 0;
                                                            width: 100%;
                                                            height: 5px;
                                                            background: transparent;
                                                            pointer-events: none;
                                                            outline: none;
                                                        }
                                                    `}</style>
                                                    {/* Min thumb */}
                                                    <input
                                                        type="range" min="0" max={sliderMax} step="0.01"
                                                        className={`bounty-slider-${key.toLowerCase()}`}
                                                        style={{ zIndex: minVal > maxVal - sliderMax * 0.05 ? (maxVal > sliderMax / 2 ? 5 : 3) : 5 }}
                                                        value={minVal}
                                                        onChange={e => {
                                                            const v = Math.min(parseFloat(e.target.value), maxVal);
                                                            setProgramForm({ ...programForm, [`bounty${key}Min`]: String(v) });
                                                        }}
                                                    />
                                                    {/* Max thumb */}
                                                    <input
                                                        type="range" min="0" max={sliderMax} step="0.01"
                                                        className={`bounty-slider-${key.toLowerCase()}`}
                                                        style={{ zIndex: 4 }}
                                                        value={maxVal}
                                                        onChange={e => {
                                                            const v = Math.max(parseFloat(e.target.value), minVal);
                                                            setProgramForm({ ...programForm, [`bounty${key}Max`]: String(v) });
                                                        }}
                                                    />
                                                </div>
                                                {/* Scale labels */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.6rem', color: '#444' }}>
                                                    <span>0</span>
                                                    <span>{(sliderMax / 4).toFixed(2)}</span>
                                                    <span>{(sliderMax / 2).toFixed(2)}</span>
                                                    <span>{(sliderMax * 3 / 4).toFixed(2)}</span>
                                                    <span>{sliderMax}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {/* Preview badge */}
                                    {programForm.bountyCriticalMax && (
                                        <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.75rem', background: 'rgba(255,0,60,0.08)', border: '1px dashed rgba(255,0,60,0.3)', borderRadius: '4px', fontSize: '0.75rem', color: '#ff003c', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <span>🎯</span>
                                            <span>Researchers can earn up to <strong>{programForm.bountyCriticalMax} ETH</strong> for a Critical (9.0–10.0) finding</span>
                                        </div>
                                    )}
                                </div>

                                {/* === SECTION 6: Testing Guidelines === */}
                                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,240,255,0.03)', borderRadius: '8px', border: '1px solid rgba(0,240,255,0.08)' }}>
                                    <div style={{ fontSize: '0.7rem', color: '#00f0ff', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '0.75rem' }}>🧪 Testing Guidelines</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Test Credentials &amp; Account Rules</label>
                                            <textarea className="glass" style={{ width: '100%', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px', marginTop: '0.3rem', minHeight: '80px', fontSize: '0.85rem' }}
                                                placeholder="e.g. Register test accounts using @bugcrowdninja.com addresses. Do not interact with accounts you do not own."
                                                value={programForm.testingCredentials} onChange={e => setProgramForm({ ...programForm, testingCredentials: e.target.value })} />
                                        </div>
                                        <div>
                                            <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Traffic &amp; Automation Rules</label>
                                            <textarea className="glass" style={{ width: '100%', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px', marginTop: '0.3rem', minHeight: '80px', fontSize: '0.85rem' }}
                                                placeholder="e.g. Do not use automated scanners above 5 req/sec. Avoid triggering WAF blocks."
                                                value={programForm.trafficRules} onChange={e => setProgramForm({ ...programForm, trafficRules: e.target.value })} />
                                        </div>
                                    </div>
                                </div>

                                {/* === SECTION 7: Exclusions === */}
                                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,0,60,0.03)', borderRadius: '8px', border: '1px solid rgba(255,0,60,0.1)' }}>
                                    <div style={{ fontSize: '0.7rem', color: '#ff4444', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', marginBottom: '0.75rem' }}>🚫 Do Not Report (Exclusions)</div>
                                    <textarea className="glass" style={{ width: '100%', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px', minHeight: '80px', fontSize: '0.85rem' }}
                                        placeholder="e.g. Clickjacking without sensitive action, Self-XSS, Missing security headers without PoC, Rate-limiting on non-auth endpoints, DoS/DDoS..."
                                        value={programForm.exclusions} onChange={e => setProgramForm({ ...programForm, exclusions: e.target.value })} />
                                </div>

                                <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.15)', fontSize: '0.8rem', color: '#ffaa00' }}>
                                    ⛽ {editingProgramId ? 'Saving updates requires a gas fee to commit the new IPFS CID on-chain.' : 'Creating a program costs a small gas fee. Details are stored on IPFS, the record is committed on-chain.'}
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                    {editingProgramId ? (
                                        <>
                                            <button onClick={handleUpdateProgram} className="btn-primary" style={{ flex: 1, padding: '1rem' }} disabled={!!actionStatus}>
                                                {actionStatus || '💾 Save Changes (Gas Fee)'}
                                            </button>
                                            <button onClick={handleCancelEdit} style={{ padding: '1rem 1.5rem', background: 'transparent', border: '1px solid #555', color: '#aaa', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
                                        </>
                                    ) : (
                                        <button onClick={handleCreateProgram} className="btn-primary" style={{ width: '100%', padding: '1rem' }} disabled={!!actionStatus}>
                                            {actionStatus || '🚀 Publish Bounty Program (Gas Fee)'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Existing Programs List */}
                        {programs.length === 0 && !showCreateProgram ? (
                            <div className="glass" style={{ padding: '4rem', textAlign: 'center', borderRadius: '12px', color: '#888' }}>
                                <h3 style={{ margin: '0 0 1rem 0' }}>No Programs Yet</h3>
                                <p>Create your first Bug Bounty Program to attract security researchers.</p>
                            </div>
                        ) : programs.map(prog => (
                            <div key={prog.id} className="glass" style={{ padding: '1.5rem', borderRadius: '12px', border: prog.active ? '1px solid rgba(0,255,136,0.2)' : '1px solid rgba(255,0,0,0.2)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                            <h3 style={{ margin: 0 }}>{prog.name}</h3>
                                            <span style={{
                                                padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                                                background: prog.active ? 'rgba(0,255,136,0.15)' : 'rgba(255,0,0,0.15)',
                                                color: prog.active ? '#00ff88' : '#ff4444'
                                            }}>
                                                {prog.active ? 'ACTIVE' : 'PAUSED'}
                                            </span>
                                            {prog.disclosurePolicy && <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'rgba(0,240,255,0.08)', borderRadius: '4px', color: '#00f0ff' }}>{prog.disclosurePolicy}</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', color: '#ddd' }}>{prog.scopeType || 'Limited'} Scope</span>
                                            {prog.safeHarbor && <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'rgba(0,255,136,0.1)', borderRadius: '4px', color: '#00ff88' }}>🛡️ Safe Harbor</span>}
                                            {prog.slaResponse && <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'rgba(255,170,0,0.1)', borderRadius: '4px', color: '#ffaa00' }}>⏱️ {prog.slaResponse}</span>}
                                        </div>
                                        <p style={{ color: '#aaa', margin: '0.3rem 0', fontSize: '0.85rem' }}><strong>In-Scope:</strong> {prog.inScope}</p>
                                        {prog.outOfScope && <p style={{ color: '#ff4444', margin: '0.3rem 0', fontSize: '0.85rem' }}><strong>Off-Limits:</strong> {prog.outOfScope}</p>}
                                        {prog.focusAreas && <p style={{ color: '#00f0ff', margin: '0.3rem 0', fontSize: '0.85rem' }}><strong>Focus Areas:</strong> {prog.focusAreas}</p>}
                                        {prog.description && <p style={{ color: '#666', margin: '0.5rem 0', fontSize: '0.85rem' }}>{prog.description}</p>}
                                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.8rem' }}>
                                            {[{ l: 'Low', k: 'Low', c: '#00ff88' }, { l: 'Med', k: 'Medium', c: '#ffcc00' }, { l: 'High', k: 'High', c: 'orange' }, { l: 'Crit', k: 'Critical', c: '#ff003c' }].map(s => {
                                                const min = prog[`bounty${s.k}Min`] || '0';
                                                const max = prog[`bounty${s.k}Max`] || '0';
                                                const displayValue = min === max ? `${min}` : `${min}-${max}`;
                                                return (
                                                    <span key={s.l} style={{ fontSize: '0.8rem', color: s.c }}>
                                                        {s.l}: {displayValue} ETH
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        {/* Enrolled Researchers */}
                                        <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                            <button
                                                onClick={() => handleViewParticipants(prog.id)}
                                                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: 0 }}
                                            >
                                                👥 {enrollmentCounts[prog.id] || 0} researchers hunting
                                                <span style={{ fontSize: '0.7rem' }}>{expandedProgram === prog.id ? '▲' : '▼'}</span>
                                            </button>
                                            {expandedProgram === prog.id && (
                                                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                                    {programParticipants.length === 0 ? (
                                                        <p style={{ color: '#555', fontSize: '0.85rem', margin: 0 }}>No researchers enrolled yet.</p>
                                                    ) : programParticipants.map((addr, i) => (
                                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', fontSize: '0.85rem' }}>
                                                            <span style={{ color: '#666' }}>#{i + 1}</span>
                                                            <span style={{ fontFamily: 'monospace', color: '#aaa' }}>{addr.substring(0, 6)}...{addr.substring(38)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexDirection: 'column' }}>
                                        <button
                                            onClick={() => handleEditProgram(prog)}
                                            disabled={!!actionStatus || account?.toLowerCase() !== prog.organization?.toLowerCase()}
                                            style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #00f0ff', color: '#00f0ff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', width: '100%', opacity: account?.toLowerCase() !== prog.organization?.toLowerCase() ? 0.3 : 1 }}
                                        >
                                            ✏️ Edit
                                        </button>
                                        <button
                                            onClick={() => handleToggleProgram(prog.id, prog.active)}
                                            disabled={!!actionStatus}
                                            style={{ padding: '0.5rem 1rem', background: 'transparent', border: `1px solid ${prog.active ? '#ffaa00' : '#00ff88'}`, color: prog.active ? '#ffaa00' : '#00ff88', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', width: '100%' }}
                                        >
                                            {prog.active ? '⏸ Pause' : '▶ Activate'}
                                        </button>
                                        <span style={{ fontSize: '0.7rem', color: '#444', fontFamily: 'monospace' }}>ID: #{prog.id}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Reject Modal */}
            {showRejectModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
                    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="glass" style={{ width: '400px', padding: '2rem', borderRadius: '12px' }}>
                        <h3 style={{ color: '#ff003c', marginTop: 0 }}>Reject Report</h3>
                        <p style={{ color: '#ccc', fontSize: '0.9rem' }}>Please provide a reason. This will be visible to the Validator if disputed.</p>
                        <textarea
                            className="glass"
                            style={{ width: '100%', minHeight: '100px', padding: '0.8rem', color: '#fff', border: 'none', borderRadius: '6px', margin: '1rem 0' }}
                            placeholder="Reason (e.g., Duplicate, Out of Scope...)"
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={handleReject} style={{ flex: 1, background: '#ff003c', color: '#fff', border: 'none', padding: '0.8rem', borderRadius: '6px', cursor: 'pointer' }} disabled={!!actionStatus}>
                                {actionStatus ? actionStatus : "Confirm Rejection (Gas)"}
                            </button>
                            <button onClick={() => setShowRejectModal(false)} style={{ flex: 1, background: 'transparent', color: '#888', border: 'none', cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
