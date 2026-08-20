'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Sparkles } from 'lucide-react';

export default function Home() {
  const { accessToken, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      router.replace(accessToken ? '/dashboard' : '/login');
    }
  }, [accessToken, isLoading, router]);

  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center animate-pulse shadow-lg shadow-sky-500/30">
          <Sparkles size={22} className="text-slate-950" />
        </div>
        <div className="text-slate-400 text-sm">A redirecionar…</div>
      </div>
    </div>
  );
}
