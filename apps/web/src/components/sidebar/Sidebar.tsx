'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUIStore, useChatStore } from '@/lib/store';
import { LeadCard } from './LeadCard';
import type { Lead, Campaign } from '@/lib/types';
import { CAMPAIGN_STATUS_LABELS } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  BarChart3,
  Users,
  Rocket,
  BookOpen,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Search,
  ChevronDown,
  Sparkles,
  Layers,
  ArrowUpRight,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';

// Mock data for the sidebar — in production this comes from API
const mockLeads: Lead[] = [
  {
    id: '1',
    email: 'sarah.chen@stripe.com',
    firstName: 'Sarah',
    lastName: 'Chen',
    title: 'VP Engineering',
    company: 'Stripe',
    industry: 'FinTech',
    score: 92,
    status: 'interested',
    tags: ['decision-maker', 'warm'],
    createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
  },
  {
    id: '2',
    email: 'marcus.rodriguez@datadog.com',
    firstName: 'Marcus',
    lastName: 'Rodriguez',
    title: 'Head of Platform',
    company: 'Datadog',
    industry: 'DevOps',
    score: 78,
    status: 'replied',
    tags: ['technical'],
    createdAt: '2026-10-09T00:00:00Z',
    updatedAt: '2026-10-09T00:00:00Z',
  },
  {
    id: '3',
    email: 'emily.park@vercel.com',
    firstName: 'Emily',
    lastName: 'Park',
    title: 'CTO',
    company: 'Vercel',
    industry: 'Developer Tools',
    score: 85,
    status: 'contacted',
    tags: ['c-level', 'priority'],
    createdAt: '2026-10-08T00:00:00Z',
    updatedAt: '2026-10-08T00:00:00Z',
  },
];

const mockCampaigns: Campaign[] = [
  {
    id: 'c1',
    name: 'Q4 Enterprise Outreach',
    status: 'active',
    sequence: { steps: [] },
    stats: { leadsCount: 45, contacted: 32, replied: 8, interested: 3, bounced: 2, unsubscribed: 0 },
    leads: [],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'c2',
    name: 'SDR Tool Launch',
    status: 'draft',
    sequence: { steps: [] },
    stats: { leadsCount: 120, contacted: 0, replied: 0, interested: 0, bounced: 0, unsubscribed: 0 },
    leads: [],
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z',
  },
];

const navItems = [
  { href: '/', label: 'Chat', icon: MessageSquare },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Rocket },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const [campaignsExpanded, setCampaignsExpanded] = useState(true);
  const [leadsExpanded, setLeadsExpanded] = useState(true);

  if (!sidebarOpen) {
    return (
      <div className="flex flex-col items-center w-14 border-r border-surface-800 bg-surface-950 py-4 gap-4">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                'p-2 rounded-lg transition-colors relative group',
                isActive
                  ? 'text-brand-400 bg-brand-500/10'
                  : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800'
              )}
              title={item.label}
            >
              <Icon className="w-4 h-4" />
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-brand-500 rounded-r-full" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-72 border-r border-surface-800 bg-surface-950 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-surface-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-brand-400" />
          <span className="font-semibold text-sm text-surface-100">
            Ardyn SDR
          </span>
        </div>
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* New chat button */}
      <div className="px-3 py-3">
        <button
          onClick={() => {
            clearMessages();
            setActiveSession(null);
            router.push('/');
          }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 hover:bg-brand-500/20 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
      </div>

      {/* Navigation */}
      <nav className="px-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all',
                isActive
                  ? 'bg-brand-500/10 text-brand-400 font-medium'
                  : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
              {isActive && (
                <span className="ml-auto w-1 h-1 rounded-full bg-brand-400" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-700 scrollbar-track-transparent">
        {/* Active Campaigns */}
        <div className="px-3 pt-4">
          <button
            onClick={() => setCampaignsExpanded(!campaignsExpanded)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-surface-500 uppercase tracking-wider"
          >
            <span className="flex items-center gap-2">
              <Layers className="w-3 h-3" />
              Campaigns
            </span>
            <ChevronDown
              className={cn(
                'w-3 h-3 transition-transform',
                campaignsExpanded && 'rotate-180'
              )}
            />
          </button>
          {campaignsExpanded && (
            <div className="mt-1 space-y-1">
              {mockCampaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-800/50 transition-colors cursor-pointer"
                  onClick={() => router.push('/campaigns')}
                >
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      campaign.status === 'active'
                        ? 'bg-accent-green'
                        : campaign.status === 'paused'
                        ? 'bg-accent-amber'
                        : 'bg-surface-600'
                    )}
                  />
                  <span className="text-xs text-surface-300 truncate flex-1">
                    {campaign.name}
                  </span>
                  {campaign.status === 'active' && (
                    <span className="text-[9px] text-surface-500">
                      {campaign.stats.replied}/{campaign.stats.contacted}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Leads */}
        <div className="px-3 pt-3 pb-4">
          <button
            onClick={() => setLeadsExpanded(!leadsExpanded)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-surface-500 uppercase tracking-wider"
          >
            <span className="flex items-center gap-2">
              <Users className="w-3 h-3" />
              Recent Leads
            </span>
            <ChevronDown
              className={cn(
                'w-3 h-3 transition-transform',
                leadsExpanded && 'rotate-180'
              )}
            />
          </button>
          {leadsExpanded && (
            <div className="mt-1 space-y-1">
              {mockLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onClick={() => router.push('/leads')}
                />
              ))}
              <button
                onClick={() => router.push('/leads')}
                className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs text-surface-500 hover:text-surface-300 transition-colors"
              >
                View all leads
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom status */}
      <div className="px-4 py-3 border-t border-surface-800">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
          <span className="text-[10px] text-surface-500">
            Agent online · Ready
          </span>
        </div>
      </div>
    </div>
  );
}