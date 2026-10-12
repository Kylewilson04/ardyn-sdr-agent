'use client';

import { cn } from '@/lib/utils';
import type { Lead } from '@/lib/types';
import { LEAD_STATUS_COLORS, LEAD_STATUS_LABELS } from '@/lib/types';
import {
  Building2,
  Globe,
  Mail,
  Star,
  ChevronRight,
  User,
  Tags,
} from 'lucide-react';

interface LeadCardProps {
  lead: Lead;
  selected?: boolean;
  onClick?: () => void;
}

export function LeadCard({ lead, selected, onClick }: LeadCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-xl border transition-all',
        selected
          ? 'bg-brand-500/10 border-brand-500/30'
          : 'bg-surface-800/30 border-surface-700/30 hover:bg-surface-800/50 hover:border-surface-600/50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <User className="w-3 h-3 text-surface-500 flex-shrink-0" />
            <span className="text-xs font-medium text-surface-200 truncate">
              {lead.firstName} {lead.lastName}
            </span>
          </div>
          {lead.title && (
            <p className="text-[10px] text-surface-500 mt-0.5 truncate">
              {lead.title}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <Building2 className="w-3 h-3 text-surface-500 flex-shrink-0" />
            <span className="text-[10px] text-surface-400 truncate">
              {lead.company}
            </span>
          </div>
        </div>
        <ChevronRight className="w-3 h-3 text-surface-600 flex-shrink-0 mt-1" />
      </div>

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span
          className={cn(
            'px-1.5 py-0.5 rounded text-[9px] font-medium',
            LEAD_STATUS_COLORS[lead.status]
          )}
        >
          {LEAD_STATUS_LABELS[lead.status]}
        </span>
        {lead.score > 0 && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-accent-amber/10 text-[9px] text-accent-amber">
            <Star className="w-2.5 h-2.5" />
            {lead.score}
          </span>
        )}
        {lead.industry && (
          <span className="px-1.5 py-0.5 rounded bg-surface-700/50 text-[9px] text-surface-500">
            {lead.industry}
          </span>
        )}
      </div>
    </button>
  );
}