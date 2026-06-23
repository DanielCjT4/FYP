"use client";
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAuth } from '../../contexts/AuthContext';
import { useWallet } from '../../contexts/WalletContext';
import Navbar from '../../components/Navbar';

export default function ProfilePage() {
    const { user, updateUser } = useAuth();
    const { account, contract } = useWallet();
    const role = user?.role || 'Researcher';

    const [onChainProfile, setOnChainProfile] = useState(null);
    const [ethBalance, setEthBalance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');
    const [activeTab, setActiveTab] = useState('overview');

    // ─── Shared Fields ───
    const [displayName, setDisplayName] = useState(user?.username || '');
    const [bio, setBio] = useState('');
    const [website, setWebsite] = useState('');

    // ─── Researcher-specific ───
    const [skills, setSkills] = useState([]);
    const [newSkill, setNewSkill] = useState('');
    const [github, setGithub] = useState('');
    const [twitter, setTwitter] = useState('');
    const [experience, setExperience] = useState('beginner');

    // ─── Organization-specific ───
    const [industry, setIndustry] = useState('');
    const [companySize, setCompanySize] = useState('');
    const [securityContact, setSecurityContact] = useState('');
    const [programs, setPrograms] = useState([]);

    // ─── Validator-specific ───
    const [specializations, setSpecializations] = useState([]);
    const [newSpec, setNewSpec] = useState('');
    const [certifications, setCertifications] = useState('');
    const [availability, setAvailability] = useState('available');
    const [yearsExp, setYearsExp] = useState('');

    const roleNames = ['None', 'Researcher', 'Organization', 'Validator'];

    const fetchProfile = async () => {
        await Promise.resolve();
        setLoading(true);
        try {
            if (account && contract) {
                const provider = contract.runner?.provider || new ethers.BrowserProvider(window.ethereum);
                const bal = await provider.getBalance(account);
                setEthBalance(ethers.formatEther(bal));

                const profile = await contract.users(account);
                const chainData = {
                    role: Number(profile[0]), name: profile[1],
                    profileCid: profile[2], isRegistered: profile[3]
                };
                setOnChainProfile(chainData);
                setDisplayName(chainData.name || user?.username || '');

                // Use locally saved CID if available (updated via Edit Profile), else fall back to on-chain CID
                const localCid = localStorage.getItem(`decenbug_profile_cid_${account.toLowerCase()}`);
                const cidToLoad = localCid || chainData.profileCid;

                if (cidToLoad) {
                    try {
                        const res = await fetch(`/api/ipfs/read?cid=${cidToLoad}`);
                        const p = await res.json();
                        if (p.name) {
                            setDisplayName(p.name);
                            if (updateUser) {
                                updateUser({ username: p.name });
                            }
                        }
                        if (p.bio) setBio(p.bio);
                        if (p.website) setWebsite(p.website);
                        // Researcher
                        if (p.skills) setSkills(p.skills);
                        if (p.github) setGithub(p.github);
                        if (p.twitter) setTwitter(p.twitter);
                        if (p.experience) setExperience(p.experience);
                        // Organization
                        if (p.industry) setIndustry(p.industry);
                        if (p.companySize) setCompanySize(p.companySize);
                        if (p.securityContact) setSecurityContact(p.securityContact);
                        // Validator
                        if (p.specializations) setSpecializations(p.specializations);
                        if (p.certifications) setCertifications(p.certifications);
                        if (p.availability) setAvailability(p.availability);
                        if (p.yearsExp) setYearsExp(p.yearsExp);
                    } catch {}
                }
            }
        } catch (err) { console.error("Profile fetch error:", err); }
        setLoading(false);
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchProfile();
        }, 0);
        return () => clearTimeout(timer);
    }, [account, contract]);

    // Fetch org programs from blockchain for Organization profile
    useEffect(() => {
        async function fetchOrgPrograms() {
            if (role !== 'Organization' || !contract || !account) return;
            try {
                const ids = await contract.getOrgPrograms(account);
                const progs = [];
                for (const idBN of ids) {
                    const id = Number(idBN);
                    const prog = await contract.programs(id);
                    let details = { name: `Program #${id}`, scope: '', bountyCritical: '0' };
                    try {
                        const res = await fetch(`/api/ipfs/read?cid=${prog.detailsCid}`);
                        if (res.ok) details = { ...details, ...(await res.json()) };
                    } catch {}
                    progs.push({ id, ...details, active: prog.active });
                }
                setPrograms(progs);
            } catch {}
        }
        fetchOrgPrograms();
    }, [role, contract, account]);

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setSaving(true);
        setSaveStatus('Uploading profile to IPFS...');
        try {
            const baseData = { name: displayName, role, wallet: account || user?.wallet, bio, website, updatedAt: new Date().toISOString() };
            let roleData = {};
            if (role === 'Researcher') roleData = { skills, github, twitter, experience };
            else if (role === 'Organization') roleData = { industry, companySize, securityContact };
            else if (role === 'Validator') roleData = { specializations, certifications, availability, yearsExp };

            const blob = new Blob([JSON.stringify({ ...baseData, ...roleData })], { type: 'application/json' });
            const formData = new FormData();
            formData.append("file", blob, "profile.json");
            const res = await fetch("/api/ipfs", { method: "POST", body: formData });
            const data = await res.json();
            if (data.IpfsHash) {
                // Sync display name and IPFS CID on-chain (Gas Fee required)
                if (contract && account) {
                    setSaveStatus('Signing on-chain update (MetaMask)...');
                    const tx = await contract.updateProfile(displayName, data.IpfsHash);
                    setSaveStatus('Syncing with blockchain...');
                    await tx.wait();
                }

                // Cache the new CID so subsequent page loads use the updated profile
                const walletKey = (account || user?.wallet || '').toLowerCase();
                if (walletKey) localStorage.setItem(`decenbug_profile_cid_${walletKey}`, data.IpfsHash);
                
                // Sync the navbar/context username in real-time
                if (updateUser) {
                    updateUser({ username: displayName });
                }
                
                setSaveStatus(`Profile saved & synced on-chain! CID: ${data.IpfsHash.substring(0, 16)}...`);
            } else {
                setSaveStatus('Upload failed. Check your Pinata API key.');
            }
        } catch (err) {
            console.error(err);
            setSaveStatus('Error saving profile.');
        }
        setSaving(false);
        setTimeout(() => setSaveStatus(''), 5000);
    };

    const addTag = (list, setList, value, setValue) => {
        const t = value.trim();
        if (t && !list.includes(t) && list.length < 10) { setList([...list, t]); setValue(''); }
    };
    const removeTag = (list, setList, item) => setList(list.filter(s => s !== item));

    // ─── Styles ───
    const input = { width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: '0.95rem', outline: 'none' };
    const label = { display: 'block', marginBottom: '0.5rem', color: '#888', fontSize: '0.85rem', fontWeight: '500' };
    const field = { marginBottom: '1.5rem' };

    const roleColors = { Researcher: '#00f0ff', Organization: '#a855f7', Validator: '#ff003c' };
    const accent = roleColors[role] || 'var(--primary)';

    if (loading) {
        return (
            <div className="page-content" style={{ background: 'var(--background)', color: '#fff' }}>
                <Navbar />
                <div style={{ textAlign: 'center', padding: '6rem', color: '#888' }}>Loading profile...</div>
            </div>
        );
    }

    return (
        <div className="page-content" style={{ background: 'var(--background)', color: '#fff' }}>
            <Navbar />
            <div className="container" style={{ maxWidth: '960px', marginTop: '2rem', paddingBottom: '4rem' }}>

                {/* ── Header ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '20px',
                        background: `linear-gradient(135deg, ${accent}, ${accent}66)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '2rem', fontWeight: '800', color: '#fff', flexShrink: 0
                    }}>
                        {role === 'Organization' ? '🏢' : role === 'Validator' ? '⚖️' : displayName.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.8rem', fontWeight: '700' }}>{displayName}</h1>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ background: `${accent}15`, color: accent, padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', border: `1px solid ${accent}30` }}>
                                {role}
                            </span>
                            {onChainProfile?.isRegistered && (
                                <span style={{ background: 'rgba(0,255,136,0.08)', color: '#00ff88', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', border: '1px solid rgba(0,255,136,0.2)' }}>
                                    ✓ Verified On-Chain
                                </span>
                            )}
                            {ethBalance && <span style={{ color: '#666', fontSize: '0.85rem' }}>{parseFloat(ethBalance).toFixed(4)} ETH</span>}
                        </div>
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Overview', 'Edit Profile', 'On-Chain Data'].map(t => {
                        const key = t.toLowerCase().replace(' ', '-');
                        return (
                            <button key={key} onClick={() => setActiveTab(key)}
                                style={{
                                    padding: '0.75rem 1.25rem', background: 'transparent', border: 'none',
                                    borderBottom: activeTab === key ? `2px solid ${accent}` : '2px solid transparent',
                                    color: activeTab === key ? '#fff' : '#666', cursor: 'pointer', fontSize: '0.95rem', transition: 'all 0.2s'
                                }}
                            >{t}</button>
                        );
                    })}
                </div>

                {/* ═══ OVERVIEW TAB ═══ */}
                {activeTab === 'overview' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Bio */}
                        <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                            <h3 style={{ margin: '0 0 1rem', color: '#fff' }}>
                                {role === 'Organization' ? 'About the Company' : role === 'Validator' ? 'About the Validator' : 'About'}
                            </h3>
                            <p style={{ color: '#aaa', lineHeight: '1.7', margin: 0 }}>
                                {bio || `No ${role === 'Organization' ? 'company description' : 'bio'} set yet.`}
                            </p>
                        </div>

                        {/* ── RESEARCHER Overview ── */}
                        {role === 'Researcher' && (
                            <>
                                <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                                    <h3 style={{ margin: '0 0 1rem', color: '#fff' }}>Skills & Expertise</h3>
                                    {skills.length > 0 ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {skills.map((s, i) => (
                                                <span key={i} style={{ background: `${accent}10`, border: `1px solid ${accent}25`, color: accent, padding: '0.4rem 1rem', borderRadius: '20px', fontSize: '0.85rem' }}>{s}</span>
                                            ))}
                                        </div>
                                    ) : <p style={{ color: '#555', margin: 0 }}>No skills added yet.</p>}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Experience Level</div>
                                        <div style={{ color: '#fff', textTransform: 'capitalize' }}>{experience}</div>
                                    </div>
                                    <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Wallet</div>
                                        <div style={{ color: '#ccc', fontSize: '0.8rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>{account || user?.wallet || '—'}</div>
                                    </div>
                                </div>
                                {(website || github || twitter) && (
                                    <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                                        <h3 style={{ margin: '0 0 1rem', color: '#fff' }}>Links</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                            {website && <a href={website} target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: 'none' }}>🌐 {website}</a>}
                                            {github && <a href={`https://github.com/${github}`} target="_blank" rel="noopener noreferrer" style={{ color: '#aaa', textDecoration: 'none' }}>💻 github.com/{github}</a>}
                                            {twitter && <a href={`https://x.com/${twitter}`} target="_blank" rel="noopener noreferrer" style={{ color: '#aaa', textDecoration: 'none' }}>🐦 @{twitter}</a>}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ── ORGANIZATION Overview ── */}
                        {role === 'Organization' && (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                    <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Industry</div>
                                        <div style={{ color: '#fff' }}>{industry || '—'}</div>
                                    </div>
                                    <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Company Size</div>
                                        <div style={{ color: '#fff' }}>{companySize || '—'}</div>
                                    </div>
                                    <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Security Contact</div>
                                        <div style={{ color: accent, fontSize: '0.9rem' }}>{securityContact || '—'}</div>
                                    </div>
                                </div>
                                <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                                    <h3 style={{ margin: '0 0 1rem', color: '#fff' }}>Active Bug Bounty Programs</h3>
                                    {programs.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            {programs.map(p => (
                                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <div>
                                                        <div style={{ fontWeight: '600', color: '#fff' }}>{p.name}</div>
                                                        <div style={{ fontSize: '0.8rem', color: '#666' }}>Scope: {p.scope}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                                        <span style={{ color: '#ff003c', fontSize: '0.85rem', fontWeight: '600' }}>Up to {p.bountyCritical || '0'} ETH</span>
                                                        <span style={{ background: p.active ? 'rgba(0,255,136,0.1)' : 'rgba(255,0,0,0.1)', color: p.active ? '#00ff88' : '#ff4444', padding: '0.2rem 0.6rem', borderRadius: '10px', fontSize: '0.75rem' }}>
                                                            {p.active ? 'Active' : 'Paused'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <p style={{ color: '#555', margin: 0 }}>No bounty programs created yet.</p>}
                                </div>
                                {website && (
                                    <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                                        <h3 style={{ margin: '0 0 1rem', color: '#fff' }}>Company Website</h3>
                                        <a href={website} target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: 'none' }}>🌐 {website}</a>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ── VALIDATOR Overview ── */}
                        {role === 'Validator' && (
                            <>
                                <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                                    <h3 style={{ margin: '0 0 1rem', color: '#fff' }}>Specializations</h3>
                                    {specializations.length > 0 ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {specializations.map((s, i) => (
                                                <span key={i} style={{ background: `${accent}10`, border: `1px solid ${accent}25`, color: accent, padding: '0.4rem 1rem', borderRadius: '20px', fontSize: '0.85rem' }}>{s}</span>
                                            ))}
                                        </div>
                                    ) : <p style={{ color: '#555', margin: 0 }}>No specializations added yet.</p>}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                    <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Availability</div>
                                        <div style={{ color: availability === 'available' ? '#00ff88' : availability === 'busy' ? '#ffcc00' : '#ff4444', textTransform: 'capitalize', fontWeight: '600' }}>
                                            {availability === 'available' ? '🟢' : availability === 'busy' ? '🟡' : '🔴'} {availability}
                                        </div>
                                    </div>
                                    <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Years of Experience</div>
                                        <div style={{ color: '#fff' }}>{yearsExp || '—'} years</div>
                                    </div>
                                    <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Certifications</div>
                                        <div style={{ color: '#fff', fontSize: '0.9rem' }}>{certifications || '—'}</div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ═══ EDIT PROFILE TAB ═══ */}
                {activeTab === 'edit-profile' && (
                    <form onSubmit={handleSaveProfile}>
                        {/* Shared Fields */}
                        <div className="glass" style={{ padding: '2rem', borderRadius: '16px', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: '0 0 1.5rem', color: '#fff' }}>
                                {role === 'Organization' ? 'Company Information' : 'Personal Information'}
                            </h3>
                            <div style={field}>
                                <label style={label}>{role === 'Organization' ? 'Company Name' : 'Display Name'}</label>
                                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} style={input} placeholder={role === 'Organization' ? 'Your company name' : 'Your display name'} />
                            </div>
                            <div style={field}>
                                <label style={label}>{role === 'Organization' ? 'Company Description' : 'Bio'}</label>
                                <textarea value={bio} onChange={e => setBio(e.target.value)} style={{ ...input, minHeight: '120px', resize: 'vertical' }}
                                    placeholder={role === 'Organization' ? 'Describe your company, mission, and what you do...' : role === 'Validator' ? 'Describe your arbitration experience and methodology...' : 'Tell organizations about yourself and your expertise...'}
                                />
                            </div>
                            <div style={field}>
                                <label style={label}>🌐 Website</label>
                                <input type="url" value={website} onChange={e => setWebsite(e.target.value)} style={input} placeholder="https://..." />
                            </div>
                        </div>

                        {/* ── Researcher Edit Fields ── */}
                        {role === 'Researcher' && (
                            <>
                                <div className="glass" style={{ padding: '2rem', borderRadius: '16px', marginBottom: '1.5rem' }}>
                                    <h3 style={{ margin: '0 0 1.5rem', color: '#fff' }}>Skills & Expertise</h3>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <input type="text" value={newSkill} onChange={e => setNewSkill(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(skills, setSkills, newSkill, setNewSkill))}
                                            style={{ ...input, flex: 1 }} placeholder="e.g. Web App Security, Smart Contract Auditing..."
                                        />
                                        <button type="button" onClick={() => addTag(skills, setSkills, newSkill, setNewSkill)} className="btn-primary" style={{ padding: '0.8rem 1.5rem', whiteSpace: 'nowrap' }}>Add</button>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {skills.map((s, i) => (
                                            <span key={i} style={{ background: `${accent}10`, border: `1px solid ${accent}25`, color: accent, padding: '0.4rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {s} <span onClick={() => removeTag(skills, setSkills, s)} style={{ cursor: 'pointer', color: '#ff003c' }}>×</span>
                                            </span>
                                        ))}
                                    </div>
                                    {skills.length === 0 && <p style={{ color: '#555', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>Add up to 10 skills.</p>}
                                </div>
                                <div className="glass" style={{ padding: '2rem', borderRadius: '16px', marginBottom: '1.5rem' }}>
                                    <h3 style={{ margin: '0 0 1.5rem', color: '#fff' }}>Experience & Links</h3>
                                    <div style={field}>
                                        <label style={label}>Experience Level</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {['beginner', 'intermediate', 'advanced', 'expert'].map(level => (
                                                <button type="button" key={level} onClick={() => setExperience(level)} style={{
                                                    flex: 1, padding: '0.6rem', borderRadius: '8px',
                                                    border: experience === level ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.08)',
                                                    background: experience === level ? `${accent}12` : 'transparent',
                                                    color: experience === level ? accent : '#666', cursor: 'pointer', textTransform: 'capitalize', fontSize: '0.85rem'
                                                }}>{level}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={field}><label style={label}>💻 GitHub Username</label><input type="text" value={github} onChange={e => setGithub(e.target.value)} style={input} placeholder="username" /></div>
                                    <div style={{ ...field, marginBottom: 0 }}><label style={label}>🐦 Twitter / X Handle</label><input type="text" value={twitter} onChange={e => setTwitter(e.target.value)} style={input} placeholder="username" /></div>
                                </div>
                            </>
                        )}

                        {/* ── Organization Edit Fields ── */}
                        {role === 'Organization' && (
                            <div className="glass" style={{ padding: '2rem', borderRadius: '16px', marginBottom: '1.5rem' }}>
                                <h3 style={{ margin: '0 0 1.5rem', color: '#fff' }}>Company Details</h3>
                                <div style={field}>
                                    <label style={label}>Industry</label>
                                    <input type="text" value={industry} onChange={e => setIndustry(e.target.value)} style={input} placeholder="e.g. FinTech, Healthcare, DeFi, IoT..." />
                                </div>
                                <div style={field}>
                                    <label style={label}>Company Size</label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {['1-10', '11-50', '51-200', '201-1000', '1000+'].map(size => (
                                            <button type="button" key={size} onClick={() => setCompanySize(size)} style={{
                                                flex: 1, padding: '0.6rem', borderRadius: '8px',
                                                border: companySize === size ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.08)',
                                                background: companySize === size ? `${accent}12` : 'transparent',
                                                color: companySize === size ? accent : '#666', cursor: 'pointer', fontSize: '0.85rem'
                                            }}>{size}</button>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ ...field, marginBottom: 0 }}>
                                    <label style={label}>Security Contact Email</label>
                                    <input type="email" value={securityContact} onChange={e => setSecurityContact(e.target.value)} style={input} placeholder="security@company.com" />
                                </div>
                            </div>
                        )}

                        {/* ── Validator Edit Fields ── */}
                        {role === 'Validator' && (
                            <>
                                <div className="glass" style={{ padding: '2rem', borderRadius: '16px', marginBottom: '1.5rem' }}>
                                    <h3 style={{ margin: '0 0 1.5rem', color: '#fff' }}>Specializations</h3>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <input type="text" value={newSpec} onChange={e => setNewSpec(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(specializations, setSpecializations, newSpec, setNewSpec))}
                                            style={{ ...input, flex: 1 }} placeholder="e.g. Smart Contract Exploits, Network Security, Forensics..."
                                        />
                                        <button type="button" onClick={() => addTag(specializations, setSpecializations, newSpec, setNewSpec)} className="btn-primary" style={{ padding: '0.8rem 1.5rem', whiteSpace: 'nowrap' }}>Add</button>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {specializations.map((s, i) => (
                                            <span key={i} style={{ background: `${accent}10`, border: `1px solid ${accent}25`, color: accent, padding: '0.4rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {s} <span onClick={() => removeTag(specializations, setSpecializations, s)} style={{ cursor: 'pointer', color: '#ff003c' }}>×</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="glass" style={{ padding: '2rem', borderRadius: '16px', marginBottom: '1.5rem' }}>
                                    <h3 style={{ margin: '0 0 1.5rem', color: '#fff' }}>Credentials & Availability</h3>
                                    <div style={field}>
                                        <label style={label}>Certifications</label>
                                        <input type="text" value={certifications} onChange={e => setCertifications(e.target.value)} style={input} placeholder="e.g. OSCP, CEH, CISSP..." />
                                    </div>
                                    <div style={field}>
                                        <label style={label}>Years of Security Experience</label>
                                        <input type="number" value={yearsExp} onChange={e => setYearsExp(e.target.value)} style={input} placeholder="e.g. 5" />
                                    </div>
                                    <div style={{ ...field, marginBottom: 0 }}>
                                        <label style={label}>Availability Status</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {[{ key: 'available', icon: '🟢', label: 'Available' }, { key: 'busy', icon: '🟡', label: 'Busy' }, { key: 'unavailable', icon: '🔴', label: 'Unavailable' }].map(a => (
                                                <button type="button" key={a.key} onClick={() => setAvailability(a.key)} style={{
                                                    flex: 1, padding: '0.7rem', borderRadius: '8px',
                                                    border: availability === a.key ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.08)',
                                                    background: availability === a.key ? `${accent}12` : 'transparent',
                                                    color: availability === a.key ? '#fff' : '#666', cursor: 'pointer', fontSize: '0.9rem'
                                                }}>{a.icon} {a.label}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        <button type="submit" disabled={saving} className="btn-primary"
                            style={{ width: '100%', padding: '1rem', fontSize: '1.05rem', opacity: saving ? 0.7 : 1 }}>
                            {saving ? 'Saving to IPFS...' : 'Save Profile to IPFS (No Gas Fee)'}
                        </button>
                        {saveStatus && (
                            <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '10px', textAlign: 'center',
                                background: saveStatus.includes('saved') ? 'rgba(0,255,136,0.06)' : 'rgba(255,0,60,0.06)',
                                border: saveStatus.includes('saved') ? '1px solid rgba(0,255,136,0.15)' : '1px solid rgba(255,0,60,0.15)',
                                color: saveStatus.includes('saved') ? '#00ff88' : '#ff003c', fontSize: '0.9rem'
                            }}>{saveStatus}</div>
                        )}
                    </form>
                )}

                {/* ═══ ON-CHAIN DATA TAB ═══ */}
                {activeTab === 'on-chain-data' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                            <h3 style={{ margin: '0 0 1.5rem', color: '#fff' }}>Blockchain Identity</h3>
                            <p style={{ color: '#555', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                                Immutable data stored permanently on the Ethereum blockchain.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {[
                                    { label: 'Wallet Address', value: account || user?.wallet || '—', mono: true },
                                    { label: 'Registered Name', value: onChainProfile?.name || '—' },
                                    { label: 'On-Chain Role', value: onChainProfile ? roleNames[onChainProfile.role] : role },
                                    { label: 'Registration', value: onChainProfile?.isRegistered ? '✅ Verified' : '❌ Not Registered', highlight: onChainProfile?.isRegistered },
                                    { label: 'Profile IPFS CID', value: onChainProfile?.profileCid || 'None', mono: true, link: onChainProfile?.profileCid ? `/api/ipfs/read?cid=${onChainProfile.profileCid}` : null },
                                    { label: 'ETH Balance', value: ethBalance ? `${parseFloat(ethBalance).toFixed(4)} ETH` : '—' },
                                ].map((item, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', minWidth: '160px' }}>{item.label}</div>
                                        {item.link ? (
                                            <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: accent, wordBreak: 'break-all', textAlign: 'right' }}>{item.value}</a>
                                        ) : (
                                            <div style={{ fontFamily: item.mono ? 'monospace' : 'inherit', fontSize: '0.9rem', color: item.highlight ? '#00ff88' : '#ccc', wordBreak: 'break-all', textAlign: 'right' }}>{item.value}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ padding: '1.25rem 1.5rem', borderRadius: '12px', background: `${accent}08`, border: `1px solid ${accent}15`, fontSize: '0.85rem', color: '#888', lineHeight: '1.6' }}>
                            ℹ️ On-chain identity (name, role, wallet) is immutable. Extended profile data is stored on IPFS and can be updated anytime without gas fees.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
