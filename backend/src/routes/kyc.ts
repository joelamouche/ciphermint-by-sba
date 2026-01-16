import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { verifySiwe } from "../lib/siwe";
import { createDiditSession, verifyDiditSimpleSignature } from "../lib/didit";
import { attestIdentity, initializeZamaSDK } from "../lib/zama";

const router = Router();

// Helper to validate Ethereum address
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Helper to sanitize strings (remove control characters)
function sanitizeString(str: string): string {
  return str.replace(/[\x00-\x1F\x7F]/g, "");
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

    // Store session metadata in database
    const kycSession = await prisma.kycSession.create({
      data: {
        walletAddress: walletAddress.toLowerCase(),
        diditSessionId: diditSession.sessionId,
        status: "CREATED",
      },
    });

    // Log KYC event (no PII)
    console.log(
      `KYC session created: ${
        kycSession.id
      } for wallet: ${walletAddress.substring(0, 10)}...`
    );

    // Return session URL
    res.json({
      sessionUrl: diditSession.sessionUrl,
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
        `Received Didit webhook for unknown session_id=${sessionId}, status=${status}`
      );
      return res.status(200).json({ ok: true });
    }

    // Idempotency: if not in CREATED state, do nothing
    if (kycSession.status !== "CREATED") {
      return res.status(200).json({ ok: true });
    }

    const normalizedStatus = status.toLowerCase();

    // If failed, mark session as FAILED
    if (normalizedStatus === "failed") {
      await prisma.kycSession.update({
        where: { id: kycSession.id },
        data: { status: "FAILED" },
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
        data: { status: "FAILED" },
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
        data: { status: "FAILED" },
      });
      return res.status(200).json({ ok: true });
    }

    //TODO: Implement this => but this would mean exposing nameHashToAddress so not ideal for now
    // Check name uniqueness on-chain (optional - contract will also check)
    // const nameHash = hashName(extractedName);
    const contractAddress = process.env.ZAMA_IDENTITY_REGISTRY_ADDRESS;
    // if (contractAddress) {
    //   const nameTaken = await isNameTaken(contractAddress, nameHash);
    //   if (nameTaken) {
    //     console.warn(
    //       `Name "${extractedName}" already taken for session_id=${sessionId}, marking as FAILED`
    //     );
    //     await prisma.kycSession.update({
    //       where: { id: kycSession.id },
    //       data: { status: "FAILED" },
    //     });
    //     return res.status(200).json({ ok: true });
    //   }
    // }

    // Write identity to Zama IdentityRegistry on-chain
    if (contractAddress) {
      // Initialize Zama SDK if needed (idempotent)
      try {
        await initializeZamaSDK();
      } catch (error) {
        console.error("Failed to initialize Zama SDK:", error);
        await prisma.kycSession.update({
          where: { id: kycSession.id },
          data: { status: "FAILED" },
        });
        return res.status(200).json({ ok: true });
      }

      const attestResult = await attestIdentity({
        userAddress: kycSession.walletAddress,
        birthYear,
        fullName: extractedName,
      });

      if (!attestResult.success) {
        console.error(
          `Failed to attest identity for session_id=${sessionId}: ${attestResult.error}`
        );
        await prisma.kycSession.update({
          where: { id: kycSession.id },
          data: { status: "FAILED" },
        });
        return res.status(200).json({ ok: true });
      }

      console.log(
        `Identity attested on-chain for session_id=${sessionId}, tx=${attestResult.transactionHash}`
      );
    } else {
      console.warn(
        "ZAMA_IDENTITY_REGISTRY_ADDRESS not configured, skipping on-chain attestation"
      );
    }

    // Mark session as VERIFIED
    await prisma.kycSession.update({
      where: { id: kycSession.id },
      data: { status: "VERIFIED" },
    });

    console.log(
      `Didit webhook processed for session_id=${sessionId}, status=${status}, extracted_name="${extractedName}", birth_year=${birthYear}`
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error handling Didit webhook:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as kycRouter };
