# Backend for CipherMint

---

## ✨ Tech Stack (Concrete)

| Layer             | Tech                                       |
| ----------------- | ------------------------------------------ |
| Language          | **TypeScript**                             |
| Runtime           | **Node.js**                                |
| Web Framework     | **Express** (or **NestJS**)                |
| Auth              | **SIWE (Sign-in with Ethereum)**           |
| Database          | **PostgreSQL**                             |
| ORM               | **Prisma**                                 |
| API Spec          | **OpenAPI 3.0 (Swagger)**                  |
| Deployment        | **Docker**                                 |
| Secret Management | **Environment variables** (12-factor)      |

---

# 🧾 Backend Spec — CipherMint Phase 1

## 👤 User Identity Flow

1. Frontend requests a nonce from `GET /api/auth/nonce` with wallet address.
2. Backend generates and stores a nonce associated with that wallet address, returns it to frontend.
3. Frontend connects wallet and generates a signed SIWE message using the nonce.
4. Frontend calls `POST /api/kyc/session` with wallet + SIWE message + signature.
5. Backend verifies SIWE signature (including nonce validation and wallet address match) → then requests a *Didit KYC session*.
6. Backend responds with `sessionUrl`.
7. Frontend opens the Didit hosted UI.
8. Didit calls webhook `/api/kyc/webhook` with verification results (status & extracted name).
9. Backend verifies webhook + status.
10. If verified, backend writes the name **on-chain into the Zama IdentityRegistry** for that wallet.
11. Backend updates session status (no name stored locally).
12. Frontend queries identity state from on-chain via API or direct SDK contract call.

---

# 🧱 Database Design (Minimal Tracking Only)

We **do not store names**. The sole purpose of the DB is to track KYC session metadata for audit/idempotency.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model SiweNonce {
  id           String   @id @default(uuid())
  nonce        String
  walletAddress String
  expiresAt    DateTime
  used         Boolean  @default(false)
  createdAt    DateTime @default(now())

  @@unique([nonce, walletAddress])
  @@index([nonce])
  @@index([walletAddress])
  @@index([expiresAt])
}

model KycSession {
  id             String   @id @default(uuid())
  walletAddress  String
  diditSessionId String   @unique
  status         String   // CREATED / VERIFIED / FAILED
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([walletAddress])
}
```

**Why PostgreSQL?**

* ACID guarantees for transient session state
* Unique constraint on `diditSessionId`
* Strong TypeScript ORM support (Prisma)
* Easy to audit / trace flows

---

# 📡 API Endpoints (With SIWE Auth + Swagger)

> All API calls must use **HTTPS**. KYC session creation requires SIWE authentication.

---

## 1) Get SIWE Nonce

```
GET /api/auth/nonce?walletAddress=0x...
```

### Authentication

* No authentication required (public endpoint)

### Request Parameters

* `walletAddress` (query parameter): Ethereum wallet address

### Response

```json
{
  "nonce": "string",
  "expiresAt": "string"
}
```

* `nonce`: Unique nonce string for SIWE message (associated with wallet address)
* `expiresAt`: ISO 8601 timestamp when nonce expires

### Behavior

1. Validate `walletAddress` format (0x... address).
2. Generate a cryptographically secure random nonce.
3. Store nonce in DB associated with `walletAddress` and expiration (e.g., 5 minutes).
4. Return nonce and expiration to frontend.
5. Frontend must use this nonce in the SIWE message.

---

## 2) Create KYC Session

```
POST /api/kyc/session
```

### Authentication

* Required: **SIWE signed message** (with nonce validation)
* Purpose: Prevent wallet spoofing and replay attacks

### Request

```json
{
  "walletAddress": "string",
  "siweMessage": "string",
  "siweSignature": "string"
}
```

* `walletAddress`: Ethereum address
* `siweMessage`: Signed wallet assertion
* `siweSignature`: Signature of the SIWE message
* `encryptionKey`: Public key for Zama FHE write

### Response

```json
{
  "sessionUrl": "string"
}
```

### Behavior

1. Verify **SIWE** message matches `walletAddress`.
2. Extract nonce from SIWE message.
3. Verify the nonce exists in DB for this specific `walletAddress`, is not expired, and hasn't been used.
4. Mark nonce as `used=true` to prevent replay.
5. Call Didit API to create a new KYC session.
6. Store session metadata (`diditSessionId`, `walletAddress`, `status=CREATED`) in DB.
7. Return the hosted `sessionUrl` to frontend.

---

## 3) Didit Webhook (KYC Result)

```
POST /api/kyc/webhook
```

### No JWT Required

* Validated by **Didit signature header** instead.

### Request

```json
{
  "session_id": "string",
  "status": "verified | failed",
  "extracted_name": "string"
}
```

### Response

```
200 OK
```

### Behavior

1. Verify webhook signature from Didit.
2. Lookup session by `session_id`.
3. If status != CREATED → ignore (idempotency).
4. If status == "failed": update session to `FAILED`.
5. If verified:

   * Check name format off-chain (length/chars).
   * **Check name uniqueness** via on-chain query (IdentityRegistry).

     * If name taken → store session as `FAILED` and return.
   * Write the name to the **Zama IdentityRegistry** contract via Relayer SDK.
   * Update session status to `VERIFIED`.
6. Do **not store name in DB**.

---

## 4) Query Identity Status

```
GET /api/identity/:walletAddress
```

### Auth

* No authentication required (public endpoint, or optional SIWE for rate limiting)

### Response

```json
{
  "registered": boolean
}
```

### Behavior

* Check Zama IdentityRegistry on-chain:

  * If name exists → `registered=true`
  * Else → `registered=false`

---

# 🔒 Security & Best Practices

### SIWE Verification

* Always validate that the `siweMessage` and `siweSignature` were signed by `walletAddress`.
* Verify the nonce in the SIWE message:
  * Nonce must exist in database for the specific `walletAddress`
  * Nonce must not be expired
  * Nonce must not have been used before
* Mark nonce as used immediately after successful verification to prevent replay attacks
* Clean up expired nonces periodically (cron job)
* Nonces are address-specific to prevent cross-address nonce reuse

### Webhook Signature

* Validate Didit webhook signature header on every webhook call
* Reject invalid or replayed requests

### Input Validation

* Validate wallet is 0x… address
* Sanitize strings (no control chars)
* Validate encryptionKey format

### Rate Limiting

* Limit `/kyc/session` to prevent abuse

### Logging

* Log each KYC event + walletAddress + status
* No PII logged

---

# 📘 Swagger/OpenAPI 3.0

```yaml
openapi: 3.0.0
info:
  title: CipherMint Backend API
  version: 1.0.0
  description: Backend API for KYC integration (Didit) + on-chain identity registry (Zama)

