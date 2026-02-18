export default function AboutPage() {
  return (
    <div className="about">
      <section className="card">
        <h2>What is CipherMint?</h2>
        <p>
          CipherMint is a KYC-gated UBI experiment for unique names, built on
          Zama&apos;s FHEVM. Each verified human with a unique full name can
          claim an initial allocation of test tokens and then receive ongoing
          monthly income. This UBI token is the base currency for all SBA DeFi
          and RWA demos.
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
            The token acts as shared test liquidity for SBA&apos;s DeFi and RWA
            demos.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>How it works</h2>
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
            Once verified, you can claim an initial drop of UBI tokens and then
            accrue monthly income tied to your unique name.
          </li>
          <li>
            Transfers remain confidential and are restricted to verified
            addresses only.
          </li>
        </ol>
      </section>

      <section className="card">
        <h2>High-level architecture</h2>
        <div className="about-architecture">
          <div>
            <strong>Frontend</strong>
            <span>
              Wallet login, landing &amp; dashboard, UBI claim UI, encrypted
              balance reads
            </span>
          </div>
          <div>
            <strong>Backend</strong>
            <span>
              KYC provider webhooks, name uniqueness checks, registry writes
            </span>
          </div>
          <div>
            <strong>Zama FHEVM</strong>
            <span>
              IdentityRegistry + CompliantERC20 enforcing KYC-gated UBI and
              confidential transfers
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
          eligibility, name uniqueness, and transfer compliance can be enforced
          on-chain without revealing sensitive data, allowing SBA&apos;s DeFi
          demos to stay both confidential and compliant.
        </p>
      </section>
    </div>
  );
}
