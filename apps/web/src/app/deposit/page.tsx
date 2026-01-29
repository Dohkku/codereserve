'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseUnits } from 'viem';
import { useAuth } from '@/lib/auth';
import { getDepositInfo, recordDeposit, linkWallet } from '@/lib/api';
import { CONTRACT_ADDRESS, USDC_ADDRESS, ESCROW_ABI, ERC20_ABI } from '@/lib/wagmi';

interface DepositInfo {
  prId: string;
  repoId: string;
  prNumber: number;
  repoFullName: string;
  amount: string;
  treasuryAddress: string;
  contractAddress: string;
  chainId: number;
  riskScore: number;
}

type Step = 'loading' | 'connect' | 'approve' | 'deposit' | 'success' | 'error';

export default function DepositPage() {
  const searchParams = useSearchParams();
  const repo = searchParams.get('repo');
  const prNumber = searchParams.get('pr');

  const { user, token } = useAuth();
  const { address, isConnected } = useAccount();

  const [step, setStep] = useState<Step>('loading');
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check allowance
  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACT_ADDRESS] : undefined,
    query: { enabled: !!address && !!depositInfo },
  });

  // Check balance
  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Approve USDC
  const {
    data: approveHash,
    writeContract: approve,
    isPending: isApproving,
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash });

  // Deposit
  const {
    data: depositHash,
    writeContract: deposit,
    isPending: isDepositing,
  } = useWriteContract();

  const { isLoading: isDepositConfirming, isSuccess: isDepositSuccess } =
    useWaitForTransactionReceipt({ hash: depositHash });

  // Load deposit info
  useEffect(() => {
    if (repo && prNumber) {
      getDepositInfo(repo, parseInt(prNumber, 10))
        .then((info) => {
          setDepositInfo(info);
          setStep(isConnected ? 'approve' : 'connect');
        })
        .catch((err) => {
          setError(err.message || 'Failed to load deposit info');
          setStep('error');
        });
    } else {
      setError('Missing repository or PR number');
      setStep('error');
    }
  }, [repo, prNumber, isConnected]);

  // Update step when connected
  useEffect(() => {
    if (isConnected && step === 'connect') {
      setStep('approve');
    }
  }, [isConnected, step]);

  // Link wallet to user account
  useEffect(() => {
    if (address && token) {
      linkWallet(address).catch(console.error);
    }
  }, [address, token]);

  // Check if already approved
  useEffect(() => {
    if (depositInfo && allowance !== undefined) {
      const requiredAmount = BigInt(depositInfo.amount);
      if (allowance >= requiredAmount) {
        setStep('deposit');
      }
    }
  }, [allowance, depositInfo]);

  // Handle approve success
  useEffect(() => {
    if (isApproveSuccess) {
      setStep('deposit');
    }
  }, [isApproveSuccess]);

  // Handle deposit success
  useEffect(() => {
    if (isDepositSuccess && depositHash && depositInfo) {
      // Record deposit in backend
      // Note: In production, we'd listen for the DepositCreated event to get the onchain ID
      recordDeposit(depositInfo.prId, depositHash, '0')
        .then(() => setStep('success'))
        .catch((err) => {
          console.error('Failed to record deposit:', err);
          setStep('success'); // Still show success since on-chain tx succeeded
        });
    }
  }, [isDepositSuccess, depositHash, depositInfo]);

  function handleApprove() {
    if (!depositInfo) return;

    approve({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESS, BigInt(depositInfo.amount)],
    });
  }

  function handleDeposit() {
    if (!depositInfo) return;

    deposit({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'deposit',
      args: [
        depositInfo.repoId as `0x${string}`,
        BigInt(depositInfo.prNumber),
        depositInfo.treasuryAddress as `0x${string}`,
        BigInt(depositInfo.amount),
      ],
    });
  }

  const amountUSDC = depositInfo
    ? (Number(depositInfo.amount) / 1_000_000).toFixed(2)
    : '5.00';

  const hasEnoughBalance = balance !== undefined && depositInfo
    ? balance >= BigInt(depositInfo.amount)
    : true;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
      <div className="max-w-lg mx-auto px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Security Deposit
            </h1>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              Deposit ${amountUSDC} USDC to open your PR
            </p>
          </div>

          {/* PR Info */}
          {depositInfo && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Repository
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {depositInfo.repoFullName}
                </span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Pull Request
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  #{depositInfo.prNumber}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Risk Score
                </span>
                <span className="text-sm font-medium text-orange-600">
                  {depositInfo.riskScore}/100
                </span>
              </div>
            </div>
          )}

          {/* Steps */}
          {step === 'loading' && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-500 dark:text-gray-400">
                Loading deposit info...
              </p>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {step === 'connect' && (
            <div className="text-center py-4">
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Connect your wallet to make a deposit
              </p>
              <ConnectButton />
            </div>
          )}

          {step === 'approve' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center mb-4">
                <ConnectButton />
              </div>

              {!hasEnoughBalance && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
                  <p className="text-red-600 dark:text-red-400">
                    Insufficient USDC balance. You need ${amountUSDC} USDC.
                  </p>
                </div>
              )}

              <button
                onClick={handleApprove}
                disabled={isApproving || isApproveConfirming || !hasEnoughBalance}
                className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
              >
                {isApproving || isApproveConfirming
                  ? 'Approving...'
                  : `Approve ${amountUSDC} USDC`}
              </button>

              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                This allows the contract to transfer USDC on your behalf
              </p>
            </div>
          )}

          {step === 'deposit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center mb-4">
                <ConnectButton />
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                <p className="text-green-600 dark:text-green-400">
                  USDC approved. Ready to deposit.
                </p>
              </div>

              <button
                onClick={handleDeposit}
                disabled={isDepositing || isDepositConfirming}
                className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
              >
                {isDepositing || isDepositConfirming
                  ? 'Depositing...'
                  : `Deposit ${amountUSDC} USDC`}
              </button>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Deposit Successful!
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Your PR is being reopened. You can close this page.
              </p>
              {depositHash && (
                <a
                  href={`https://sepolia.basescan.org/tx/${depositHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700"
                >
                  View transaction on BaseScan
                </a>
              )}
            </div>
          )}

          {/* Info */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              What happens to my deposit?
            </h3>
            <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li className="flex items-start">
                <svg
                  className="w-4 h-4 text-green-500 mr-2 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Refunded when your PR is merged or closed normally</span>
              </li>
              <li className="flex items-start">
                <svg
                  className="w-4 h-4 text-red-500 mr-2 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Goes to repo treasury if marked as spam</span>
              </li>
              <li className="flex items-start">
                <svg
                  className="w-4 h-4 text-blue-500 mr-2 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Auto-refunds after 30 days if no action taken</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