servers:
  - url: https://api.ciphermint.com

components:
  schemas:
    NonceResponse:
      type: object
      properties:
        nonce:
          type: string
        expiresAt:
          type: string
          format: date-time

    CreateKycSessionReq:
      type: object
      properties:
        walletAddress:
          type: string
        siweMessage:
          type: string
        siweSignature:
          type: string
        encryptionKey:
          type: string
      required: [walletAddress, siweMessage, siweSignature, encryptionKey]

    CreateKycSessionRes:
      type: object
      properties:
        sessionUrl:
          type: string

    IdentityStatusResp:
      type: object
      properties:
        registered:
          type: boolean

paths:
  /api/auth/nonce:
    get:
      summary: Get SIWE nonce for authentication
      parameters:
        - in: query
          name: walletAddress
          schema:
            type: string
          required: true
          description: Ethereum wallet address
      responses:
        "200":
          description: Nonce generated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/NonceResponse"

  /api/kyc/session:
    post:
      summary: Create KYC session (Didit)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateKycSessionReq"
      responses:
        "200":
          description: KYC session created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CreateKycSessionRes"

  /api/kyc/webhook:
    post:
      summary: Didit webhook callback (no JWT)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                session_id:
                  type: string
                status:
                  type: string
                extracted_name:
                  type: string
      responses:
        "200":
          description: Webhook processed

  /api/identity/{walletAddress}:
    get:
      summary: Query identity registration status
      parameters:
        - in: path
          name: walletAddress
          schema:
            type: string
          required: true
      responses:
        "200":
          description: Identity status
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/IdentityStatusResp"
```

---

## 📌 Summary Checklist

* Backend uses **TypeScript** + Express/NestJS + Prisma + PostgreSQL
* `GET /api/auth/nonce?walletAddress=0x...` → generates and stores nonce for SIWE (address-specific)
* `POST /api/kyc/session` → **SIWE verified** (with nonce validation and address matching)
* `POST /api/kyc/webhook` → validated by Didit signature
* No JWT tokens required (SIWE-only authentication)
* Nonce table tracks SIWE nonces per wallet address (prevents replay attacks and cross-address reuse)
* No name stored in DB
* Only session tracking in DB
* On-chain identity writes happen post-webhook
* No mint claim via backend (user mints from front end)

---

If you want, I can also generate:

* **Prisma models + migrations**
* **Express route stubs in TypeScript**
* **SIWE middleware code**
* **Unit test templates for each endpoint**
