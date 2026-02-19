export const TOKEN_DECIMALS = 8;

const DECIMAL_FACTOR = 10n ** BigInt(TOKEN_DECIMALS);

export function formatTokenAmount(value?: bigint | null): string {
  if (value == null) return "0";

  const negative = value < 0n;
  const abs = negative ? -value : value;

  const whole = abs / DECIMAL_FACTOR;
  const fraction = abs % DECIMAL_FACTOR;

  if (fraction === 0n) {
    return `${negative ? "-" : ""}${whole.toString()}`;
  }

  const fractionStr = fraction
    .toString()
    .padStart(TOKEN_DECIMALS, "0")
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole.toString()}.${fractionStr}`;
}

export function parseTokenAmount(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Amount is required.");
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Invalid amount format. Use digits and an optional decimal point.");
  }

  const [wholeStr, fracStrRaw = ""] = trimmed.split(".");

  if (fracStrRaw.length > TOKEN_DECIMALS) {
    throw new Error(`Too many decimal places (max ${TOKEN_DECIMALS}).`);
  }

  const fracStr = (fracStrRaw + "0".repeat(TOKEN_DECIMALS)).slice(0, TOKEN_DECIMALS);

  return BigInt(wholeStr) * DECIMAL_FACTOR + BigInt(fracStr);
}

