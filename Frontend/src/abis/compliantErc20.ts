export const compliantErc20Abi = [
  {
    type: "function",
    name: "claimTokens",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    type: "function",
    name: "hasClaimedMint",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;
