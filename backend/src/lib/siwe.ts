import { SiweMessage } from "siwe";
import { prisma } from "./prisma";

/**
 * Verify SIWE message and signature
 * @param message - The SIWE message string
 * @param signature - The signature of the message
 * @param expectedAddress - The wallet address that should have signed the message
 * @returns Object with isValid flag and parsed message if valid
 */
export async function verifySiwe(
  message: string,
  signature: string,
  expectedAddress: string
): Promise<{
  isValid: boolean;
  parsedMessage: SiweMessage | null;
  error?: string;
}> {
  try {
    // Parse the SIWE message
    const siweMessage = new SiweMessage(message);

    // Verify the message signature
    const { data: fields } = await siweMessage.verify({ signature });

    // Check if the address matches
    if (fields.address.toLowerCase() !== expectedAddress.toLowerCase()) {
      return {
        isValid: false,
        parsedMessage: null,
        error: "Address mismatch",
      };
    }

    // Extract nonce from the message
    const nonce = siweMessage.nonce;

    if (!nonce) {
      return {
        isValid: false,
        parsedMessage: null,
        error: "Nonce missing from SIWE message",
      };
    }

    // Verify nonce in database
    const nonceRecord = await prisma.siweNonce.findUnique({
      where: {
        nonce_walletAddress: {
          nonce,
          walletAddress: expectedAddress.toLowerCase(),
        },
      },
    });

    if (!nonceRecord) {
      return {
        isValid: false,
        parsedMessage: null,
        error: "Nonce not found for this wallet address",
      };
    }

    // Check if nonce is expired
    if (nonceRecord.expiresAt < new Date()) {
      return {
        isValid: false,
        parsedMessage: null,
        error: "Nonce has expired",
      };
    }

    // Check if nonce has been used
    if (nonceRecord.used) {
      return {
        isValid: false,
        parsedMessage: null,
        error: "Nonce has already been used",
      };
    }

    // Mark nonce as used
    await prisma.siweNonce.update({
      where: {
        id: nonceRecord.id,
      },
      data: {
        used: true,
      },
    });

    return {
      isValid: true,
      parsedMessage: siweMessage,
    };
  } catch (error) {
    console.error("SIWE verification error:", error);
    return {
      isValid: false,
      parsedMessage: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
