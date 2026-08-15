'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ShieldCheck, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      router.push('/admin');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Invalid passphrase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-ink-950">
      {/* Background Ambient Orbs */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-30">
        <div className="orb orb-1 top-[-10%] left-[-10%]" />
        <div className="orb orb-2 bottom-[-10%] right-[-10%]" />
        <div className="absolute inset-0 dot-grid opacity-15" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-blue-500/10 border border-brand-blue-500/30 text-brand-blue-400 mb-4 shadow-glow-sm">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">VerifAI Internal Admin</h1>
          <p className="text-sm text-ink-400 mt-1">Authenticated area for team model control & training</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="glass-card p-6 md:p-8 rounded-2xl border border-ink-800 shadow-2xl space-y-5"
        >
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-300 mb-2">
              Admin Passphrase
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password..."
                className="w-full px-4 py-3 bg-ink-900/80 border border-ink-700/80 rounded-xl text-white placeholder-ink-500 focus:outline-none focus:border-brand-blue-400 focus:ring-1 focus:ring-brand-blue-400 transition-all text-sm"
                required
              />
              <Lock className="w-4 h-4 text-ink-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
            <p className="text-xs text-ink-500 mt-1.5">
              Set <code className="text-brand-blue-300">ADMIN_PASSWORD</code> env var or use default dev password.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 px-4 rounded-xl bg-brand-blue-600 hover:bg-brand-blue-500 text-white font-medium text-sm transition-all shadow-glow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Access Admin Portal</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
