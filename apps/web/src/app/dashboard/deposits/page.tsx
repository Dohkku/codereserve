'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { getUserDeposits, requestRefund } from '@/lib/api';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACT_ADDRESS, ESCROW_ABI } from '@/lib/wagmi';

interface Deposit {
  id: string;
  onchainId: string;
  prId: string;
  amount: string;
  status: string;
  txHash: string;
  createdAt: string;
  expiresAt: string;
}

export default function DepositsPage() {
  const { user } = useAuth();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (user) {
      loadDeposits();
    }
  }, [user]);

  async function loadDeposits() {
    try {
      const data = await getUserDeposits();
      setDeposits(data.deposits || []);
    } catch (error) {
      console.error('Failed to load deposits:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefund(deposit: Deposit) {
    try {
      setRefundingId(deposit.id);

      // Get refund signature from backend
      const refundData = await requestRefund(deposit.id);

      // Execute refund on-chain
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'refund',
        args: [
          BigInt(refundData.depositId),
          BigInt(refundData.deadline),
          refundData.signature as `0x${string}`,
        ],
      });
    } catch (error) {
      console.error('Refund failed:', error);
      setRefundingId(null);
    }
  }

  useEffect(() => {
    if (isSuccess && refundingId) {
      // Reload deposits after successful refund
      loadDeposits();
      setRefundingId(null);
    }
  }, [isSuccess, refundingId]);

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        Please log in to view your deposits.
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'refunded':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'slashed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'expired':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200';
      default:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Your Deposits
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          View and manage your security deposits
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : deposits.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
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
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            No deposits yet
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Deposits are made when opening PRs to protected repositories.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Deposit ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Expires
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {deposits.map((deposit) => (
                <tr key={deposit.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                    #{deposit.onchainId || deposit.id.slice(0, 8)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    ${(Number(deposit.amount) / 1_000_000).toFixed(2)} USDC
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                        deposit.status
                      )}`}
                    >
                      {deposit.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(deposit.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(deposit.expiresAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {deposit.status === 'confirmed' && (
                      <button
                        onClick={() => handleRefund(deposit)}
                        disabled={
                          isPending ||
                          isConfirming ||
                          refundingId === deposit.id
                        }
                        className="text-primary-600 hover:text-primary-900 disabled:opacity-50"
                      >
                        {refundingId === deposit.id
                          ? isConfirming
                            ? 'Confirming...'
                            : 'Processing...'
                          : 'Request Refund'}
                      </button>
                    )}
                    {deposit.txHash && (
                      <a
                        href={`https://sepolia.basescan.org/tx/${deposit.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-4 text-gray-400 hover:text-gray-600"
                      >
                        View Tx
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
