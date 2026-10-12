'use client';

import { useEffect, useState } from 'react';
import { useDashboardStore } from '@/lib/store';
import { api } from '@/lib/api';
import type { DashboardStats } from '@/lib/types';
import {
  BarChart3,
  Users,
  Mail,
  TrendingUp,
  Target,
  DollarSign,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart as ReBarChart,
  Bar,
  Cell,
} from 'recharts';

// Fallback stats for demo mode
const fallbackStats: DashboardStats = {
  totalLeads: 142,
  activeCampaigns: 3,
  emailsSent: 89,
  replyRate: 12.4,
  interestedRate: 5.6,
  pipelineValue: 280000,
  leadsByStatus: [
    { status: 'new', count: 45 },
    { status: 'researching', count: 18 },
    { status: 'contacted', count: 42 },
    { status: 'replied', count: 22 },
    { status: 'interested', count: 8 },
    { status: 'not_interested', count: 5 },
    { status: 'bounced', count: 2 },
  ],
  dailyActivity: [
    { date: 'Mon', emails: 15, replies: 2 },
    { date: 'Tue', emails: 22, replies: 4 },
    { date: 'Wed', emails: 18, replies: 3 },
    { date: 'Thu', emails: 20, replies: 5 },
    { date: 'Fri', emails: 14, replies: 1 },
  ],
  topPerformingCampaigns: [
    { name: 'Q4 Enterprise Outreach', replyRate: 19.2, interested: 3 },
    { name: 'Developer Tools Campaign', replyRate: 11.8, interested: 2 },
    { name: 'SMB Outreach', replyRate: 8.4, interested: 1 },
  ],
};

export default function DashboardPage() {
  const { stats, setStats, isLoading, setLoading } = useDashboardStore();
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const data = await api.getDashboardStats();
        setStats(data);
      } catch {
        setStats(fallbackStats);
        setDemoMode(true);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const s = stats;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
      </div>
    );
  }

  if (!s) return null;

  const statCards = [
    {
      label: 'Total Leads',
      value: s.totalLeads,
      icon: Users,
      color: 'text-brand-400',
      bg: 'bg-brand-500/10',
    },
    {
      label: 'Emails Sent',
      value: s.emailsSent,
      icon: Mail,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      trend: '+12%',
      trendUp: true,
    },
    {
      label: 'Reply Rate',
      value: `${s.replyRate}%`,
      icon: TrendingUp,
      color: 'text-accent-green',
      bg: 'bg-accent-green/10',
      trend: '+2.1%',
      trendUp: true,
    },
    {
      label: 'Interested',
      value: `${s.interestedRate}%`,
      icon: Target,
      color: 'text-accent-purple',
      bg: 'bg-accent-purple/10',
    },
  ];

  const statusColors: Record<string, string> = {
    new: '#3b82f6',
    researching: '#a855f7',
    contacted: '#f59e0b',
    replied: '#06b6d4',
    interested: '#22c55e',
    not_interested: '#ef4444',
    bounced: '#ef4444',
    unsubscribed: '#6b7280',
  };

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-700 scrollbar-track-transparent">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-surface-100">Dashboard</h1>
            <p className="text-sm text-surface-500 mt-1">
              Your SDR pipeline at a glance
            </p>
          </div>
          {demoMode && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-amber/10 border border-accent-amber/20 text-xs text-accent-amber">
              <Sparkles className="w-3 h-3" />
              Demo Mode
            </span>
          )}
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="p-5 rounded-2xl bg-surface-900/50 border border-surface-800/50 hover:border-surface-700/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-surface-500 font-medium uppercase tracking-wider">
                    {card.label}
                  </span>
                  <div className={cn('p-2 rounded-xl', card.bg)}>
                    <Icon className={cn('w-4 h-4', card.color)} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-surface-100 tracking-tight">
                  {card.value}
                </p>
                {card.trend && (
                  <div className="flex items-center gap-1 mt-2">
                    {card.trendUp ? (
                      <ArrowUp className="w-3 h-3 text-accent-green" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-accent-red" />
                    )}
                    <span
                      className={cn(
                        'text-xs font-medium',
                        card.trendUp ? 'text-accent-green' : 'text-accent-red'
                      )}
                    >
                      {card.trend}
                    </span>
                    <span className="text-xs text-surface-500">vs last week</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Activity chart */}
          <div className="lg:col-span-2 p-5 rounded-2xl bg-surface-900/50 border border-surface-800/50">
            <h3 className="text-sm font-medium text-surface-300 mb-4">
              Daily Activity
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={s.dailyActivity}>
                  <defs>
                    <linearGradient id="emailsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3366ff" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3366ff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="repliesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(51,65,85,0.5)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="emails"
                    stroke="#3366ff"
                    strokeWidth={2}
                    fill="url(#emailsGradient)"
                    name="Emails"
                  />
                  <Area
                    type="monotone"
                    dataKey="replies"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#repliesGradient)"
                    name="Replies"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top campaigns */}
          <div className="p-5 rounded-2xl bg-surface-900/50 border border-surface-800/50">
            <h3 className="text-sm font-medium text-surface-300 mb-4">
              Top Campaigns
            </h3>
            <div className="space-y-4">
              {s.topPerformingCampaigns.map((campaign, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-surface-300 truncate">
                      {campaign.name}
                    </span>
                    <span className="text-xs font-mono text-accent-green">
                      {campaign.replyRate}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-surface-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.min(campaign.replyRate * 5, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-surface-500">
                    {campaign.interested} interested
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Leads by status */}
        <div className="p-5 rounded-2xl bg-surface-900/50 border border-surface-800/50">
          <h3 className="text-sm font-medium text-surface-300 mb-4">
            Leads by Status
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ReBarChart
                data={s.leadsByStatus}
                layout="vertical"
                margin={{ left: 80 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(51,65,85,0.3)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <YAxis
                  type="category"
                  dataKey="status"
                  axisLine={false}
                  tickLine={false}
                  tick={({ x, y, payload }) => (
                    <text
                      x={x - 8}
                      y={y}
                      dy={4}
                      textAnchor="end"
                      fill="#94a3b8"
                      fontSize={12}
                      className="capitalize"
                    >
                      {payload.value.replace(/_/g, ' ')}
                    </text>
                  )}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                  {s.leadsByStatus.map((entry) => (
                    <Cell
                      key={entry.status}
                      fill={statusColors[entry.status] || '#6b7280'}
                      fillOpacity={0.8}
                    />
                  ))}
                </Bar>
              </ReBarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}