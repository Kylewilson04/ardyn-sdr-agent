'use client';

import { useEffect, useState } from 'react';
import { useCampaignsStore } from '@/lib/store';
import { api } from '@/lib/api';
import { CampaignWizard } from '@/components/campaigns/CampaignWizard';
import { SequenceView } from '@/components/campaigns/SequenceView';
import type { Campaign, Sequence } from '@/lib/types';
import { CAMPAIGN_STATUS_LABELS } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  Rocket,
  Plus,
  Play,
  Pause,
  Square,
  Trash2,
  ChevronRight,
  Mail,
  TrendingUp,
  Users,
  Target,
  Loader2,
  ArrowLeft,
  BarChart3,
} from 'lucide-react';

// Demo campaigns
const demoCampaigns: Campaign[] = [
  {
    id: '1',
    name: 'Q4 Enterprise Outreach',
    description: 'Targeting VP/C-level at enterprise SaaS companies',
    status: 'active',
    targetAudience: 'VP Engineering and CTOs at B2B SaaS companies, 200-1000 employees, raised Series B+',
    sequence: {
      steps: [
        { id: 's1', order: 1, type: 'email', delayDays: 0, config: { subject: 'Quick question about {{company}}', aiPersonalize: true } },
        { id: 's2', order: 2, type: 'linkedin', delayDays: 3, config: { linkedinMessage: 'Hi {{firstName}}, saw your recent post about...' } },
        { id: 's3', order: 3, type: 'email', delayDays: 5, config: { subject: 'Re: {{company}} follow-up', aiPersonalize: true } },
        { id: 's4', order: 4, type: 'call', delayDays: 3, config: {} },
      ],
    },
    stats: { leadsCount: 45, contacted: 32, replied: 8, interested: 3, bounced: 2, unsubscribed: 0 },
    leads: [],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'Developer Tools Launch',
    description: 'Outreach for new SDR platform targeting mid-market',
    status: 'draft',
    targetAudience: 'Sales leaders and RevOps at companies 50-500 employees',
    sequence: {
      steps: [
        { id: 's5', order: 1, type: 'email', delayDays: 0, config: { subject: 'Your SDR team could 2x reply rates', aiPersonalize: true } },
        { id: 's6', order: 2, type: 'wait', delayDays: 4, config: {} },
        { id: 's7', order: 3, type: 'email', delayDays: 0, config: { subject: 'Case study: 3x pipeline in 30 days', aiPersonalize: true } },
      ],
    },
    stats: { leadsCount: 120, contacted: 0, replied: 0, interested: 0, bounced: 0, unsubscribed: 0 },
    leads: [],
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z',
  },
  {
    id: '3',
    name: 'SMB Inbound Follow-up',
    description: 'Automated nurture for demo requests',
    status: 'completed',
    targetAudience: 'Inbound demo requests from companies <50 employees',
    sequence: { steps: [{ id: 's8', order: 1, type: 'email', delayDays: 0, config: { subject: 'Thanks for your interest!', aiPersonalize: false } }] },
    stats: { leadsCount: 67, contacted: 67, replied: 31, interested: 14, bounced: 3, unsubscribed: 1 },
    leads: [],
    createdAt: '2026-09-15T00:00:00Z',
    updatedAt: '2026-09-15T00:00:00Z',
  },
];

const statusIcons: Record<string, typeof Play> = {
  active: Pause,
  paused: Play,
  draft: Play,
  completed: Square,
};

const statusColors: Record<string, string> = {
  active: 'bg-accent-green',
  paused: 'bg-accent-amber',
  draft: 'bg-surface-600',
  completed: 'bg-surface-500',
};

