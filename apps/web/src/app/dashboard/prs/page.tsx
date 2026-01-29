'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth';
import { getPullRequests, markPRAsSpam, approvePR } from '@/lib/api';

interface PullRequest {
  id: string;
  githubId: number;
  number: number;
  title: string;
  state: string;
  riskScore: number;
  depositRequired: boolean;
  depositId: string | null;
  author: {
    id: string;
    login: string;
    avatarUrl: string | null;
  };
  createdAt: string;
}

export default function PullRequestsPage() {
  const { user } = useAuth();
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (user) {
      loadPRs();
    }
  }, [user]);

  async function loadPRs() {
    try {
      const data = await getPullRequests();
      setPrs(data.pullRequests || []);
    } catch (error) {
      console.error('Failed to load PRs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkSpam(prId: string) {
    if (!confirm('Are you sure you want to mark this PR as spam?')) return;

    try {
      const result = await markPRAsSpam(prId);
      if (result.requiresSlash) {
        alert('This PR has a deposit. Redirecting to slash...');
        // In production, redirect to slash flow
      }
      loadPRs();
    } catch (error) {
      console.error('Failed to mark as spam:', error);
    }
  }

  async function handleApprove(prId: string) {
    try {
      await approvePR(prId);
      loadPRs();
    } catch (error) {
      console.error('Failed to approve PR:', error);
    }
  }

  const filteredPRs = prs.filter((pr) => {
    if (filter === 'all') return true;
    return pr.state === filter;
  });

  const getStateColor = (state: string) => {
    switch (state) {
      case 'open':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'merged':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'closed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'pending_deposit':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200';
    }
  };

  const getRiskColor = (score: number) => {
    if (score <= 30) return 'text-green-600';
    if (score <= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        Please log in to view pull requests.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Pull Requests
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            Review and manage pull requests
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-500 dark:text-gray-400">
            Filter:
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="pending_deposit">Pending Deposit</option>
            <option value="closed">Closed</option>
            <option value="merged">Merged</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredPRs.length === 0 ? (
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
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            No pull requests
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Pull requests will appear here when created in protected repos.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Pull Request
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Author
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Risk Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredPRs.map((pr) => (
                <tr key={pr.id}>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        #{pr.number} {pr.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Created{' '}
                        {new Date(pr.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {pr.author.avatarUrl && (
                        <Image
                          src={pr.author.avatarUrl}
                          alt={pr.author.login}
                          width={24}
                          height={24}
                          className="rounded-full mr-2"
                        />
                      )}
                      <span className="text-sm text-gray-900 dark:text-white">
                        {pr.author.login}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`text-sm font-medium ${getRiskColor(
                        pr.riskScore
                      )}`}
                    >
                      {pr.riskScore}/100
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getStateColor(
                        pr.state
                      )}`}
                    >
                      {pr.state.replace('_', ' ')}
                    </span>
                    {pr.depositId && (
                      <span className="ml-2 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        Deposit
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {pr.state === 'pending_deposit' && (
                      <button
                        onClick={() => handleApprove(pr.id)}
                        className="text-green-600 hover:text-green-900 mr-4"
                      >
                        Approve
                      </button>
                    )}
                    {['open', 'pending_deposit'].includes(pr.state) && (
                      <button
                        onClick={() => handleMarkSpam(pr.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Mark Spam
                      </button>
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
