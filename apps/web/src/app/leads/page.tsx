'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLeadsStore } from '@/lib/store';
import { api } from '@/lib/api';
import { LeadTable } from '@/components/leads/LeadTable';
import { CSVUpload } from '@/components/leads/CSVUpload';
import type { Lead, LeadStatus } from '@/lib/types';
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  Users,
  Upload,
  ArrowLeft,
  Mail,
  Building2,
  Globe,
  Star,
  ExternalLink,
  X,
  Loader2,
} from 'lucide-react';

// Demo leads
const demoLeads: Lead[] = Array.from({ length: 25 }, (_, i) => ({
  id: `demo-${i}`,
  email: `lead${i}@example.com`,
  firstName: ['Sarah', 'Marcus', 'Emily', 'James', 'Priya', 'Alex', 'Jordan', 'Taylor'][i % 8],
  lastName: ['Chen', 'Rodriguez', 'Park', 'Thompson', 'Patel', 'Kim', 'Lee', 'Davis'][i % 8],
  title: ['VP Engineering', 'CTO', 'Head of Platform', 'Director of Engineering', 'CEO'][i % 5],
  company: ['Stripe', 'Datadog', 'Vercel', 'Notion', 'Figma', 'Linear', 'Supabase', 'Railway'][i % 8],
  industry: ['FinTech', 'DevOps', 'Developer Tools', 'Productivity', 'Design'][i % 5],
  status: (['new', 'researching', 'contacted', 'replied', 'interested', 'not_interested', 'bounced'][i % 7]) as LeadStatus,
  score: Math.floor(Math.random() * 100),
  tags: [],
  createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
}));

