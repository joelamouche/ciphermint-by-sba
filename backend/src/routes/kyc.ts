import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { verifySiwe } from "../lib/siwe";
import { createDiditSession, verifyDiditSimpleSignature } from "../lib/didit";
import { attestIdentity, initializeZamaSDK } from "../lib/zama";

const router = Router();
const attestationTimers = new Map<string, NodeJS.Timeout>();
const MAX_ATTESTATION_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 5_000;

// Helper to validate Ethereum address
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Helper to sanitize strings (remove control characters)
function sanitizeString(str: string): string {
  return str.replace(/[\x00-\x1F\x7F]/g, "");
}

function isRetryableAttestationError(error: string): boolean {
  const normalized = error.toLowerCase();
  return (
    normalized.includes("503") ||
    normalized.includes("timeout") ||
    normalized.includes("ring-balancer") ||
    normalized.includes("relayer") ||
    normalized.includes("input-proof") ||
    normalized.includes("network")
  );
}

function computeRetryDelayMs(attempt: number): number {
  const exponentialBackoff = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 1500);
  return exponentialBackoff + jitter;
}

function scheduleAttestationJob(params: {
  kycSessionId: string;
  diditSessionId: string;
  walletAddress: string;
  birthYear: number;
  extractedName: string;
  attempt: number;
}): void {
  const { kycSessionId, diditSessionId, walletAddress, birthYear, extractedName } =
    params;
  const attempt = Math.max(1, params.attempt);

  const existingTimer = attestationTimers.get(kycSessionId);
  if (existingTimer && attempt === 1) {
    return;
  }

  const delayMs = attempt === 1 ? 0 : computeRetryDelayMs(attempt - 1);
  const timer = setTimeout(async () => {
    attestationTimers.delete(kycSessionId);

    // Skip work when status is already terminal.
    const session = await prisma.kycSession.findUnique({
      where: { id: kycSessionId },
      select: { status: true },
    });
    if (!session || !["ATTESTING", "RELAYER_DEGRADED"].includes(session.status)) {
      return;
    }

    const contractAddress = process.env.ZAMA_IDENTITY_REGISTRY_ADDRESS;
    if (!contractAddress) {
      console.warn(
        "ZAMA_IDENTITY_REGISTRY_ADDRESS not configured, marking session VERIFIED without attestation"
      );
      await prisma.kycSession.update({
        where: { id: kycSessionId },
        data: {
          status: "VERIFIED",
          relayerDegraded: false,
          lastError: null,
        },
      });
      return;
    }

    try {
      await initializeZamaSDK();

      const attestResult = await attestIdentity({
        userAddress: walletAddress,
        birthYear,
        fullName: extractedName,
      });

      if (!attestResult.success) {
        const errorMessage = attestResult.error ?? "Unknown attestation error";
        if (
          attempt < MAX_ATTESTATION_RETRIES &&
          isRetryableAttestationError(errorMessage)
        ) {
          await prisma.kycSession.update({
            where: { id: kycSessionId },
            data: {
              status: "RELAYER_DEGRADED",
              relayerDegraded: true,
              lastError: errorMessage,
              attestationAttempts: attempt,
            },
          });
          console.warn(
            `Retryable attestation error for session_id=${diditSessionId} (attempt ${attempt}/${MAX_ATTESTATION_RETRIES}): ${errorMessage}`
          );
          scheduleAttestationJob({
            ...params,
            attempt: attempt + 1,
          });
          return;
        }

        console.error(
          `Failed to attest identity for session_id=${diditSessionId} after ${attempt} attempts: ${errorMessage}`
        );
        await prisma.kycSession.update({
          where: { id: kycSessionId },
          data: {
            status: "FAILED",
            relayerDegraded: false,
            lastError: errorMessage,
            attestationAttempts: attempt,
          },
        });
        return;
      }

      await prisma.kycSession.update({
        where: { id: kycSessionId },
        data: {
          status: "VERIFIED",
          relayerDegraded: false,
          lastError: null,
          attestationAttempts: attempt,
        },
      });
      console.log(
        `Identity attested on-chain for session_id=${diditSessionId}, tx=${attestResult.transactionHash}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_ATTESTATION_RETRIES && isRetryableAttestationError(message)) {
        await prisma.kycSession.update({
          where: { id: kycSessionId },
          data: {
            status: "RELAYER_DEGRADED",
            relayerDegraded: true,
            lastError: message,
            attestationAttempts: attempt,
          },
        });
        console.warn(
          `Retryable attestation exception for session_id=${diditSessionId} (attempt ${attempt}/${MAX_ATTESTATION_RETRIES}): ${message}`
        );
        scheduleAttestationJob({
          ...params,
          attempt: attempt + 1,
        });
        return;
      }

      console.error(
        `Attestation job failed for session_id=${diditSessionId} after ${attempt} attempts:`,
        error
      );
      await prisma.kycSession.update({
        where: { id: kycSessionId },
        data: {
          status: "FAILED",
          relayerDegraded: false,
          lastError: message,
          attestationAttempts: attempt,
        },
      });
    }
  }, delayMs);

  attestationTimers.set(kycSessionId, timer);
}

/**
 * POST /api/kyc/session
 * Create KYC session (Didit)
 */
router.post("/session", async (req: Request, res: Response) => {
  try {
    const { walletAddress, siweMessage, siweSignature } = req.body;

    // Validate required fields
    if (!walletAddress || !siweMessage || !siweSignature) {
      return res.status(400).json({
        error:
          "Missing required fields: walletAddress, siweMessage, siweSignature",
      });
    }

    // Validate wallet address format
    if (!isValidAddress(walletAddress)) {
      return res.status(400).json({
        error: "Invalid Ethereum address format",
      });
    }

    // Sanitize inputs
    // IMPORTANT: do NOT strip whitespace/newlines from SIWE message itself,
    // the SIWE parser expects the exact EIP-4361 formatted string.
    const sanitizedMessage = String(siweMessage);
    const sanitizedSignature = sanitizeString(siweSignature);

    // Verify SIWE signature
    const verification = await verifySiwe(
      sanitizedMessage,
      sanitizedSignature,
      walletAddress.toLowerCase()
    );

    if (!verification.isValid) {
      return res.status(401).json({
        error: "SIWE verification failed",
        details: verification.error,
      });
    }

    // Call Didit API to create KYC session
    let diditSession;
    try {
      diditSession = await createDiditSession({
        walletAddress: walletAddress.toLowerCase(),
      });
    } catch (error) {
      console.error("Error creating Didit session:", error);
      return res.status(500).json({
        error: "Failed to create Didit KYC session",
      });
    }

    // Store session metadata in database (idempotent on diditSessionId)
    const kycSession = await prisma.kycSession.upsert({
      where: { diditSessionId: diditSession.sessionId },
      update: {},
      create: {
        walletAddress: walletAddress.toLowerCase(),
        diditSessionId: diditSession.sessionId,
        status: "CREATED",
        relayerDegraded: false,
        attestationAttempts: 0,
        lastError: null,
      },
    });

    // Log KYC event (no PII)
    console.log(
      `KYC session created: ${
        kycSession.id
      } for wallet: ${walletAddress.substring(0, 10)}...`
    );

    // Return session URL and session id for status polling
    res.json({
      sessionUrl: diditSession.sessionUrl,
      sessionId: kycSession.id,
    });
  } catch (error) {
    console.error("Error creating KYC session:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

/**
 * POST /api/kyc/webhook
 * Didit webhook callback (no JWT)
 *
 * Validates Didit webhook signature using X-Signature-Simple and updates
 * the corresponding KYC session status.
 */
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      session_id?: string;
      status?: string;
      webhook_type?: string;
      vendor_data?: string | null;
      extracted_name?: string | null;
    };

    const signature = req.header("x-signature-simple");
    const timestamp = req.header("x-timestamp");
    const secret = process.env.DIDIT_WEBHOOK_SECRET;

    const sessionId = body.session_id ?? null;
    const status = body.status ?? null;
    const webhookType = body.webhook_type ?? null;
    const vendorData = body.vendor_data ?? null;

    console.log(
      `[diditWebhook] received session_id=${sessionId ?? "null"} status=${status ?? "null"} webhook_type=${webhookType ?? "null"} vendor_data=${vendorData ?? "null"}`
    );

    const isValid = verifyDiditSimpleSignature({
      signature,
      timestamp,
      sessionId,
      status,
      webhookType,
      secret,
    });

    if (!isValid) {
      return res.status(401).json({
        error: "Invalid Didit webhook signature",
      });
    }

    if (!sessionId || !status) {
      return res.status(400).json({
        error: "Missing session_id or status in webhook payload",
      });
    }

    // Lookup session by Didit session ID
    const kycSession = await prisma.kycSession.findUnique({
      where: { diditSessionId: sessionId },
    });

    // If session not found, return 200 to avoid endless retries, but log it
    if (!kycSession) {
      console.warn(
        `[diditWebhook] unknown didit_session_id=${sessionId}, status=${status}, vendor_data=${vendorData ?? "null"}`
      );
      return res.status(200).json({ ok: true });
    }

    console.log(
      `[diditWebhook] matched didit_session_id=${sessionId} -> kyc_session_id=${kycSession.id} current_status=${kycSession.status}`
    );

    // Idempotency: only process callbacks while session is still pending.
    if (!["CREATED", "DIDIT_IN_PROGRESS"].includes(kycSession.status)) {
      console.log(
        `[diditWebhook] ignoring non-pending session kyc_session_id=${kycSession.id} current_status=${kycSession.status}`
      );
      return res.status(200).json({ ok: true });
    }

    const normalizedStatus = status.toLowerCase();

    // If in progress, mark session accordingly
    if (
      normalizedStatus === "in progress" ||
      normalizedStatus === "in_progress" ||
      normalizedStatus === "in-progress"
    ) {
      if (kycSession.status !== "DIDIT_IN_PROGRESS") {
        await prisma.kycSession.update({
          where: { id: kycSession.id },
          data: {
            status: "DIDIT_IN_PROGRESS",
            relayerDegraded: false,
            lastError: null,
          },
        });
      }
      return res.status(200).json({ ok: true });
    }

    // If failed, mark session as FAILED
    if (normalizedStatus === "failed") {
      await prisma.kycSession.update({
        where: { id: kycSession.id },
        data: {
          status: "FAILED",
          relayerDegraded: false,
        },
      });
      return res.status(200).json({ ok: true });
    }

    // Treat "verified" (or Didit "approved") as success
    const isVerified =
      normalizedStatus === "verified" || normalizedStatus === "approved";

    if (!isVerified) {
      console.warn(
        `Unhandled Didit status "${status}" for session_id=${sessionId}, leaving as CREATED`
      );
      return res.status(200).json({ ok: true });
    }

    // Extract name from Didit webhook structure
    // The name is nested in decision.id_verifications[0]
    const decision = (body as any).decision;
    let extractedName = "";

    if (
      decision?.id_verifications &&
      Array.isArray(decision.id_verifications) &&
      decision.id_verifications.length > 0
    ) {
      const idVerification = decision.id_verifications[0];

      // Prefer full_name if available, otherwise construct from first_name + last_name
      if (
        idVerification.full_name &&
        typeof idVerification.full_name === "string"
      ) {
        extractedName = idVerification.full_name.trim();
      } else if (idVerification.first_name || idVerification.last_name) {
        const firstName = (idVerification.first_name || "").trim();
        const lastName = (idVerification.last_name || "").trim();
        extractedName = `${firstName} ${lastName}`.trim();
      }
    }

    // Basic name validation (length/chars). We keep this minimal for now.
    if (!extractedName || extractedName.length > 128) {
      await prisma.kycSession.update({
        where: { id: kycSession.id },
        data: {
          status: "FAILED",
          relayerDegraded: false,
        },
      });
      console.warn(
        `Invalid or missing extracted_name for session_id=${sessionId}, marking as FAILED. Name: "${extractedName}"`
      );
      return res.status(200).json({ ok: true });
    }

    // Extract date of birth from Didit webhook
    let birthYear: number | null = null;
    if (decision?.id_verifications?.[0]?.date_of_birth) {
      const dobString = decision.id_verifications[0].date_of_birth;
      // Parse date string (format: "YYYY-MM-DD" or similar)
      const dobDate = new Date(dobString);
      if (!isNaN(dobDate.getTime())) {
        birthYear = dobDate.getFullYear();
      }
    }

    if (!birthYear) {
      console.warn(
        `Missing or invalid date_of_birth for session_id=${sessionId}, marking as FAILED`
      );
      await prisma.kycSession.update({
        where: { id: kycSession.id },
        data: {
          status: "FAILED",
          relayerDegraded: false,
        },
      });
      return res.status(200).json({ ok: true });
    }

    // Mark session in-progress and process on-chain attestation asynchronously.
    await prisma.kycSession.update({
      where: { id: kycSession.id },
      data: {
        status: "ATTESTING",
        relayerDegraded: false,
        attestationAttempts: 0,
        lastError: null,
      },
    });

    scheduleAttestationJob({
      kycSessionId: kycSession.id,
      diditSessionId: sessionId,
      walletAddress: kycSession.walletAddress,
      birthYear,
      extractedName,
      attempt: 1,
    });

    console.log(
      `Didit webhook accepted for async attestation session_id=${sessionId}, status=${status}, extracted_name="${extractedName}", birth_year=${birthYear}`
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error handling Didit webhook:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/kyc/session/:id/status
 * Return KYC session status. Terminal states are obscured as "done".
 */
router.get("/session/:id/status", async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!idParam) {
      return res.status(400).json({ error: "Missing kyc session id" });
    }

    const kycSession = await prisma.kycSession.findUnique({
      where: { id: idParam },
      select: {
        status: true,
        relayerDegraded: true,
        attestationAttempts: true,
        lastError: true,
      },
    });

    if (!kycSession) {
      return res.status(404).json({ error: "KYC session not found" });
    }

    const status =
      kycSession.status === "VERIFIED" || kycSession.status === "FAILED"
        ? "done"
        : kycSession.status === "DIDIT_IN_PROGRESS"
          ? "didit_in_progress"
          : kycSession.status === "ATTESTING"
            ? "attesting"
            : kycSession.status === "RELAYER_DEGRADED"
              ? "degraded"
              : "created";

    return res.json({
      status,
      relayerDegraded: kycSession.relayerDegraded,
      attestationAttempts: kycSession.attestationAttempts,
      lastError: kycSession.lastError,
    });
  } catch (error) {
    console.error("Error fetching KYC session status:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as kycRouter };
