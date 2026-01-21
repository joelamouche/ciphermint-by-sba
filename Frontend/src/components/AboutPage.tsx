export default function AboutPage() {
  return (
    <div className="about">
      <section className="card">
        <h2>What is CipherMint?</h2>
        <p>
          CipherMint is a confidential RWA proof of concept built on Zama FHEVM.
          It demonstrates a compliant ERC-20 where verified humans (age 18+ with
          a unique name) can mint 100 tokens, and transfers are confidential and
          restricted to verified holders.
        </p>
      </section>

      <section className="card">
        <h2>Key principles</h2>
        <ul className="about-list">
          <li>No PII stored in the backend.</li>
          <li>
            Backend writes a user&apos;s name string to IdentityRegistry, tied
            to their wallet.
          </li>
          <li>Name uniqueness is enforced on-chain by the contracts.</li>
          <li>Minting is allowed once per verified address.</li>
          <li>Transfers only succeed between verified addresses.</li>
        </ul>
      </section>

      <section className="card">
        <h2>How it works</h2>
        <ol className="about-list">
          <li>Connect wallet and check on-chain identity status.</li>
          <li>If not verified, start the Didit KYC flow.</li>
          <li>Backend writes the verified name to IdentityRegistry.</li>
          <li>Verified users can claim 100 tokens once.</li>
          <li>Transfers are confidential and compliance-checked.</li>
        </ol>
      </section>

      <section className="card">
        <h2>High-level architecture</h2>
        <div className="about-architecture">
          <div>
            <strong>Frontend</strong>
            <span>Wallet login + KYC flow + encrypted reads</span>
          </div>
          <div>
            <strong>Backend</strong>
            <span>Didit webhook, name uniqueness, registry writes</span>
          </div>
          <div>
            <strong>Zama FHEVM</strong>
            <span>IdentityRegistry + CompliantERC20</span>
          </div>
          <div>
            <strong>Didit</strong>
            <span>Hosted KYC verification</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Privacy and compliance</h2>
        <p>
          CipherMint stores no documents or PII. The chain only holds encrypted
          attributes and hashed names. Compliance checks happen on-chain without
          revealing sensitive data.
        </p>
      </section>
    </div>
  );
}
