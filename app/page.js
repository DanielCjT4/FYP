"use client";
import Navbar from "./components/Navbar";
import Link from "next/link";

export default function Home() {
  return (
    <main style={{ background: 'var(--background)', minHeight: '100vh', position: 'relative' }}>
      <Navbar />

      {/* Animated background orbs & grid */}
      <div className="landing-bg" />
      <div className="grid-overlay" />

      {/* ===== HERO ===== */}
      <section className="hero-section">
        <div className="hero-inner">
          <div className="hero-badge">
            <span className="dot" />
            Built on Ethereum &amp; IPFS
          </div>

          <h1 className="hero-title">
            <span className="white">Secure Bugs.</span>
            <br />
            <span className="gradient-text">Earn Rewards.</span>
          </h1>

          <p className="hero-subtitle">
            The first fully decentralized vulnerability disclosure platform
            where security researchers, organizations, and validators collaborate
            transparently on-chain.
          </p>

          <p className="hero-desc">
            Submit reports to IPFS. Prove discovery on the blockchain.
            Resolve disputes fairly with independent validators.
            No middlemen. No censorship.
          </p>

          <div className="hero-actions">
            <Link href="/register" className="btn-primary">
              Get Started →
            </Link>
            <a href="#how-it-works" className="btn-secondary">
              Learn More
            </a>
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <div className="num gradient-text">100%</div>
              <div className="label">On-Chain</div>
            </div>
            <div className="hero-stat">
              <div className="num gradient-text">IPFS</div>
              <div className="label">Data Storage</div>
            </div>
            <div className="hero-stat">
              <div className="num gradient-text">3</div>
              <div className="label">Actor Roles</div>
            </div>
            <div className="hero-stat">
              <div className="num gradient-text">0</div>
              <div className="label">Middlemen</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== DIVIDER ===== */}
      <div className="section-divider" />

      {/* ===== HOW IT WORKS ===== */}
      <section className="how-section" id="how-it-works">
        <div className="section-label">How It Works</div>
        <h2 className="section-title">Three Steps to Transparent Security</h2>
        <p className="section-desc">
          DecenBug replaces traditional bug bounty platforms with an immutable,
          trust-minimized disclosure workflow powered by smart contracts.
        </p>

        <div className="steps-grid">
          {/* Step 1 */}
          <div className="step-card">
            <div className="step-icon">🔍</div>
            <div className="step-num cyan">STEP 01</div>
            <h3>Discover &amp; Submit</h3>
            <p>
              Security researchers discover vulnerabilities and submit encrypted
              report artifacts to IPFS. The CID hash is committed to the Ethereum
              blockchain as immutable proof of discovery.
            </p>
          </div>

          {/* Step 2 */}
          <div className="step-card">
            <div className="step-icon">✅</div>
            <div className="step-num purple">STEP 02</div>
            <h3>Review &amp; Validate</h3>
            <p>
              Organizations review submitted artifacts, acknowledge, and validate
              reports on-chain. Every status change is recorded permanently —
              creating a transparent audit trail.
            </p>
          </div>

          {/* Step 3 */}
          <div className="step-card">
            <div className="step-icon">⚖️</div>
            <div className="step-num red">STEP 03</div>
            <h3>Dispute &amp; Resolve</h3>
            <p>
              In case of disagreement, independent validators arbitrate disputes
              through on-chain resolution. Bounties are released from escrow vaults
              directly to researcher wallets.
            </p>
          </div>
        </div>
      </section>

      {/* ===== DIVIDER ===== */}
      <div className="section-divider" />

      {/* ===== JOIN US / ROLES ===== */}
      <section className="roles-section" id="join-us">
        <div style={{ textAlign: 'center' }}>
          <div className="section-label">Join The Ecosystem</div>
          <h2 className="section-title" style={{ margin: '0 auto 0.5rem' }}>Choose Your Role</h2>
          <p className="section-desc" style={{ margin: '0 auto', textAlign: 'center' }}>
            Every participant is verified through their on-chain identity.
            Pick the role that fits you and start contributing today.
          </p>
        </div>

        <div className="roles-grid">
          {/* Researcher */}
          <div className="role-card researcher">
            <div className="role-icon-wrapper cyan">🛡️</div>
            <h3>Researcher</h3>
            <p>
              Security experts who discover and responsibly report vulnerabilities
              in exchange for blockchain-verified bounty rewards.
            </p>
            <ul>
              <li><span className="check cyan">✓</span> Submit reports to IPFS</li>
              <li><span className="check cyan">✓</span> Proof-of-discovery on-chain</li>
              <li><span className="check cyan">✓</span> Receive ETH bounties directly</li>
              <li><span className="check cyan">✓</span> Raise disputes if rejected unfairly</li>
            </ul>
            <Link href="/register" className="role-cta cyan">
              Join as Researcher →
            </Link>
          </div>

          {/* Organization */}
          <div className="role-card org">
            <div className="role-icon-wrapper purple">🏢</div>
            <h3>Organization</h3>
            <p>
              Companies and projects that publish bug bounty programs, review
              vulnerability reports, and manage escrow reward vaults.
            </p>
            <ul>
              <li><span className="check purple">✓</span> Publish bounty programs</li>
              <li><span className="check purple">✓</span> Review &amp; validate reports</li>
              <li><span className="check purple">✓</span> Fund escrow vaults with ETH</li>
              <li><span className="check purple">✓</span> Transparent audit trail</li>
            </ul>
            <Link href="/register" className="role-cta purple">
              Join as Organization →
            </Link>
          </div>

          {/* Validator */}
          <div className="role-card validator">
            <div className="role-icon-wrapper red">⚔️</div>
            <h3>Validator</h3>
            <p>
              Independent arbitrators who resolve disputes between researchers
              and organizations, earning 10% arbitration fees.
            </p>
            <ul>
              <li><span className="check red">✓</span> Arbitrate disputed reports</li>
              <li><span className="check red">✓</span> Earn 10% arbitration fee</li>
              <li><span className="check red">✓</span> Maintain platform fairness</li>
              <li><span className="check red">✓</span> On-chain decision records</li>
            </ul>
            <Link href="/register" className="role-cta red">
              Join as Validator →
            </Link>
          </div>
        </div>
      </section>

      {/* ===== DIVIDER ===== */}
      <div className="section-divider" />

      {/* ===== TRUST / TECH ===== */}
      <section className="trust-section">
        <div className="section-label">Why DecenBug?</div>
        <h2 className="section-title" style={{ margin: '0 auto 0.5rem' }}>Built Different. Built Decentralized.</h2>
        <p className="section-desc" style={{ margin: '0 auto', textAlign: 'center' }}>
          Unlike traditional platforms, every action on DecenBug is verifiable,
          tamper-proof, and censorship-resistant.
        </p>

        <div className="trust-grid">
          <div className="trust-item">
            <div className="icon">🔗</div>
            <h4>Ethereum Blockchain</h4>
            <p>Every report, status change, and payment is recorded immutably on Ethereum smart contracts.</p>
          </div>
          <div className="trust-item">
            <div className="icon">📦</div>
            <h4>IPFS Storage</h4>
            <p>Report artifacts and user profiles are stored on the InterPlanetary File System — no single point of failure.</p>
          </div>
          <div className="trust-item">
            <div className="icon">🔐</div>
            <h4>Wallet Identity</h4>
            <p>No passwords or emails. Your MetaMask wallet IS your identity — verified cryptographically.</p>
          </div>
          <div className="trust-item">
            <div className="icon">💰</div>
            <h4>Escrow Vaults</h4>
            <p>Organizations fund on-chain escrow vaults. Bounties are released automatically upon validation.</p>
          </div>
        </div>
      </section>

      {/* ===== CTA BANNER ===== */}
      <section className="cta-banner">
        <h2>Ready to Secure the Future?</h2>
        <p>
          Connect your wallet, choose your role, and become part of the most
          transparent bug bounty ecosystem on the blockchain.
        </p>
        <Link href="/register" className="btn-primary">
          Create Your On-Chain Identity →
        </Link>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="landing-footer">
        <div className="footer-links">
          <a href="#how-it-works">How It Works</a>
          <a href="#join-us">Join Us</a>
          <Link href="/register">Register</Link>
          <Link href="/login">Login</Link>
        </div>
        <p>© 2026 DecenBug — Decentralized Vulnerability Disclosure Platform. All rights reserved.</p>
      </footer>
    </main>
  );
}
