import { RPC_URL } from "../config";

let fheInstancePromise: Promise<any> | null = null;

export async function getFhevmInstance(): Promise<any> {
  if (!fheInstancePromise) {
    fheInstancePromise = (async () => {
      if (typeof window === "undefined") {
        throw new Error("FHEVM web relayer is only available in the browser.");
      }
      const relayer = await import("@zama-fhe/relayer-sdk/web");
      const config = {
        ...relayer.SepoliaConfig,
        network: RPC_URL ?? relayer.SepoliaConfig.network,
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
