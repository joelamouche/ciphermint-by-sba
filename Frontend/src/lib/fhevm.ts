import { isHex, toHex } from "viem";

let fheInstancePromise: Promise<any> | null = null;

export async function getFhevmInstance(): Promise<any> {
  if (!fheInstancePromise) {
    fheInstancePromise = (async () => {
      if (typeof window === "undefined") {
        throw new Error("FHEVM web relayer is only available in the browser.");
      }
      const relayer = await import("@zama-fhe/relayer-sdk/web");
      if (typeof relayer.initSDK === "function") {
        await relayer.initSDK();
      }
      const config = {
        ...relayer.SepoliaConfig,
      };
      return relayer.createInstance(config);
    })();
  }
  return fheInstancePromise;
}

export async function getFhevmPublicKey(): Promise<string | null> {
  const instance = await getFhevmInstance();
  const candidate =
    (await instance.getPublicKey?.()) ??
    instance.publicKey ??
    instance.getPublicKey;

  if (typeof candidate === "string") {
    return candidate;
  }
  if (candidate?.publicKey && typeof candidate.publicKey === "string") {
    return candidate.publicKey;
  }
  return null;
}

export async function decryptEbool(
  encryptedValue: unknown
): Promise<boolean | null> {
  if (!encryptedValue) {
    return null;
  }
  const instance = await getFhevmInstance();
  const decrypt =
    instance.decrypt ?? instance.decryptBool ?? instance.decryptBoolean ?? null;
  if (!decrypt) {
    return null;
  }
  try {
    const decrypted = await decrypt(encryptedValue);
    if (typeof decrypted === "boolean") {
      return decrypted;
    }
    if (typeof decrypted === "number") {
      return decrypted !== 0;
    }
    if (typeof decrypted === "bigint") {
      return decrypted !== 0n;
    }
    return null;
  } catch (error) {
    console.warn("Failed to decrypt ebool:", error);
    return null;
  }
}

type SignTypedDataAsync = (params: {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}) => Promise<string>;

function normalizeHandle(value: unknown): string | null {
  if (typeof value === "string") {
    if (!isHex(value)) return null;
    const normalized = value.toLowerCase();
    if (normalized === "0x" || /^0x0+$/i.test(normalized)) {
      return null;
    }
    return value;
  }
  if (typeof value === "bigint") {
    if (value === 0n) return null;
    return toHex(value, { size: 32 });
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 0) return null;
    return toHex(BigInt(value), { size: 32 });
  }
  return null;
}

export async function userDecryptEbool(options: {
  encryptedValue: unknown;
  contractAddress: string;
  userAddress: string;
  signTypedDataAsync: SignTypedDataAsync;
}): Promise<boolean | null> {
  const { encryptedValue, contractAddress, userAddress, signTypedDataAsync } =
    options;
  const handle = normalizeHandle(encryptedValue);
  if (!handle) {
    return null;
  }

  const instance = await getFhevmInstance();
  if (
    typeof instance.generateKeypair !== "function" ||
    typeof instance.createEIP712 !== "function" ||
    typeof instance.userDecrypt !== "function"
  ) {
    return null;
  }

  try {
    const keypair = instance.generateKeypair();
    const startTimestamp = Math.floor(Date.now() / 1000);
    const durationDays = 10;
    const eip712 = instance.createEIP712(
      keypair.publicKey,
      [contractAddress],
      startTimestamp,
      durationDays
    );
    const signature = await signTypedDataAsync({
      domain: eip712.domain,
      types: eip712.types,
      primaryType: "UserDecryptRequestVerification",
      message: eip712.message,
    });
    const signatureHex = signature.replace(/^0x/, "");
    const result = await instance.userDecrypt(
      [{ handle, contractAddress }],
      keypair.privateKey,
      keypair.publicKey,
      signatureHex,
      [contractAddress],
      userAddress,
      startTimestamp,
      durationDays
    );
    const decrypted = result?.[handle];
    if (typeof decrypted === "boolean") {
      return decrypted;
    }
    if (typeof decrypted === "number") {
      return decrypted !== 0;
    }
    if (typeof decrypted === "bigint") {
      return decrypted !== 0n;
    }
    return false;
  } catch (error) {
    console.warn("Failed to user-decrypt ebool:", error);
    return null;
  }
}

export async function encryptUint64(
  contractAddress: string,
  userAddress: string,
  value: bigint
): Promise<{ handle: string; inputProof: string }> {
  const instance = await getFhevmInstance();
  const encryptedInput = instance.createEncryptedInput(
    contractAddress,
    userAddress
  );
  encryptedInput.add64(value);
  const encrypted = await encryptedInput.encrypt();

  return {
    handle: encrypted.handles[0],
    inputProof: encrypted.inputProof,
  };
}
