# Backend Setup Guide

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database

## Starting PostgreSQL Database

### If installed via Homebrew (macOS):

Start PostgreSQL service:
```bash
brew services start postgresql@16
```

Or start it manually (without keeping it running as a service):
```bash
pg_ctl -D /opt/homebrew/var/postgresql@16 start
```

Check if it's running:
```bash
brew services list | grep postgresql
```

### If using Docker:

```bash
docker run --name ciphermint-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ciphermint \
  -p 5432:5432 \
  -d postgres:16
```

### Create the database (if it doesn't exist):

Connect to PostgreSQL:
```bash
psql postgres
```

Then create the database:
```sql
CREATE DATABASE ciphermint;
\q
```

Or using a single command:
```bash
createdb ciphermint
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp env.template .env
```

Edit `.env` and set your `DATABASE_URL`. 

**For Homebrew PostgreSQL (default user is your macOS username, no password):**
```
DATABASE_URL="postgresql://YOUR_USERNAME@localhost:5432/ciphermint?schema=public"
```

**For Docker PostgreSQL:**
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ciphermint?schema=public"
```

**For custom PostgreSQL setup:**
```
DATABASE_URL="postgresql://user:password@localhost:5432/ciphermint?schema=public"
```

To find your PostgreSQL username (macOS):
```bash
whoami
```

3. Generate Prisma Client:
```bash
npm run prisma:generate
```

4. Run database migrations:
```bash
npm run prisma:migrate
```

This will create the `SiweNonce` table in your PostgreSQL database.

## Running the Server

### Development mode (with hot reload):
```bash
npm run dev
```

### Production mode:
```bash
npm run build
npm start
```

## Exposing Webhooks to Didit (ngrok)

To test the Didit webhook (`POST /api/kyc/webhook`) from your local machine, you can expose your local server using **ngrok**.

### 1. Install or Update ngrok

**macOS (Homebrew):**
```bash
brew install ngrok/ngrok/ngrok
# Or if already installed, update it:
brew upgrade ngrok/ngrok/ngrok
```

**Other platforms:**
- Download from [ngrok.com/download](https://ngrok.com/download)
- Or update existing installation: `ngrok update`

**Check your version:**
```bash
ngrok version
```

If you get an error about your version being too old (minimum 3.19.0), update ngrok:
```bash
# macOS with Homebrew:
brew upgrade ngrok/ngrok/ngrok

# Or download latest from:
# https://ngrok.com/download
```

Then authenticate ngrok (only once, using the token from your ngrok account):
```bash
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
```

### 2. Start your local backend

From the `backend` directory:
```bash
npm run dev
```

Your API should be running on `http://localhost:3000`.

### 3. Start an ngrok tunnel

In a separate terminal:
```bash
ngrok http 3000
```

ngrok will print a public HTTPS URL, for example:
```text
https://random-subdomain.ngrok.io
```

### 4. Configure Didit callback + webhook URL

Use the ngrok URL in both:

- `.env` (DIDIT callback):
  ```env
  DIDIT_CALLBACK_URL="https://random-subdomain.ngrok.io/api/kyc/webhook"
  ```

- Didit Console:
  - Set the webhook URL to  
    `https://random-subdomain.ngrok.io/api/kyc/webhook`

Make sure you also set the Didit webhook secret in `.env`:
```env
DIDIT_WEBHOOK_SECRET="your-didit-webhook-secret-here"
```

Restart the backend after changing `.env`:
```bash
npm run dev
```

Now when Didit sends webhook events, they will be forwarded via ngrok to your local `/api/kyc/webhook` endpoint.

## API Endpoints

### Get SIWE Nonce
```
GET /api/auth/nonce?walletAddress=0x...
```

Example:
```bash
curl "http://localhost:3000/api/auth/nonce?walletAddress=0x0BAd9DaD98143b2E946e8A40E4f27537be2f55E2"
```

Response:
```json
{
  "nonce": "a1b2c3d4e5f6...",
  "expiresAt": "2024-01-01T12:05:00.000Z"
}
```

### Create KYC Session (manual curl)
```
POST /api/kyc/session
```

**Prerequisites:**
- You have already requested a nonce via `GET /api/auth/nonce?walletAddress=0x...`
- The frontend (or you) have built a valid SIWE message using that nonce and signed it
- Environment variables for Didit are set (or you are fine with mock Didit sessions):
  ```env
  DIDIT_API_KEY=your_didit_api_key          # optional for now; if missing, mock session is used
  DIDIT_WORKFLOW_ID=your_didit_workflow_id  # optional for now; if missing, mock session is used
  DIDIT_CALLBACK_URL=https://your-backend.com/api/kyc/webhook  # optional
  ```

**Example request (replace placeholders with real SIWE values):**
```bash
curl -X POST "http://localhost:3000/api/kyc/session" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x0BAd9DaD98143b2E946e8A40E4f27537be2f55E2",
    "siweMessage": "YOUR_SIWE_MESSAGE_STRING",
    "siweSignature": "0xYOUR_SIWE_SIGNATURE",
    "encryptionKey": "YOUR_ZAMA_FHE_PUBLIC_KEY"
  }'
```

**Successful response:**
```json
{
  "sessionUrl": "https://verification.didit.me/session/abcd1234"
}
```

### Create KYC Session (helper script)

For local testing without writing your own SIWE signing logic, you can use the helper script in `backend/scripts/test-kyc-session.sh`.

#### 1. Make the script executable

From the `backend` directory:
```bash
chmod +x scripts/test-kyc-session.sh
```

#### 2. Set required environment variables

At minimum you need a test wallet address and private key:
```bash
export PUBLIC_ADDRESS=0xYourTestAddressHere
export PRIVATE_KEY=0xYourPrivateKeyHere
```

Optional overrides (these defaults are usually fine for local dev):
```bash
export API_URL=http://localhost:3000             # default
export ENCRYPTION_KEY=TEST_ENCRYPTION_KEY        # default
export SIWE_DOMAIN=localhost:3000                # default
export SIWE_URI=http://localhost:3000            # default
export CHAIN_ID=1                                # default
```

#### 3. Run the script

From the `backend` directory:
```bash
./scripts/test-kyc-session.sh
```

What the script does:
- Fetches a nonce from `GET /api/auth/nonce?walletAddress=...`
- Builds a proper SIWE message using `siwe` + `ethers`
- Signs it with your `PRIVATE_KEY`
- Calls `POST /api/kyc/session` with `walletAddress`, `siweMessage`, `siweSignature`, and `encryptionKey`
- Prints the HTTP status and JSON response (including `sessionUrl` if successful)

### Health Check
```
GET /health
```

## Database Management

- View database in Prisma Studio:
```bash
npm run prisma:studio
```

- Format Prisma schema:
```bash
npm run prisma:format
```
