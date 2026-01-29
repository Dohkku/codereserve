'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { getRepositories, getUserPullRequests, getUserDeposits } from '@/lib/api';

interface Stats {
  repoCount: number;
  prCount: number;
  depositCount: number;
  pendingDeposits: number;
}

export default function Dashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      Promise.all([
        getRepositories().catch(() => ({ repositories: [] })),
        getUserPullRequests().catch(() => ({ pullRequests: [] })),
        getUserDeposits().catch(() => ({ deposits: [] })),
      ]).then(([repos, prs, deposits]) => {
        setStats({
          repoCount: repos.repositories?.length || 0,
          prCount: prs.pullRequests?.length || 0,
          depositCount: deposits.deposits?.length || 0,
          pendingDeposits: deposits.deposits?.filter(
            (d: any) => d.status === 'confirmed'
          ).length || 0,
        });
        setLoading(false);
      });
    }
  }, [user]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Please log in to access the dashboard
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome back, {user.login}
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          Here is an overview of your CodeReserve activity.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Repositories
          </div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
            {loading ? '-' : stats?.repoCount || 0}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Your PRs
          </div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
            {loading ? '-' : stats?.prCount || 0}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Total Deposits
          </div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
            {loading ? '-' : stats?.depositCount || 0}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Active Deposits
          </div>
          <div className="mt-2 text-3xl font-semibold text-primary-600">
            {loading ? '-' : stats?.pendingDeposits || 0}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/dashboard/repos"
          className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-primary-100 dark:bg-primary-900 rounded-lg">
              <svg
                className="w-6 h-6 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Manage Repositories
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Configure settings, whitelists, and thresholds
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/deposits"
          className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-green-100 dark:bg-green-900 rounded-lg">
              <svg
                className="w-6 h-6 text-green-600"
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
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Your Deposits
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                View and manage your security deposits
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/prs"
          className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <svg
                className="w-6 h-6 text-purple-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Pull Requests
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Review PRs and manage spam
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
