import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { verifySiwe } from "../lib/siwe";
import { createDiditSession } from "../lib/didit";

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
    const { walletAddress, siweMessage, siweSignature, encryptionKey } =
      req.body;

    // Validate required fields
    if (!walletAddress || !siweMessage || !siweSignature || !encryptionKey) {
      return res.status(400).json({
        error:
          "Missing required fields: walletAddress, siweMessage, siweSignature, encryptionKey",
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
    const sanitizedEncryptionKey = sanitizeString(encryptionKey);

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
        encryptionKey: sanitizedEncryptionKey,
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

export { router as kycRouter };
