/**
 * Zama FHEVM Integration
 *
 * Handles interactions with the Zama IdentityRegistry contract using the Relayer SDK.
 *
 * Based on: https://github.com/0xchriswilder/fhevm-react-template/blob/main/packages/fhevm-sdk/src/core/fhevm.ts
 * Uses @zama-fhe/relayer-sdk/node for Node.js backend compatibility.
 */

import { ethers } from "ethers";

// IdentityRegistry ABI (minimal interface for attestIdentity and name uniqueness check)
// Note: externalEuint8 is encoded as bytes32 in the ABI (not bytes calldata)
const IDENTITY_REGISTRY_ABI = [
  "function attestIdentity(address user, bytes32 encBirthYearOffset, bytes32 nameHash, bytes inputProof) external",
  "function fullNameHashes(address user) external view returns (bytes32)",
  "function isAttested(address user) external view returns (bool)",
  "function registrars(address registrar) external view returns (bool)",
] as const;

interface AttestIdentityParams {
  userAddress: string;
  birthYear: number; // Full year (e.g., 1990)
  fullName: string;
}

interface AttestIdentityResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

// Singleton instance
let fheInstance: any = null;
let isInitialized = false;
const ENCRYPT_MAX_ATTEMPTS = Number(process.env.ZAMA_ENCRYPT_MAX_ATTEMPTS ?? 3);
const ENCRYPT_TIMEOUT_MS = Number(process.env.ZAMA_ENCRYPT_TIMEOUT_MS ?? 20000);

/**
 * Initialize FHEVM instance for Node.js environment
 * Based on the fhevm-react-template source code
 */
async function initializeNodeFheInstance(rpcUrl?: string): Promise<any> {
  try {
    console.log("🚀 Initializing FHEVM Node.js instance...");

    // Dynamic import to prevent bundling issues
    const relayerSDKModule = await import("@zama-fhe/relayer-sdk/node");
    const { createInstance, SepoliaConfig } = relayerSDKModule;

    const config = {
      ...SepoliaConfig,
      network: rpcUrl || process.env.ZAMA_RPC_URL || "https://rpc.sepolia.org",
    };

    fheInstance = await createInstance(config);
    console.log("✅ FHEVM Node.js instance created successfully!");
    return fheInstance;
  } catch (err) {
    console.error("FHEVM Node.js instance creation failed:", err);
    throw err;
  }
}

/**
 * Initialize the FHEVM SDK
 * Must be called before using any other functions
 */