export default function CampaignsPage() {
  const { campaigns, setCampaigns, isLoading, setLoading } = useCampaignsStore();
  const [showWizard, setShowWizard] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      try {
        const data = await api.getCampaigns();
        setCampaigns(data);
      } catch {
        setCampaigns(demoCampaigns);
        setDemoMode(true);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const handleCreate = async (data: {
    name: string;
    description: string;
    targetAudience: string;
    sequence: Sequence;
  }) => {
    try {
      const campaign = await api.createCampaign(data);
      useCampaignsStore.getState().addCampaign(campaign);
    } catch {
      // Demo fallback
      const newCampaign: Campaign = {
        id: `demo-${Date.now()}`,
        ...data,
        status: 'draft',
        stats: { leadsCount: 0, contacted: 0, replied: 0, interested: 0, bounced: 0, unsubscribed: 0 },
        leads: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      useCampaignsStore.getState().addCampaign(newCampaign);
    }
    setShowWizard(false);
    setDemoMode(true);
  };

  const handleStatusChange = async (id: string, newStatus: Campaign['status']) => {
    try {
      const updated = await api.updateCampaignStatus(id, newStatus);
      useCampaignsStore.getState().updateCampaign(id, updated);
    } catch {
      useCampaignsStore.getState().updateCampaign(id, { status: newStatus });
    }
  };

  // Campaign detail view
  if (selectedCampaign) {
    const c = selectedCampaign;
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-700 scrollbar-track-transparent">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          <button
            onClick={() => setSelectedCampaign(null)}
            className="flex items-center gap-1.5 text-sm text-surface-400 hover:text-surface-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to campaigns
          </button>

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-surface-100">{c.name}</h1>
              {c.description && (
                <p className="text-sm text-surface-500 mt-1">{c.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {c.status === 'draft' && (
                <button
                  onClick={() => handleStatusChange(c.id, 'active')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-green hover:bg-accent-green/90 text-sm text-white font-medium transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Launch
                </button>
              )}
              {c.status === 'active' && (
                <button
                  onClick={() => handleStatusChange(c.id, 'paused')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-700/50 text-sm text-surface-300 hover:bg-surface-800 transition-colors"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
              )}
              {c.status === 'paused' && (
                <button
                  onClick={() => handleStatusChange(c.id, 'active')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-green hover:bg-accent-green/90 text-sm text-white font-medium transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Resume
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Leads', value: c.stats.leadsCount, icon: Users },
              { label: 'Contacted', value: c.stats.contacted, icon: Mail },
              { label: 'Replied', value: c.stats.replied, icon: TrendingUp },
              { label: 'Interested', value: c.stats.interested, icon: Target },
              { label: 'Bounced', value: c.stats.bounced, icon: BarChart3 },
              { label: 'Unsub.', value: c.stats.unsubscribed, icon: BarChart3 },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="p-3 rounded-xl bg-surface-900/50 border border-surface-800/50 text-center"
                >
                  <Icon className="w-4 h-4 text-surface-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-surface-100">{stat.value}</p>
                  <p className="text-[10px] text-surface-500">{stat.label}</p>
                </div>
              );
            })}
          </div>

          {/* Sequence timeline */}
          <div className="p-5 rounded-2xl bg-surface-900/50 border border-surface-800/50">
            <h3 className="text-sm font-medium text-surface-300 mb-4">
              Sequence Timeline
            </h3>
            <SequenceView sequence={c.sequence} />
          </div>

          {/* Target audience */}
          {c.targetAudience && (
            <div className="p-5 rounded-2xl bg-surface-900/50 border border-surface-800/50">
              <h3 className="text-sm font-medium text-surface-300 mb-2">
                Target Audience
              </h3>
              <p className="text-sm text-surface-400">{c.targetAudience}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Wizard view
  if (showWizard) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-700 scrollbar-track-transparent">
        <div className="max-w-2xl mx-auto p-6">
          <button
            onClick={() => setShowWizard(false)}
            className="flex items-center gap-1.5 text-sm text-surface-400 hover:text-surface-200 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to campaigns
          </button>
          <CampaignWizard
            onComplete={handleCreate}
            onCancel={() => setShowWizard(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-700 scrollbar-track-transparent">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-surface-100">Campaigns</h1>
            <p className="text-sm text-surface-500 mt-1">
              Create and manage your outreach campaigns
            </p>
          </div>
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-sm text-white font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        </div>

        {/* Campaign list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => {
              const StatusIcon = statusIcons[c.status];
              const replyRate =
                c.stats.contacted > 0
                  ? ((c.stats.replied / c.stats.contacted) * 100).toFixed(1)
                  : '0';

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCampaign(c)}
                  className="p-5 rounded-2xl bg-surface-900/50 border border-surface-800/50 hover:border-surface-700/50 cursor-pointer transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full',
                            statusColors[c.status]
                          )}
                        />
                        <h3 className="text-sm font-medium text-surface-200">
                          {c.name}
                        </h3>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-medium',
                            c.status === 'active'
                              ? 'bg-accent-green/10 text-accent-green'
                              : c.status === 'paused'
                              ? 'bg-accent-amber/10 text-accent-amber'
                              : c.status === 'completed'
                              ? 'bg-surface-700/50 text-surface-400'
                              : 'bg-surface-700/50 text-surface-500'
                          )}
                        >
                          {CAMPAIGN_STATUS_LABELS[c.status]}
                        </span>
                      </div>
                      {c.description && (
                        <p className="text-xs text-surface-500 mt-1.5 line-clamp-1">
                          {c.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Quick stats */}
                      <div className="hidden sm:flex items-center gap-4 mr-4">
                        <div className="text-center">
                          <p className="text-sm font-mono font-semibold text-surface-200">
                            {c.stats.leadsCount}
                          </p>
                          <p className="text-[9px] text-surface-500">Leads</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-mono font-semibold text-surface-200">
                            {replyRate}%
                          </p>
                          <p className="text-[9px] text-surface-500">Reply</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-mono font-semibold text-accent-green">
                            {c.stats.interested}
                          </p>
                          <p className="text-[9px] text-surface-500">Int.</p>
                        </div>
                      </div>

                      {/* Status action */}
                      {(c.status === 'draft' || c.status === 'paused') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(c.id, 'active');
                          }}
                          className="p-2 rounded-lg text-accent-green hover:bg-accent-green/10 transition-colors"
                          title="Launch campaign"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      {c.status === 'active' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(c.id, 'paused');
                          }}
                          className="p-2 rounded-lg text-accent-amber hover:bg-accent-amber/10 transition-colors"
                          title="Pause campaign"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      )}

                      <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-surface-400 transition-colors" />
                    </div>
                  </div>

                  {/* Progress bar for active campaigns */}
                  {c.status === 'active' && c.stats.contacted > 0 && (
                    <div className="mt-3">
                      <div className="w-full h-1 rounded-full bg-surface-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{
                            width: `${(c.stats.contacted / c.stats.leadsCount) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-surface-500">
                          {c.stats.contacted}/{c.stats.leadsCount} contacted
                        </span>
                        <span className="text-[10px] text-surface-600">
                          {c.sequence.steps.length} step sequence
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {campaigns.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-surface-500">
                <Rocket className="w-10 h-10 mb-4 opacity-30" />
                <p className="text-sm">No campaigns yet</p>
                <button
                  onClick={() => setShowWizard(true)}
                  className="mt-3 text-sm text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Create your first campaign
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}