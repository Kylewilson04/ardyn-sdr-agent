'use client';

import { cn } from '@/lib/utils';
import type { Sequence, SequenceStep } from '@/lib/types';
import {
  Mail,
  MessageSquare,
  Phone,
  Clock,
  CheckCircle2,
  Circle,
  ArrowDown,
} from 'lucide-react';

interface SequenceViewProps {
  sequence: Sequence;
}

const stepIcons: Record<SequenceStep['type'], typeof Mail> = {
  email: Mail,
  linkedin: MessageSquare,
  call: Phone,
  wait: Clock,
};

const stepColors: Record<SequenceStep['type'], string> = {
  email: 'border-brand-400/50 bg-brand-500/10 text-brand-400',
  linkedin: 'border-blue-400/50 bg-blue-500/10 text-blue-400',
  call: 'border-accent-green/50 bg-accent-green/10 text-accent-green',
  wait: 'border-accent-amber/50 bg-accent-amber/10 text-accent-amber',
};

const stepLabels: Record<SequenceStep['type'], string> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  call: 'Call',
  wait: 'Wait',
};

export function SequenceView({ sequence }: SequenceViewProps) {
  return (
    <div className="flex items-start gap-0">
      {sequence.steps.map((step, idx) => {
        const Icon = stepIcons[step.type];
        const isLast = idx === sequence.steps.length - 1;

        return (
          <div key={step.id} className="flex items-start flex-1">
            <div className="flex flex-col items-center">
              {/* Node */}
              <div
                className={cn(
                  'relative w-12 h-12 rounded-xl border flex items-center justify-center',
                  stepColors[step.type]
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center text-[10px] font-mono text-surface-400">
                  {idx + 1}
                </span>
              </div>

              {/* Label */}
              <div className="mt-2 text-center">
                <p className="text-xs font-medium text-surface-300">
                  {stepLabels[step.type]}
                </p>
                {step.delayDays > 0 && (
                  <p className="text-[10px] text-surface-600 mt-0.5">
                    +{step.delayDays}d
                  </p>
                )}
              </div>
            </div>

            {/* Connector */}
            {!isLast && (
              <div className="flex-1 flex items-start justify-center pt-5">
                <div className="w-full h-px bg-surface-700 relative">
                  <ArrowDown className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-3 h-3 text-surface-600 rotate-90" />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}