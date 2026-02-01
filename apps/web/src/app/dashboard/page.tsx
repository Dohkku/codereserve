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
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-900"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-xl font-bold">Please log in to access the dashboard</h1>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 pb-8 border-b border-primary-200">
        <h1 className="text-2xl font-bold">Welcome back, {user.login}</h1>
        <p className="mt-1 text-primary-600">
          Here is an overview of your CodeReserve activity.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <div className="card">
          <div className="text-sm text-primary-500">Repositories</div>
          <div className="mt-2 text-2xl font-bold">
            {loading ? '-' : stats?.repoCount || 0}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-primary-500">Your PRs</div>
          <div className="mt-2 text-2xl font-bold">
            {loading ? '-' : stats?.prCount || 0}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-primary-500">Total Deposits</div>
          <div className="mt-2 text-2xl font-bold">
            {loading ? '-' : stats?.depositCount || 0}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-primary-500">Active Deposits</div>
          <div className="mt-2 text-2xl font-bold text-primary-600">
            {loading ? '-' : stats?.pendingDeposits || 0}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/dashboard/repos" className="card hover:border-primary-400 transition-colors">
          <h3 className="font-bold mb-1">Manage Repositories</h3>
          <p className="text-sm text-primary-600">
            Configure settings, whitelists, and thresholds
          </p>
        </Link>

        <Link href="/dashboard/deposits" className="card hover:border-primary-400 transition-colors">
          <h3 className="font-bold mb-1">Your Deposits</h3>
          <p className="text-sm text-primary-600">
            View and manage your security deposits
          </p>
        </Link>

        <Link href="/dashboard/prs" className="card hover:border-primary-400 transition-colors">
          <h3 className="font-bold mb-1">Pull Requests</h3>
          <p className="text-sm text-primary-600">
            Review PRs and manage spam
          </p>
        </Link>
      </div>
    </div>
  );
}
