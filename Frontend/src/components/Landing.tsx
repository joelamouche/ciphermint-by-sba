interface LandingProps {
  onContinue: () => void;
}

export function Landing({ onContinue }: LandingProps) {
  return (
    <div className="landing">
      <section className="landing-card">
        <div className="landing-copy">
          <h1 className="landing-title">CipherMint</h1>
          <p className="landing-tagline">
            <span>KYC gated UBI for unique names</span>
            <span className="landing-tagline-separator">•</span>
            <span className="landing-tagline-secondary">
              Confidentiality secured by Zama
            </span>
          </p>
          <p className="landing-subtitle">
            Private UBI test currency for verified unique names, powering all SBA
            DeFi and RWA demos.
          </p>
        </div>
        <div className="landing-actions">
          <button type="button" onClick={onContinue}>
            Claim your tokens
          </button>
        </div>
        <div className="landing-logos">
          <div className="landing-logo-group">
            <img
              src="/sba-logo-transparent.png"
              alt="Steven Blockchain Advisory logo"
              className="landing-logo-image"
            />
            <span className="landing-logo-text">Steven Blockchain Advisory</span>
          </div>
          <div className="landing-logo-group">
            <img
              src="/zama-logo.png"
              alt="Zama logo"
              className="landing-logo-image"
            />
            <span className="landing-logo-text">Powered by Zama FHEVM</span>
          </div>
        </div>
      </section>
    </div>
  );
}

