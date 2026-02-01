'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { getRepository, updateRepository } from '@/lib/api';

interface Repository {
  id: string;
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  treasuryAddress: string;
  riskThreshold: number;
  depositAmount: string;
  isActive: boolean;
}

export default function RepoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [repo, setRepo] = useState<Repository | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [threshold, setThreshold] = useState(60);
  const [depositAmount, setDepositAmount] = useState('5.00');
  const [treasuryAddress, setTreasuryAddress] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (params.id) {
      getRepository(params.id as string)
        .then((data) => {
          setRepo(data.repository);
          setThreshold(data.repository.riskThreshold);
          setDepositAmount((Number(data.repository.depositAmount) / 1_000_000).toFixed(2));
          setTreasuryAddress(data.repository.treasuryAddress);
          setIsActive(data.repository.isActive);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [params.id]);

  async function handleSave() {
    if (!repo) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await updateRepository(repo.id, {
        riskThreshold: threshold,
        depositAmount: String(Math.round(parseFloat(depositAmount) * 1_000_000)),
        treasuryAddress: treasuryAddress || undefined,
        isActive,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        Please log in to view repository settings.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Repository not found</h1>
        <Link href="/dashboard/repos" className="text-primary-600 hover:underline mt-4 inline-block">
          Back to repositories
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link href="/dashboard/repos" className="text-primary-600 hover:underline text-sm mb-2 inline-block">
          &larr; Back to repositories
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {repo.fullName}
            </h1>
            <a
              href={`https://github.com/${repo.fullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-primary-600"
            >
              View on GitHub &rarr;
            </a>
          </div>
          <span
            className={`px-3 py-1 text-sm font-medium rounded-full ${
              isActive
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200'
            }`}
          >
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Settings Form */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          CodeReserve Settings
        </h2>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-green-600 dark:text-green-400">Settings saved successfully!</p>
          </div>
        )}

        {/* Risk Threshold */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Risk Threshold
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value))}
              className="flex-1"
            />
            <span className="text-lg font-semibold text-gray-900 dark:text-white w-12 text-right">
              {threshold}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Contributors with risk score above this threshold will need to deposit. Lower = stricter.
          </p>
        </div>

        {/* Deposit Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Deposit Amount (USDC)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <input
              type="number"
              min="1"
              max="100"
              step="0.01"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Amount contributors must deposit to open a PR.
          </p>
        </div>

        {/* Treasury Address */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Treasury Address
          </label>
          <input
            type="text"
            placeholder="0x..."
            value={treasuryAddress}
            onChange={(e) => setTreasuryAddress(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Address where slashed deposits go. Usually your project's multisig or DAO treasury.
          </p>
        </div>

        {/* Active Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              CodeReserve Active
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              When disabled, all PRs will be allowed without deposits.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsActive(!isActive)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isActive ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isActive ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
