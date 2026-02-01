'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { user, login } = useAuth();

  return (
    <div>
      {/* Hero */}
      <section className="py-16 border-b border-primary-200">
        <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
          Protect Your Repo<br />
          <span className="text-primary-500">From Spam PRs</span>
        </h1>
        <p className="text-lg text-primary-600 mb-8 max-w-2xl">
          CodeReserve uses reputation-based filtering to protect open source projects.
          New contributors deposit a small amount that is refunded when their PR is merged.
        </p>
        <div className="flex gap-4">
          {user ? (
            <Link href="/dashboard" className="btn">
              Go to Dashboard
            </Link>
          ) : (
            <button onClick={login} className="btn">
              Get Started
            </button>
          )}
          <a
            href="https://github.com/Dohkku/codereserve"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline"
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 border-b border-primary-200">
        <h2 className="text-2xl font-bold mb-8">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-bold mb-2">1. Reputation Scoring</h3>
            <p className="text-primary-600 text-sm">
              We analyze GitHub account age, previous contributions, and other
              factors to calculate a trust score.
            </p>
          </div>
          <div>
            <h3 className="font-bold mb-2">2. Refundable Deposits</h3>
            <p className="text-primary-600 text-sm">
              New contributors deposit $5 USDC. It is fully refunded when
              the PR is merged or closed normally.
            </p>
          </div>
          <div>
            <h3 className="font-bold mb-2">3. Trustless & Secure</h3>
            <p className="text-primary-600 text-sm">
              Deposits are held in a smart contract on Base. If the backend
              disappears, funds auto-refund after 30 days.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <h2 className="text-2xl font-bold mb-4">Ready to protect your repo?</h2>
        <p className="text-primary-600 mb-6">Install CodeReserve today.</p>
        {user ? (
          <Link href="/dashboard" className="btn">
            Go to Dashboard
          </Link>
        ) : (
          <button onClick={login} className="btn">
            Get Started
          </button>
        )}
      </section>
    </div>
  );
}
