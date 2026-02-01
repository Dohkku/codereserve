import {
  createWalletClient,
  createPublicClient,
  http,
  encodePacked,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
  type Address,
  type Chain,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

// Contract ABI (only the functions we need)
const ESCROW_ABI = [
  {
    inputs: [
      { name: 'repoId', type: 'bytes32' },
      { name: 'prNumber', type: 'uint256' },
      { name: 'treasury', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'deposit',
    outputs: [{ name: 'depositId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'depositId', type: 'uint256' }],
    name: 'getDeposit',
    outputs: [
      {
        components: [
          { name: 'depositor', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'repoId', type: 'bytes32' },
          { name: 'prNumber', type: 'uint256' },
          { name: 'treasury', type: 'address' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'status', type: 'uint8' },
        ],
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'DOMAIN_SEPARATOR',
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface BlockchainService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient: any;
  contractAddress: Address;
  chainId: number;
  chain: Chain;
  getDomainSeparator: () => Promise<Hex>;
  getDeposit: (depositId: bigint) => Promise<{
    depositor: Address;
    amount: bigint;
    repoId: Hex;
    prNumber: bigint;
    treasury: Address;
    timestamp: bigint;
    status: number;
  }>;
  createRefundSignature: (depositId: bigint, deadline: bigint) => Promise<{ signature: Hex; deadline: bigint }>;
  createSlashSignature: (depositId: bigint, deadline: bigint) => Promise<{ signature: Hex; deadline: bigint }>;
  repoNameToId: (repoFullName: string) => Hex;
  watchDeposits: (callback: (event: {
    depositId: bigint;
    depositor: Address;
    repoId: Hex;
    prNumber: bigint;
    amount: bigint;
    treasury: Address;
  }) => void) => () => void;
  signerAddress: Address | undefined;
}

export function createBlockchainService(): BlockchainService {
  const chainId = parseInt(process.env.CHAIN_ID || '84532', 10);
  const chain = chainId === 8453 ? base : baseSepolia;

  const rpcUrl = process.env.RPC_URL || (chainId === 8453
    ? 'https://mainnet.base.org'
    : 'https://sepolia.base.org');

  const contractAddress = (process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;
  const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY as Hex | undefined;

  // Create clients
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  let account: PrivateKeyAccount | null = null;
  try {
    account = signerPrivateKey && signerPrivateKey.startsWith('0x')
      ? privateKeyToAccount(signerPrivateKey)
      : null;
  } catch (error) {
    console.warn('Invalid SIGNER_PRIVATE_KEY - signing features will be unavailable');
  }

  const walletClient = account
    ? createWalletClient({
        account,
        chain,
        transport: http(rpcUrl),
      })
    : null;

  /**
   * Get domain separator from contract
   */
  async function getDomainSeparator(): Promise<Hex> {
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: ESCROW_ABI,
      functionName: 'DOMAIN_SEPARATOR',
    });
    return result;
  }

  /**
   * Get deposit info from contract
   */
  async function getDeposit(depositId: bigint): Promise<{
    depositor: Address;
    amount: bigint;
    repoId: Hex;
    prNumber: bigint;
    treasury: Address;
    timestamp: bigint;
    status: number;
  }> {
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: ESCROW_ABI,
      functionName: 'getDeposit',
      args: [depositId],
    });
    return result;
  }

  /**
   * Create EIP-712 typed data hash for refund
   */
  async function createRefundSignature(
    depositId: bigint,
    deadline: bigint
  ): Promise<{ signature: Hex; deadline: bigint }> {
    if (!walletClient || !account) {
      throw new Error('Signer not configured');
    }

    const domainSeparator = await getDomainSeparator();

    // Create struct hash
    const REFUND_TYPEHASH = keccak256(
      encodePacked(['string'], ['Refund(uint256 depositId,uint256 deadline)'])
    );

    const structHash = keccak256(
      encodeAbiParameters(
        parseAbiParameters('bytes32, uint256, uint256'),
        [REFUND_TYPEHASH, depositId, deadline]
      )
    );

    // Create digest
    const digest = keccak256(
      encodePacked(
        ['string', 'bytes32', 'bytes32'],
        ['\x19\x01', domainSeparator, structHash]
      )
    );

    // Sign
    const signature = await walletClient.signMessage({
      account,
      message: { raw: digest },
    });

    return { signature, deadline };
  }

  /**
   * Create EIP-712 typed data hash for slash
   */
  async function createSlashSignature(
    depositId: bigint,
    deadline: bigint
  ): Promise<{ signature: Hex; deadline: bigint }> {
    if (!walletClient || !account) {
      throw new Error('Signer not configured');
    }

    const domainSeparator = await getDomainSeparator();

    // Create struct hash
    const SLASH_TYPEHASH = keccak256(
      encodePacked(['string'], ['Slash(uint256 depositId,uint256 deadline)'])
    );

    const structHash = keccak256(
      encodeAbiParameters(
        parseAbiParameters('bytes32, uint256, uint256'),
        [SLASH_TYPEHASH, depositId, deadline]
      )
    );

    // Create digest
    const digest = keccak256(
      encodePacked(
        ['string', 'bytes32', 'bytes32'],
        ['\x19\x01', domainSeparator, structHash]
      )
    );

    // Sign
    const signature = await walletClient.signMessage({
      account,
      message: { raw: digest },
    });

    return { signature, deadline };
  }

  /**
   * Convert repo full name to bytes32 ID
   */
  function repoNameToId(repoFullName: string): Hex {
    return keccak256(encodePacked(['string'], [repoFullName]));
  }

  /**
   * Watch for deposit events
   */
  function watchDeposits(
    callback: (event: {
      depositId: bigint;
      depositor: Address;
      repoId: Hex;
      prNumber: bigint;
      amount: bigint;
      treasury: Address;
    }) => void
  ): () => void {
    const unwatch = publicClient.watchContractEvent({
      address: contractAddress,
      abi: [
        {
          anonymous: false,
          inputs: [
            { indexed: true, name: 'depositId', type: 'uint256' },
            { indexed: true, name: 'depositor', type: 'address' },
            { indexed: true, name: 'repoId', type: 'bytes32' },
            { indexed: false, name: 'prNumber', type: 'uint256' },
            { indexed: false, name: 'amount', type: 'uint256' },
            { indexed: false, name: 'treasury', type: 'address' },
          ],
          name: 'DepositCreated',
          type: 'event',
        },
      ],
      eventName: 'DepositCreated',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onLogs: (logs: any[]) => {
        for (const log of logs) {
          if (log.args) {
            callback(log.args);
          }
        }
      },
    });

    return unwatch;
  }

  return {
    publicClient,
    walletClient,
    contractAddress,
    chainId,
    chain,
    getDomainSeparator,
    getDeposit,
    createRefundSignature,
    createSlashSignature,
    repoNameToId,
    watchDeposits,
    signerAddress: account?.address,
  };
}
