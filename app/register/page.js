"use client";
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Register() {
    const router = useRouter();
    const { register } = useAuth();
    const [role, setRole] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [step, setStep] = useState(1); // 1: Pick Role, 2: Fill Details

    // Shared Fields
    const [name, setName] = useState('');

    // Researcher Fields
    const [researcherAlias, setResearcherAlias] = useState('');
    const [researcherExpertise, setResearcherExpertise] = useState('');
    const [researcherExperience, setResearcherExperience] = useState('');

    // Organization Fields
    const [companyName, setCompanyName] = useState('');
    const [companyWebsite, setCompanyWebsite] = useState('');
    const [companyIndustry, setCompanyIndustry] = useState('');
    const [companyRegNumber, setCompanyRegNumber] = useState('');
    const [companyDescription, setCompanyDescription] = useState('');

    // Validator Fields
    const [validatorExpertise, setValidatorExpertise] = useState('');
    const [validatorYearsExp, setValidatorYearsExp] = useState('');
    const [validatorCertifications, setValidatorCertifications] = useState('');
    const [validatorPortfolio, setValidatorPortfolio] = useState('');

    const roleDescriptions = {
        Researcher: "Security researchers discover and report vulnerabilities in exchange for bounty rewards.",
        Organization: "Organizations publish bug bounty programs, review reports, and manage escrow vaults.",
        Validator: "Validators arbitrate disputes between Researchers and Organizations, earning 10% arbitration fees."
    };

    const roleIcons = {
        Researcher: "🔍",
        Organization: "🏢",
        Validator: "⚖️"
    };

    const buildProfileData = () => {
        switch (role) {
            case 'Researcher':
                return {
                    alias: researcherAlias || name,
                    expertise: researcherExpertise,
                    yearsExperience: researcherExperience,
                    type: 'researcher_profile'
                };
            case 'Organization':
                return {
                    companyName,
                    website: companyWebsite,
                    industry: companyIndustry,
                    registrationNumber: companyRegNumber,
                    description: companyDescription,
                    type: 'organization_profile'
                };
            case 'Validator':
                return {
                    expertise: validatorExpertise,
                    yearsExperience: validatorYearsExp,
                    certifications: validatorCertifications,
                    portfolio: validatorPortfolio,
                    type: 'validator_profile'
                };
            default:
                return {};
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            const profileData = buildProfileData();
            const res = await register(name, role, profileData);

            if (!res.success) {
                throw new Error(res.error);
            }

            setSuccessMsg(`Identity committed to blockchain! TX: ${res.txHash?.substring(0, 10)}...`);

            setTimeout(() => {
                const roleMap = {
                    "Researcher": "/dashboard/researcher",
                    "Organization": "/dashboard/org",
                    "Validator": "/dashboard/validator"
                };
                router.push(roleMap[role] || "/");
            }, 2500);

        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    const inputStyle = {
        width: '100%', padding: '0.8rem', borderRadius: '8px',
        border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff',
        fontSize: '0.95rem', outline: 'none'
    };

    const labelStyle = { display: 'block', marginBottom: '0.4rem', color: '#aaa', fontSize: '0.85rem' };

    return (
        <div className="page-content" style={{ background: 'radial-gradient(circle at top, #1a1a2e, #0a0a0a)' }}>
            <Navbar />
            <div className="container" style={{ maxWidth: '600px', paddingBottom: '4rem' }}>
                <h1 className="gradient-text" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                    Register on Blockchain
                </h1>
                <p style={{ textAlign: 'center', color: '#888', marginBottom: '2rem' }}>
                    Your identity will be permanently recorded on the Ethereum network via IPFS
                </p>

                {/* ═══ STEP 1: Role Selection ═══ */}
                {step === 1 && (
                    <div>
                        <p style={{ color: '#ccc', textAlign: 'center', marginBottom: '1.5rem' }}>
                            Choose your role in the DecenBug ecosystem
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {['Researcher', 'Organization', 'Validator'].map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => { setRole(r); setStep(2); }}
                                    className="glass"
                                    style={{
                                        padding: '1.5rem 2rem',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        display: 'flex', gap: '1.5rem', alignItems: 'center',
                                        transition: 'all 0.2s',
                                        background: 'rgba(255,255,255,0.03)'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'rgba(0,240,255,0.05)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                >
                                    <div style={{ fontSize: '2.5rem', width: '60px', textAlign: 'center' }}>
                                        {roleIcons[r]}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: '0 0 0.3rem 0', color: '#fff' }}>{r}</h3>
                                        <p style={{ margin: 0, color: '#888', fontSize: '0.85rem', lineHeight: '1.4' }}>
                                            {roleDescriptions[r]}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>

                        <p style={{ marginTop: '1.5rem', textAlign: 'center', color: '#666', fontSize: '0.85rem' }}>
                            Already registered?{' '}
                            <Link href="/login" style={{ color: 'var(--primary)' }}>Login with Wallet</Link>
                        </p>
                    </div>
                )}

                {/* ═══ STEP 2: Detail Form ═══ */}
                {step === 2 && (
                    <div>
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            style={{
                                background: 'transparent', border: 'none', color: '#888',
                                cursor: 'pointer', marginBottom: '1rem', fontSize: '0.9rem'
                            }}
                        >
                            ← Back to Role Selection
                        </button>

                        <div className="glass" style={{
                            padding: '0.8rem 1.2rem', borderRadius: '8px', display: 'flex',
                            alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem',
                            borderLeft: '3px solid var(--primary)'
                        }}>
                            <span style={{ fontSize: '1.5rem' }}>{roleIcons[role]}</span>
                            <div>
                                <strong style={{ color: '#fff' }}>Registering as: {role}</strong>
                                <p style={{ margin: 0, color: '#888', fontSize: '0.8rem' }}>
                                    All details are uploaded to IPFS and linked to your wallet on-chain
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleRegister} className="glass" style={{ padding: '2rem', borderRadius: '12px' }}>

                            {/* ─── Common: Display Name ─── */}
                            <div style={{ marginBottom: '1.2rem' }}>
                                <label style={labelStyle}>Display Name *</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    style={inputStyle}
                                    placeholder={role === 'Organization' ? 'Contact Person Full Name' : 'Your Full Name'}
                                    required
                                />
                            </div>

                            {/* ─── RESEARCHER FIELDS ─── */}
                            {role === 'Researcher' && (
                                <>
                                    <div style={{ marginBottom: '1.2rem' }}>
                                        <label style={labelStyle}>Hacker Alias</label>
                                        <input
                                            type="text"
                                            value={researcherAlias}
                                            onChange={e => setResearcherAlias(e.target.value)}
                                            style={inputStyle}
                                            placeholder="e.g. z3r0day, BugHunter42"
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.2rem' }}>
                                        <div>
                                            <label style={labelStyle}>Area of Expertise</label>
                                            <select
                                                value={researcherExpertise}
                                                onChange={e => setResearcherExpertise(e.target.value)}
                                                style={{ ...inputStyle, cursor: 'pointer' }}
                                            >
                                                <option value="" style={{ background: '#1a1a2e' }}>Select...</option>
                                                <option value="Web Application" style={{ background: '#1a1a2e' }}>Web Application</option>
                                                <option value="Smart Contract" style={{ background: '#1a1a2e' }}>Smart Contract</option>
                                                <option value="Mobile Security" style={{ background: '#1a1a2e' }}>Mobile Security</option>
                                                <option value="Network Security" style={{ background: '#1a1a2e' }}>Network Security</option>
                                                <option value="Cloud/Infrastructure" style={{ background: '#1a1a2e' }}>Cloud/Infrastructure</option>
                                                <option value="API Security" style={{ background: '#1a1a2e' }}>API Security</option>
                                                <option value="General" style={{ background: '#1a1a2e' }}>General</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Years of Experience</label>
                                            <select
                                                value={researcherExperience}
                                                onChange={e => setResearcherExperience(e.target.value)}
                                                style={{ ...inputStyle, cursor: 'pointer' }}
                                            >
                                                <option value="" style={{ background: '#1a1a2e' }}>Select...</option>
                                                <option value="0-1" style={{ background: '#1a1a2e' }}>0 - 1 year</option>
                                                <option value="1-3" style={{ background: '#1a1a2e' }}>1 - 3 years</option>
                                                <option value="3-5" style={{ background: '#1a1a2e' }}>3 - 5 years</option>
                                                <option value="5+" style={{ background: '#1a1a2e' }}>5+ years</option>
                                            </select>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* ─── ORGANIZATION FIELDS ─── */}
                            {role === 'Organization' && (
                                <>
                                    <div style={{ marginBottom: '1.2rem' }}>
                                        <label style={labelStyle}>Company / Organization Name *</label>
                                        <input
                                            type="text"
                                            value={companyName}
                                            onChange={e => setCompanyName(e.target.value)}
                                            style={inputStyle}
                                            placeholder="e.g. Tesla Inc., OpenAI"
                                            required
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.2rem' }}>
                                        <div>
                                            <label style={labelStyle}>Company Website *</label>
                                            <input
                                                type="url"
                                                value={companyWebsite}
                                                onChange={e => setCompanyWebsite(e.target.value)}
                                                style={inputStyle}
                                                placeholder="https://example.com"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Industry / Sector *</label>
                                            <select
                                                value={companyIndustry}
                                                onChange={e => setCompanyIndustry(e.target.value)}
                                                style={{ ...inputStyle, cursor: 'pointer' }}
                                                required
                                            >
                                                <option value="" style={{ background: '#1a1a2e' }}>Select...</option>
                                                <option value="Technology" style={{ background: '#1a1a2e' }}>Technology</option>
                                                <option value="Finance / DeFi" style={{ background: '#1a1a2e' }}>Finance / DeFi</option>
                                                <option value="Healthcare" style={{ background: '#1a1a2e' }}>Healthcare</option>
                                                <option value="E-Commerce" style={{ background: '#1a1a2e' }}>E-Commerce</option>
                                                <option value="Blockchain / Web3" style={{ background: '#1a1a2e' }}>Blockchain / Web3</option>
                                                <option value="Government" style={{ background: '#1a1a2e' }}>Government</option>
                                                <option value="Other" style={{ background: '#1a1a2e' }}>Other</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '1.2rem' }}>
                                        <label style={labelStyle}>Business Registration No. / Company ID *</label>
                                        <input
                                            type="text"
                                            value={companyRegNumber}
                                            onChange={e => setCompanyRegNumber(e.target.value)}
                                            style={inputStyle}
                                            placeholder="e.g. 202201012345 (SSM / EIN / CRN)"
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '1.2rem' }}>
                                        <label style={labelStyle}>About Your Organization</label>
                                        <textarea
                                            value={companyDescription}
                                            onChange={e => setCompanyDescription(e.target.value)}
                                            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                                            placeholder="Briefly describe what your company does..."
                                        />
                                    </div>
                                </>
                            )}

                            {/* ─── VALIDATOR FIELDS ─── */}
                            {role === 'Validator' && (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.2rem' }}>
                                        <div>
                                            <label style={labelStyle}>Security Expertise *</label>
                                            <select
                                                value={validatorExpertise}
                                                onChange={e => setValidatorExpertise(e.target.value)}
                                                style={{ ...inputStyle, cursor: 'pointer' }}
                                                required
                                            >
                                                <option value="" style={{ background: '#1a1a2e' }}>Select...</option>
                                                <option value="Web Application Security" style={{ background: '#1a1a2e' }}>Web Application Security</option>
                                                <option value="Smart Contract Auditing" style={{ background: '#1a1a2e' }}>Smart Contract Auditing</option>
                                                <option value="Network Penetration Testing" style={{ background: '#1a1a2e' }}>Network Penetration</option>
                                                <option value="Mobile Application Security" style={{ background: '#1a1a2e' }}>Mobile App Security</option>
                                                <option value="Cloud Security" style={{ background: '#1a1a2e' }}>Cloud Security</option>
                                                <option value="General Security" style={{ background: '#1a1a2e' }}>General Security</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Years in Security *</label>
                                            <select
                                                value={validatorYearsExp}
                                                onChange={e => setValidatorYearsExp(e.target.value)}
                                                style={{ ...inputStyle, cursor: 'pointer' }}
                                                required
                                            >
                                                <option value="" style={{ background: '#1a1a2e' }}>Select...</option>
                                                <option value="1-3" style={{ background: '#1a1a2e' }}>1 - 3 years</option>
                                                <option value="3-5" style={{ background: '#1a1a2e' }}>3 - 5 years</option>
                                                <option value="5-10" style={{ background: '#1a1a2e' }}>5 - 10 years</option>
                                                <option value="10+" style={{ background: '#1a1a2e' }}>10+ years</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '1.2rem' }}>
                                        <label style={labelStyle}>Security Certifications *</label>
                                        <input
                                            type="text"
                                            value={validatorCertifications}
                                            onChange={e => setValidatorCertifications(e.target.value)}
                                            style={inputStyle}
                                            placeholder="e.g. OSCP, CEH, GPEN, CISSP (comma separated)"
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '1.2rem' }}>
                                        <label style={labelStyle}>Portfolio / LinkedIn URL</label>
                                        <input
                                            type="url"
                                            value={validatorPortfolio}
                                            onChange={e => setValidatorPortfolio(e.target.value)}
                                            style={inputStyle}
                                            placeholder="https://linkedin.com/in/yourprofile"
                                        />
                                    </div>
                                </>
                            )}

                            {/* ─── MetaMask Commit Section ─── */}
                            <div style={{
                                margin: '1.5rem 0', padding: '1rem', borderRadius: '8px',
                                background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.2)'
                            }}>
                                <p style={{ color: '#ffaa00', fontSize: '0.85rem', margin: 0, lineHeight: '1.5' }}>
                                    ⚠️ Clicking &quot;Register&quot; will trigger <strong>two</strong> actions:<br />
                                    1. Upload your profile details to IPFS (decentralized storage)<br />
                                    2. Record your identity on the Ethereum Blockchain (MetaMask Gas Fee)
                                </p>
                            </div>

                            {error && (
                                <div style={{
                                    padding: '1rem', marginBottom: '1rem', borderRadius: '8px',
                                    background: 'rgba(255,0,60,0.1)', border: '1px solid rgba(255,0,60,0.3)',
                                    color: '#ff4444', fontSize: '0.9rem'
                                }}>
                                    {error}
                                </div>
                            )}
                            {successMsg && (
                                <div style={{
                                    padding: '1rem', marginBottom: '1rem', borderRadius: '8px',
                                    background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)',
                                    color: '#00ff88', fontSize: '0.9rem', textAlign: 'center'
                                }}>
                                    ✅ {successMsg}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || successMsg !== ''}
                                className="btn-primary"
                                style={{
                                    width: '100%', padding: '1.2rem', fontSize: '1.1rem',
                                    opacity: loading || successMsg ? 0.7 : 1,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem'
                                }}
                            >
                                {loading ? 'Committing to Blockchain...' : successMsg ? '✅ Registered!' : '🦊 Connect Wallet & Register'}
                            </button>

                            <p style={{ marginTop: '1rem', textAlign: 'center', color: '#666', fontSize: '0.85rem' }}>
                                Already registered?{' '}
                                <Link href="/login" style={{ color: 'var(--primary)' }}>Login with Wallet</Link>
                            </p>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