export default function LeadsPage() {
  const { leads, totalLeads, isLoading, search, statusFilter, page, setLeads, setLoading, setPage } = useLeadsStore();

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const fetchLeads = useCallback(
    async (p: number, s: string, status: string | null) => {
      setLoading(true);
      try {
        const result = await api.getLeads({
          page: p,
          search: s || undefined,
          status: (status as LeadStatus) || undefined,
        });
        setLeads(result.data, result.total);
      } catch {
        // Demo fallback
        let filtered = demoLeads;
        if (s) {
          const q = s.toLowerCase();
          filtered = filtered.filter(
            (l) =>
              l.firstName.toLowerCase().includes(q) ||
              l.lastName.toLowerCase().includes(q) ||
              l.company.toLowerCase().includes(q) ||
              l.email.toLowerCase().includes(q)
          );
        }
        if (status) {
          filtered = filtered.filter((l) => l.status === status);
        }
        setLeads(filtered.slice((p - 1) * 20, p * 20), filtered.length);
        setDemoMode(true);
      } finally {
        setLoading(false);
      }
    },
    [setLeads, setLoading]
  );

  useEffect(() => {
    fetchLeads(page, search, statusFilter);
  }, [page, search, statusFilter]);

  const handleSort = (field: string, direction: 'asc' | 'desc') => {
    // In production, this triggers a re-fetch with sort params
    const sorted = [...leads].sort((a: Lead, b: Lead) => {
      const aVal = field === 'name' ? a.firstName : (a as any)[field] || '';
      const bVal = field === 'name' ? b.firstName : (b as any)[field] || '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return direction === 'asc' ? cmp : -cmp;
    });
    setLeads(sorted, totalLeads);
  };

  const handleSearch = (query: string) => {
    useLeadsStore.getState().setSearch(query);
    useLeadsStore.getState().setPage(1);
  };

  const handleStatusFilter = (status: LeadStatus | null) => {
    useLeadsStore.getState().setStatusFilter(status);
    useLeadsStore.getState().setPage(1);
  };

  const handleUploadComplete = (result: { imported: number }) => {
    if (result.imported > 0) {
      fetchLeads(1, search, statusFilter);
    }
  };

  if (showUpload) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-700 scrollbar-track-transparent">
        <div className="max-w-2xl mx-auto p-6">
          <button
            onClick={() => setShowUpload(false)}
            className="flex items-center gap-1.5 text-sm text-surface-400 hover:text-surface-200 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to leads
          </button>

          <h1 className="text-xl font-semibold text-surface-100 mb-2">
            Import Leads
          </h1>
          <p className="text-sm text-surface-500 mb-6">
            Upload a CSV file with your lead data. Expected columns: firstName,
            lastName, email, company, title (optional), industry (optional).
          </p>

          <CSVUpload onUploadComplete={handleUploadComplete} />
        </div>
      </div>
    );
  }

  // Lead detail panel
  if (selectedLead) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-700 scrollbar-track-transparent">
        <div className="max-w-3xl mx-auto p-6">
          <button
            onClick={() => setSelectedLead(null)}
            className="flex items-center gap-1.5 text-sm text-surface-400 hover:text-surface-200 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to leads
          </button>

          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-surface-800 border border-surface-700 flex items-center justify-center text-lg font-semibold text-surface-300">
                    {selectedLead.firstName[0]}
                    {selectedLead.lastName[0]}
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-surface-100">
                      {selectedLead.firstName} {selectedLead.lastName}
                    </h1>
                    {selectedLead.title && (
                      <p className="text-sm text-surface-400">
                        {selectedLead.title}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <span
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium',
                  LEAD_STATUS_COLORS[selectedLead.status]
                )}
              >
                {LEAD_STATUS_LABELS[selectedLead.status]}
              </span>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-surface-900/50 border border-surface-800/50">
                <span className="text-xs text-surface-500 uppercase tracking-wider">
                  Company
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Building2 className="w-4 h-4 text-surface-500" />
                  <span className="text-sm text-surface-200">
                    {selectedLead.company}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-surface-900/50 border border-surface-800/50">
                <span className="text-xs text-surface-500 uppercase tracking-wider">
                  Email
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Mail className="w-4 h-4 text-surface-500" />
                  <a
                    href={`mailto:${selectedLead.email}`}
                    className="text-sm text-brand-400 hover:text-brand-300"
                  >
                    {selectedLead.email}
                  </a>
                </div>
              </div>

              {selectedLead.industry && (
                <div className="p-4 rounded-xl bg-surface-900/50 border border-surface-800/50">
                  <span className="text-xs text-surface-500 uppercase tracking-wider">
                    Industry
                  </span>
                  <p className="text-sm text-surface-200 mt-1">
                    {selectedLead.industry}
                  </p>
                </div>
              )}

              <div className="p-4 rounded-xl bg-surface-900/50 border border-surface-800/50">
                <span className="text-xs text-surface-500 uppercase tracking-wider">
                  Score
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Star
                    className={cn(
                      'w-4 h-4',
                      selectedLead.score >= 80
                        ? 'text-accent-amber fill-accent-amber'
                        : 'text-surface-500'
                    )}
                  />
                  <span className="text-sm text-surface-200 font-mono">
                    {selectedLead.score}/100
                  </span>
                </div>
              </div>
            </div>

            {/* Links */}
            <div className="flex items-center gap-3">
              {selectedLead.linkedinUrl && (
                <a
                  href={selectedLead.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-700/50 text-sm text-surface-300 hover:bg-surface-800 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  LinkedIn
                </a>
              )}
              {selectedLead.website && (
                <a
                  href={selectedLead.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-700/50 text-sm text-surface-300 hover:bg-surface-800 transition-colors"
                >
                  <Globe className="w-4 h-4" />
                  Website
                </a>
              )}
            </div>

            {/* Tags */}
            {selectedLead.tags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {selectedLead.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-full bg-surface-800 border border-surface-700 text-xs text-surface-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-surface-800">
              <button className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-sm text-white font-medium transition-colors">
                Add to Campaign
              </button>
              <button className="px-4 py-2 rounded-lg border border-surface-700/50 text-sm text-surface-300 hover:bg-surface-800 transition-colors">
                Enrich Data
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-700 scrollbar-track-transparent">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-surface-100">Leads</h1>
            <p className="text-sm text-surface-500 mt-1">
              Manage and organize your prospect pipeline
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-sm text-white font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
          </div>
        ) : (
          <LeadTable
            leads={leads}
            total={totalLeads}
            page={page}
            onPageChange={setPage}
            onSort={handleSort}
            onSearch={handleSearch}
            onStatusFilter={handleStatusFilter}
            onSelectLead={setSelectedLead}
            onDeleteLead={async (id) => {
              try {
                await api.deleteLead(id);
                fetchLeads(page, search, statusFilter);
              } catch {
                // Optimistically remove in demo
                useLeadsStore.getState().removeLead(id);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}