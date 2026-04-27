export default function AboutPage() {
  return (
    <div className="about">
      <section className="card">
        <h2>What is CipherMint?</h2>
        <p>
          CipherMint is a confidential, compliant monetary stack built on
          Zama&apos;s FHEVM. Verified humans with unique names can claim and
          accrue <strong>SBA</strong> (UBI token), then use SBA in the{" "}
          <strong>Central Bank Vault</strong> to mint <strong>CSBA</strong>{" "}
          shares with a compounded SBA share price and delayed exit flow.
        </p>
      </section>

      <section className="card">
        <h2>Key principles</h2>
        <ul className="about-list">
          <li>No raw PII is stored in the backend or on-chain.</li>
          <li>
            A verified user&apos;s unique full name is linked to their wallet in
            the IdentityRegistry using encrypted attributes.
          </li>
          <li>Full-name uniqueness is enforced on-chain by the contracts.</li>
          <li>
            UBI is only available to KYC&apos;d humans passing age and uniqueness
            checks.
          </li>
          <li>
            The system has two monetary layers: SBA (UBI + transfers) and CSBA
            (vault shares for delayed redemption).
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>How UBI works</h2>
        <ol className="about-list">
          <li>Connect your wallet and check your on-chain identity status.</li>
          <li>
            If not verified, complete the off-chain KYC flow to prove age and
            uniqueness.
          </li>
          <li>
            The backend uses Zama FHEVM to register your encrypted identity
            attributes and unique name.
          </li>
          <li>
            Once verified, you can claim a one-time drop of <strong>100 SBA</strong>.
            After that, your address continuously accrues encrypted income at a
            rate calibrated to about <strong>10 SBA per month</strong>, which
            you can periodically claim as &quot;accrued income&quot;.
          </li>
          <li>
            Transfers remain confidential and are restricted to verified
            addresses only.
          </li>
        </ol>
      </section>

      <section className="card">
        <h2>How the Central Bank Vault works</h2>
        <ol className="about-list">
          <li>
            Deposit encrypted <strong>SBA</strong> into the vault to receive{" "}
            <strong>CSBA</strong> shares.
          </li>
          <li>
            CSBA value is based on <code>sharePriceScaled</code>, which compounds
            monthly using <code>monthlyRateBps</code>.
          </li>
          <li>
            Withdrawals are two-step: first{" "}
            <code>requestWithdraw</code> to lock CSBA for one month, then{" "}
            <code>completeWithdraw</code> after unlock.
          </li>
          <li>
            Each request is stored as its own pending position, so users can run
            multiple withdrawals in parallel and complete them independently.
          </li>
        </ol>
      </section>

      <section className="card">
        <h2>High-level architecture</h2>
        <div className="about-architecture">
          <div>
            <strong>Frontend</strong>
            <span>
              Wallet login, KYC flow, UBI actions, vault actions, encrypted
              balance and pending-position reads
            </span>
          </div>
          <div>
            <strong>Backend</strong>
            <span>
              KYC provider webhooks, name uniqueness checks, registry writes,
              relayer-backed attestation jobs
            </span>
          </div>
          <div>
            <strong>Zama FHEVM</strong>
            <span>
              IdentityRegistry + ComplianceRules + CompliantUBI (SBA) +
              CipherCentralBank (CSBA)
            </span>
          </div>
          <div>
            <strong>KYC Provider</strong>
            <span>Hosted KYC verification for age and uniqueness</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Privacy and compliance</h2>
        <p>
          CipherMint stores no documents or raw PII. The chain only holds
          encrypted attributes and hashed identifiers. Using Zama FHEVM, UBI
          eligibility, name uniqueness, transfer gating, and vault accounting
          are enforced on-chain without revealing sensitive data, allowing SBA
          and CSBA flows to remain confidential and compliant.
        </p>
      </section>
    </div>
  );
}
