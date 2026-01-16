export const identityRegistryAbi = [
  {
    type: "function",
    name: "isAttested",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
