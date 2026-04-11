'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Database, Server, HardDrive, CheckCircle2, XCircle } from 'lucide-react';

interface CacheStatsData {
  connected: boolean;
  backend: string;
  keyCount?: number;
  memoryUsed?: string;
  instance: string;
  error?: string;
}

export function CacheStats() {
  const [stats, setStats] = useState<CacheStatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/cache/stats');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch cache stats');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Cache Backend</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchStats}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !stats ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatItem
              icon={stats.connected
                ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                : <XCircle className="h-4 w-4 text-red-500" />
              }
              label="Status"
              value={stats.connected ? 'Connected' : 'Disconnected'}
              detail={stats.error}
            />
            <StatItem
              icon={<Database className="h-4 w-4 text-muted-foreground" />}
              label="Backend"
              value={stats.connected ? 'Valkey' : 'In-memory'}
            />
            {stats.connected && (
              <>
                <StatItem
                  icon={<HardDrive className="h-4 w-4 text-muted-foreground" />}
                  label="Keys"
                  value={stats.keyCount?.toLocaleString() ?? '—'}
                  detail={stats.memoryUsed ? `${stats.memoryUsed} used` : undefined}
                />
                <StatItem
                  icon={<Server className="h-4 w-4 text-muted-foreground" />}
                  label="Instance"
                  value={stats.instance}
                />
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatItem({ icon, label, value, detail }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
        {detail && <p className="text-xs text-muted-foreground truncate">{detail}</p>}
      </div>
    </div>
  );
}
