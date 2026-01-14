import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { randomBytes } from "crypto";

const router = Router();

// Helper to validate Ethereum address
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Generate cryptographically secure nonce
function generateNonce(): string {
  return randomBytes(32).toString("hex");
}

/**
 * GET /api/auth/nonce?walletAddress=0x...
 * Get SIWE nonce for authentication
 */
router.get("/nonce", async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.query;

    // Validate wallet address
    if (!walletAddress || typeof walletAddress !== "string") {
      return res.status(400).json({
        error: "Missing or invalid walletAddress query parameter",
      });
    }

    if (!isValidAddress(walletAddress)) {
      return res.status(400).json({
        error: "Invalid Ethereum address format",
      });
    }

    // Generate nonce
    const nonce = generateNonce();

    // Set expiration (5 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    // Store nonce in database
    await prisma.siweNonce.create({
      data: {
        nonce,
        walletAddress: walletAddress.toLowerCase(), // Normalize to lowercase
        expiresAt,
      },
    });

    // Return nonce and expiration
    res.json({
      nonce,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error generating nonce:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

export { router as nonceRouter };