export async function initializeZamaSDK(): Promise<void> {
  if (isInitialized && fheInstance) {
    return;
  }

  try {
    const rpcUrl = process.env.ZAMA_RPC_URL || "https://rpc.sepolia.org";
    fheInstance = await initializeNodeFheInstance(rpcUrl);
    isInitialized = true;
  } catch (error) {
    console.error("Failed to initialize FHEVM SDK:", error);
    throw new Error(
      `FHEVM SDK initialization failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Get or initialize the FHEVM instance
 */
async function getFheInstance(): Promise<any> {
  if (!isInitialized || !fheInstance) {
    await initializeZamaSDK();
  }
  if (!fheInstance) {
    throw new Error("FHEVM instance not initialized");
  }
  return fheInstance;
}

function resetFheInstance(): void {
  fheInstance = null;
  isInitialized = false;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Hash a full name to bytes32 (keccak256)
 */
export function hashName(fullName: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(fullName.trim()));
}

/**
 * Calculate birth year offset from 1900
 * @param birthYear Full birth year (e.g., 1990)
 * @returns Offset from 1900 (e.g., 90 for 1990)
 */
export function calculateBirthYearOffset(birthYear: number): number {
  if (birthYear < 1900 || birthYear > new Date().getFullYear()) {
    throw new Error(`Invalid birth year: ${birthYear}`);
  }
  return birthYear - 1900;
}

//TODO: Implement this => but this would mean exposing nameHashToAddress so not ideal for now
/**
 * Check if a name is already taken in the IdentityRegistry
 * @param contractAddress IdentityRegistry contract address
 * @param nameHash Keccak256 hash of the name
 * @returns true if name is taken, false otherwise
 */
export async function isNameTaken(
  contractAddress: string,
  nameHash: string
): Promise<boolean> {
  const rpcUrl = process.env.ZAMA_RPC_URL || "https://rpc.sepolia.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(
    contractAddress,
    IDENTITY_REGISTRY_ABI,
    provider
  );

  try {
    // The contract has a reverse mapping nameHashToAddress
    // We can't query it directly, but we can check if any user has this nameHash
    // by iterating through known users or using events (not ideal)
    // For now, we'll rely on the contract's duplicate check which will revert if taken
    // This is a limitation - in production you might want to index events or use TheGraph
    return false; // Optimistic - let the contract handle the duplicate check
  } catch (error) {
    console.error("Error checking name uniqueness:", error);
    return false; // Fail open - let contract handle it
  }
}

/**
 * Encrypt a value using FHEVM
 * Based on the fhevm-react-template encryptValue function
 */
async function encryptValue(
  contractAddress: string,
  address: string,
  value: number
): Promise<{ handles: string[]; inputProof: string }> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= ENCRYPT_MAX_ATTEMPTS; attempt++) {
    const attemptStartedAt = Date.now();
    try {
      const fhe = await getFheInstance();
      const encrypted = fhe.createEncryptedInput(contractAddress, address);
      encrypted.add8(BigInt(value));

      const encryptedInput = (await withTimeout(
        encrypted.encrypt(),
        ENCRYPT_TIMEOUT_MS,
        "relayer encrypt"
      )) as { handles: string[]; inputProof: string };

      console.log(
        `[attestIdentity] encryption_attempt_success attempt=${attempt} elapsed_ms=${
          Date.now() - attemptStartedAt
        }`
      );

      return {
        handles: encryptedInput.handles,
        inputProof: encryptedInput.inputProof,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[attestIdentity] encryption_attempt_failed attempt=${attempt}/${ENCRYPT_MAX_ATTEMPTS} message="${message}" elapsed_ms=${
          Date.now() - attemptStartedAt
        }`
      );

      if (attempt < ENCRYPT_MAX_ATTEMPTS) {
        resetFheInstance();
        await initializeZamaSDK();
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Attest identity to the Zama IdentityRegistry contract
 *
 * @param params User address, birth year, and full name
 * @returns Transaction hash if successful
 */
export async function attestIdentity(
  params: AttestIdentityParams
): Promise<AttestIdentityResult> {
  const startedAt = Date.now();
  const contractAddress = process.env.ZAMA_IDENTITY_REGISTRY_ADDRESS;
  const registrarPrivateKey = process.env.ZAMA_REGISTRAR_PRIVATE_KEY;

  if (!contractAddress) {
    return {
      success: false,
      error: "ZAMA_IDENTITY_REGISTRY_ADDRESS not configured",
    };
  }

  if (!registrarPrivateKey) {
    return {
      success: false,
      error: "ZAMA_REGISTRAR_PRIVATE_KEY not configured",
    };
  }

  try {
    console.log(
      `[attestIdentity] start user=${params.userAddress} contract=${contractAddress}`
    );

    // Setup ethers provider and signer for registrar checks
    const rpcUrl = process.env.ZAMA_RPC_URL || "https://rpc.sepolia.org";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(registrarPrivateKey, provider);
    console.log(
      `[attestIdentity] signer_ready signer=${signer.address} elapsed_ms=${
        Date.now() - startedAt
      }`
    );

    // Validate user address
    if (!ethers.isAddress(params.userAddress)) {
      return {
        success: false,
        error: `Invalid user address: ${params.userAddress}`,
      };
    }

    // Calculate birth year offset
    const birthYearOffset = calculateBirthYearOffset(params.birthYear);
    console.log(
      `[attestIdentity] birth_year_offset=${birthYearOffset} elapsed_ms=${
        Date.now() - startedAt
      }`
    );

    // Hash the name
    const nameHash = hashName(params.fullName);
    console.log(
      `[attestIdentity] name_hashed elapsed_ms=${Date.now() - startedAt}`
    );

    // Encrypt the birth year offset using FHEVM
    const encryptionStartedAt = Date.now();
    console.log("[attestIdentity] encryption_start");
    const encrypted = await encryptValue(
      contractAddress,
      signer.address, // Registrar address (who can import the encrypted value)
      birthYearOffset
    );
    console.log(
      `[attestIdentity] encryption_done elapsed_ms=${
        Date.now() - encryptionStartedAt
      } total_elapsed_ms=${Date.now() - startedAt}`
    );

    // Get the contract instance using ethers directly
    // The FHEVM instance from @zama-fhe/relayer-sdk/node doesn't have createContract
    // So we use ethers.Contract directly, similar to the test file pattern
    const contract = new ethers.Contract(
      contractAddress,
      IDENTITY_REGISTRY_ABI,
      signer
    );

    // Call attestIdentity with the encrypted handle and proof
    // The contract expects: attestIdentity(address user, externalEuint8 encBirthYearOffset, bytes32 nameHash, bytes calldata inputProof)

    // First, check if the signer is authorized as a registrar
    const registrarCheckStartedAt = Date.now();
    console.log("[attestIdentity] registrar_check_start");
    const isRegistrar = await contract.registrars(signer.address);
    console.log(
      `[attestIdentity] registrar_check_done is_registrar=${isRegistrar} elapsed_ms=${
        Date.now() - registrarCheckStartedAt
      } total_elapsed_ms=${Date.now() - startedAt}`
    );
    if (!isRegistrar) {
      return {
        success: false,
        error: `Address ${signer.address} is not authorized as a registrar. Please add it as a registrar first.`,
      };
    }

    try {
      // Call attestIdentity with the encrypted handle and proof
      // Similar to the test file: contract.attestIdentity(userAddress, encryptedInput.handles[0], nameHash, encryptedInput.inputProof)
      // Skip gas estimation by providing a gas limit directly
      const txSendStartedAt = Date.now();
      console.log("[attestIdentity] tx_send_start");
      const tx = await contract.attestIdentity(
        params.userAddress, // user parameter (address)
        encrypted.handles[0], // externalEuint8 (bytes32 handle)
        nameHash, // nameHash parameter (bytes32)
        encrypted.inputProof // inputProof (bytes calldata)
        // {
        //   gasLimit: 500000, // Set gas limit to skip estimation (FHE operations can be gas-intensive)
        // }
      );
      console.log(
        `[attestIdentity] tx_sent hash=${tx.hash} elapsed_ms=${
          Date.now() - txSendStartedAt
        } total_elapsed_ms=${Date.now() - startedAt}`
      );

      // Wait for transaction confirmation
      const txWaitStartedAt = Date.now();
      console.log(`[attestIdentity] tx_wait_start hash=${tx.hash}`);
      const receipt = await tx.wait();
      console.log(
        `[attestIdentity] tx_confirmed hash=${receipt.hash} block=${
          receipt.blockNumber
        } elapsed_ms=${Date.now() - txWaitStartedAt} total_elapsed_ms=${
          Date.now() - startedAt
        }`
      );

      return {
        success: true,
        transactionHash: receipt.hash,
      };
    } catch (txError: any) {
      // Try to extract revert reason if available
      let errorMessage = txError.message || String(txError);

      if (txError.reason) {
        errorMessage = `Contract revert: ${txError.reason}`;
      } else if (txError.data) {
        errorMessage = `Contract revert: ${txError.data}`;
      } else if (txError.shortMessage) {
        errorMessage = txError.shortMessage;
      }

      console.error("Error attesting identity:", {
        error: txError,
        message: errorMessage,
        signerAddress: signer.address,
        contractAddress,
        userAddress: params.userAddress,
        nameHash,
        hasEncryptedHandle: !!encrypted.handles[0],
        hasInputProof: !!encrypted.inputProof,
        elapsedMs: Date.now() - startedAt,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  } catch (error) {
    console.error("Error attesting identity:", {
      error,
      elapsedMs: Date.now() - startedAt,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a user is already attested in the IdentityRegistry
 */
export async function isUserAttested(userAddress: string): Promise<boolean> {
  const contractAddress = process.env.ZAMA_IDENTITY_REGISTRY_ADDRESS;
  if (!contractAddress) {
    throw new Error("ZAMA_IDENTITY_REGISTRY_ADDRESS not configured");
  }

  const rpcUrl = process.env.ZAMA_RPC_URL || "https://rpc.sepolia.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(
    contractAddress,
    IDENTITY_REGISTRY_ABI,
    provider
  );

  try {
    return await contract.isAttested(userAddress);
  } catch (error) {
    console.error("Error checking if user is attested:", error);
    return false;
  }
}

/**
 * Check if an address is authorized as a registrar in the IdentityRegistry
 */
export async function isRegistrar(address: string): Promise<boolean> {
  const contractAddress = process.env.ZAMA_IDENTITY_REGISTRY_ADDRESS;
  if (!contractAddress) {
    throw new Error("ZAMA_IDENTITY_REGISTRY_ADDRESS not configured");
  }

  const rpcUrl = process.env.ZAMA_RPC_URL || "https://rpc.sepolia.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(
    contractAddress,
    IDENTITY_REGISTRY_ABI,
    provider
  );

  try {
    return await contract.registrars(address);
  } catch (error) {
    console.error("Error checking if address is registrar:", error);
    return false;
  }
}
