'use client';

import { useState } from 'react';
import type { Lead, LeadStatus } from '@/lib/types';
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  MoreHorizontal,
  Star,
  Mail,
  Building2,
  ExternalLink,
  Trash2,
  X,
} from 'lucide-react';

interface LeadTableProps {
  leads: Lead[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  onSort: (field: string, direction: 'asc' | 'desc') => void;
  onSearch: (query: string) => void;
  onStatusFilter: (status: LeadStatus | null) => void;
  onSelectLead: (lead: Lead) => void;
  onDeleteLead: (id: string) => void;
}

type SortField = 'name' | 'company' | 'status' | 'score' | 'lastContactedAt';

export function LeadTable({
  leads,
  total,
  page,
  onPageChange,
  onSort,
  onSearch,
  onStatusFilter,
  onSelectLead,
  onDeleteLead,
}: LeadTableProps) {
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchValue, setSearchValue] = useState('');
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [activeStatus, setActiveStatus] = useState<LeadStatus | null>(null);

  const totalPages = Math.ceil(total / 20);

  const handleSort = (field: SortField) => {
    const newDir = field === sortField && sortDir === 'desc' ? 'asc' : 'desc';
    setSortField(field);
    setSortDir(newDir);
    onSort(field, newDir);
  };

  const handleSearch = (value: string) => {
    setSearchValue(value);
    onSearch(value);
  };

  const handleStatusFilter = (status: LeadStatus | null) => {
    setActiveStatus(status);
    setStatusFilterOpen(false);
    onStatusFilter(status);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search leads..."
            className="w-full pl-9 pr-8 py-2 rounded-lg bg-surface-800/50 border border-surface-700/50 text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-brand-500/50 transition-colors"
          />
          {searchValue && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="relative">
          <button
            onClick={() => setStatusFilterOpen(!statusFilterOpen)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors',
              activeStatus
                ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
                : 'bg-surface-800/50 border-surface-700/50 text-surface-400 hover:text-surface-200'
            )}
          >
            <Filter className="w-4 h-4" />
            {activeStatus ? LEAD_STATUS_LABELS[activeStatus] : 'Status'}
          </button>
          {statusFilterOpen && (
            <div className="absolute top-full left-0 mt-1 w-44 rounded-xl bg-surface-850 border border-surface-700 shadow-xl z-50 py-1 animate-fade-in">
              <button
                onClick={() => handleStatusFilter(null)}
                className="w-full text-left px-3 py-2 text-sm text-surface-300 hover:bg-surface-800 transition-colors"
              >
                All Statuses
              </button>
              {(
                Object.entries(LEAD_STATUS_LABELS) as [LeadStatus, string][]
              ).map(([status, label]) => (
                <button
                  key={status}
                  onClick={() => handleStatusFilter(status)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm transition-colors',
                    activeStatus === status
                      ? 'bg-brand-500/10 text-brand-400'
                      : 'text-surface-300 hover:bg-surface-800'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block w-2 h-2 rounded-full mr-2',
                      LEAD_STATUS_COLORS[status].split(' ')[0]
                    )}
                  />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lead count */}
        <span className="text-xs text-surface-500 ml-auto">
          {total} lead{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-surface-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-700/50 bg-surface-800/30">
                {[
                  { label: 'Name', field: 'name' as SortField },
                  { label: 'Company', field: 'company' as SortField },
                  { label: 'Status', field: 'status' as SortField },
                  { label: 'Score', field: 'score' as SortField },
                  { label: 'Last Contact', field: 'lastContactedAt' as SortField },
                ].map((col) => (
                  <th
                    key={col.field}
                    className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider"
                  >
                    <button
                      onClick={() => handleSort(col.field)}
                      className="flex items-center gap-1 hover:text-surface-300 transition-colors"
                    >
                      {col.label}
                      <SortIcon field={col.field} />
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="hover:bg-surface-800/30 transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-surface-700 flex items-center justify-center text-xs text-surface-400 font-medium">
                        {lead.firstName[0]}
                        {lead.lastName[0]}
                      </div>
                      <div>
                        <p className="text-sm text-surface-200 font-medium">
                          {lead.firstName} {lead.lastName}
                        </p>
                        {lead.title && (
                          <p className="text-[11px] text-surface-500">
                            {lead.title}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3 h-3 text-surface-500" />
                      <span className="text-sm text-surface-300">
                        {lead.company}
                      </span>
                    </div>
                    {lead.industry && (
                      <p className="text-[11px] text-surface-500 mt-0.5">
                        {lead.industry}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
                        LEAD_STATUS_COLORS[lead.status]
                      )}
                    >
                      {LEAD_STATUS_LABELS[lead.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Star
                        className={cn(
                          'w-3 h-3',
                          lead.score >= 80
                            ? 'text-accent-amber fill-accent-amber'
                            : lead.score >= 50
                            ? 'text-accent-amber/50'
                            : 'text-surface-600'
                        )}
                      />
                      <span
                        className={cn(
                          'text-sm font-mono',
                          lead.score >= 80
                            ? 'text-accent-amber'
                            : lead.score >= 50
                            ? 'text-surface-300'
                            : 'text-surface-500'
                        )}
                      >
                        {lead.score}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-surface-400">
                      {lead.lastContactedAt
                        ? new Date(lead.lastContactedAt).toLocaleDateString()
                        : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-700 transition-colors"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {lead.linkedinUrl && (
                        <a
                          href={lead.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-700 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLead(lead.id);
                        }}
                        className="p-1.5 rounded-lg text-surface-500 hover:text-accent-red hover:bg-surface-700 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {leads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-surface-500">
            <Search className="w-8 h-8 mb-3 opacity-30" />
            <p className="text-sm">No leads found</p>
            <p className="text-xs mt-1">Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-surface-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={cn(
                    'w-8 h-8 rounded-lg text-sm transition-colors',
                    page === pageNum
                      ? 'bg-brand-500 text-white'
                      : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800'
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}