import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, baseSepolia } from 'wagmi/chains';

const isMainnet = process.env.NEXT_PUBLIC_CHAIN_ID === '8453';

export const config = getDefaultConfig({
  appName: 'CodeReserve',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'demo',
  chains: isMainnet ? [base] : [baseSepolia],
  ssr: true,
});

// Contract addresses
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const USDC_ADDRESS = isMainnet
  ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}` // Base Mainnet
  : '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`; // Base Sepolia

// Contract ABIs
export const ESCROW_ABI = [
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
    inputs: [
      { name: 'depositId', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'refund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'depositId', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'slash',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'depositId', type: 'uint256' }],
    name: 'claimTimeout',
    outputs: [],
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
] as const;

export const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
