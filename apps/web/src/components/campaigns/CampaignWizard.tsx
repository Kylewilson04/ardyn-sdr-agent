'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Sequence, SequenceStep } from '@/lib/types';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Users,
  Target,
  Mail,
  MessageSquare,
  Phone,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  ArrowRight,
  GripVertical,
} from 'lucide-react';

interface CampaignWizardProps {
  onComplete: (data: {
    name: string;
    description: string;
    targetAudience: string;
    sequence: Sequence;
  }) => void;
  onCancel: () => void;
}

const STEP_TYPES = [
  { type: 'email' as const, icon: Mail, label: 'Email', color: 'text-brand-400' },
  {
    type: 'linkedin' as const,
    icon: MessageSquare,
    label: 'LinkedIn',
    color: 'text-blue-400',
  },
  { type: 'call' as const, icon: Phone, label: 'Call', color: 'text-accent-green' },
  { type: 'wait' as const, icon: Clock, label: 'Wait', color: 'text-accent-amber' },
];

export function CampaignWizard({ onComplete, onCancel }: CampaignWizardProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [sequenceSteps, setSequenceSteps] = useState<SequenceStep[]>([
    {
      id: 'step-1',
      order: 1,
      type: 'email',
      delayDays: 0,
      config: {
        subject: '',
        template: '',
        aiPersonalize: true,
      },
    },
  ]);

  const addStep = (type: SequenceStep['type']) => {
    const newStep: SequenceStep = {
      id: `step-${Date.now()}`,
      order: sequenceSteps.length + 1,
      type,
      delayDays: type === 'wait' ? 3 : 1,
      config: {},
    };
    setSequenceSteps([...sequenceSteps, newStep]);
  };

  const removeStep = (id: string) => {
    if (sequenceSteps.length <= 1) return;
    setSequenceSteps(
      sequenceSteps
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, order: i + 1 }))
    );
  };

  const updateStep = (id: string, updates: Partial<SequenceStep>) => {
    setSequenceSteps(
      sequenceSteps.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const handleComplete = () => {
    if (!name.trim()) return;
    onComplete({
      name: name.trim(),
      description: description.trim(),
      targetAudience: targetAudience.trim(),
      sequence: { steps: sequenceSteps },
    });
  };

  const totalSteps = 3;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-4 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all',
                s < step
                  ? 'bg-accent-green text-white'
                  : s === step
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface-800 text-surface-500 border border-surface-700'
              )}
            >
              {s < step ? <Check className="w-4 h-4" /> : s}
            </div>
            <span
              className={cn(
                'text-sm',
                s <= step ? 'text-surface-200' : 'text-surface-600'
              )}
            >
              {s === 1 ? 'Basics' : s === 2 ? 'Sequence' : 'Review'}
            </span>
            {s < 3 && (
              <div
                className={cn(
                  'flex-1 h-px',
                  s < step ? 'bg-accent-green/50' : 'bg-surface-700'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Campaign Basics */}
      {step === 1 && (
        <div className="space-y-5 animate-slide-up">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Campaign Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q4 Enterprise Outreach"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-800/50 border border-surface-700/50 text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-brand-500/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this campaign about?"
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl bg-surface-800/50 border border-surface-700/50 text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-brand-500/50 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Target Audience
            </label>
            <div className="relative">
              <Target className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g., VP Engineering at B2B SaaS companies 100-500 employees"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-800/50 border border-surface-700/50 text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Sequence Builder */}
      {step === 2 && (
        <div className="space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-surface-200">
              Outreach Sequence
            </h3>
            <span className="text-xs text-surface-500">
              {sequenceSteps.length} step{sequenceSteps.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-3">
            {sequenceSteps.map((seqStep, idx) => (
              <div
                key={seqStep.id}
                className="p-4 rounded-xl bg-surface-800/30 border border-surface-700/50"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-surface-500">
                      #{idx + 1}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-surface-600" />
                    {/* Step type select */}
                    <select
                      value={seqStep.type}
                      onChange={(e) =>
                        updateStep(seqStep.id, {
                          type: e.target.value as SequenceStep['type'],
                        })
                      }
                      className="text-sm bg-transparent text-surface-200 focus:outline-none cursor-pointer"
                    >
                      {STEP_TYPES.map((t) => (
                        <option
                          key={t.type}
                          value={t.type}
                          className="bg-surface-850"
                        >
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => removeStep(seqStep.id)}
                    className="p-1 rounded text-surface-600 hover:text-accent-red transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Step-specific config */}
                {seqStep.type === 'email' && (
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      value={seqStep.config.subject || ''}
                      onChange={(e) =>
                        updateStep(seqStep.id, {
                          config: { ...seqStep.config, subject: e.target.value },
                        })
                      }
                      placeholder="Email subject line"
                      className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-700/50 text-xs text-surface-200 placeholder-surface-500 focus:outline-none focus:border-brand-500/50"
                    />
                    <textarea
                      value={seqStep.config.template || ''}
                      onChange={(e) =>
                        updateStep(seqStep.id, {
                          config: {
                            ...seqStep.config,
                            template: e.target.value,
                          },
                        })
                      }
                      placeholder="Email template... Use {{firstName}}, {{company}} for personalization"
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-700/50 text-xs text-surface-200 placeholder-surface-500 focus:outline-none focus:border-brand-500/50 resize-none"
                    />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={seqStep.config.aiPersonalize ?? false}
                        onChange={(e) =>
                          updateStep(seqStep.id, {
                            config: {
                              ...seqStep.config,
                              aiPersonalize: e.target.checked,
                            },
                          })
                        }
                        className="rounded bg-surface-800 border-surface-600 text-brand-500 focus:ring-brand-500"
                      />
                      <span className="flex items-center gap-1 text-xs text-surface-400">
                        <Sparkles className="w-3 h-3 text-brand-400" />
                        AI personalize per lead
                      </span>
                    </label>
                  </div>
                )}

                {seqStep.type === 'linkedin' && (
                  <textarea
                    value={seqStep.config.linkedinMessage || ''}
                    onChange={(e) =>
                      updateStep(seqStep.id, {
                        config: {
                          ...seqStep.config,
                          linkedinMessage: e.target.value,
                        },
                      })
                    }
                    placeholder="LinkedIn connection message..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-700/50 text-xs text-surface-200 placeholder-surface-500 focus:outline-none focus:border-brand-500/50 resize-none"
                  />
                )}

                {seqStep.type === 'call' && (
                  <textarea
                    value={seqStep.config.callScript || ''}
                    onChange={(e) =>
                      updateStep(seqStep.id, {
                        config: {
                          ...seqStep.config,
                          callScript: e.target.value,
                        },
                      })
                    }
                    placeholder="Call script / talking points..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-700/50 text-xs text-surface-200 placeholder-surface-500 focus:outline-none focus:border-brand-500/50 resize-none"
                  />
                )}

                {/* Delay */}
                <div className="flex items-center gap-2 mt-2.5">
                  <Clock className="w-3 h-3 text-surface-500" />
                  <span className="text-xs text-surface-400">Wait</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={seqStep.delayDays}
                    onChange={(e) =>
                      updateStep(seqStep.id, {
                        delayDays: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-12 px-2 py-1 rounded bg-surface-800 border border-surface-700/50 text-xs text-surface-200 text-center focus:outline-none focus:border-brand-500/50"
                  />
                  <span className="text-xs text-surface-500">
                    day{seqStep.delayDays !== 1 ? 's' : ''} before next step
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Add step buttons */}
          <div className="flex items-center gap-2 pt-2">
            {STEP_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.type}
                  onClick={() => addStep(t.type)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-700/50 bg-surface-800/30 text-xs hover:bg-surface-800/60 transition-colors',
                    t.color
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  Add {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-4 animate-slide-up">
          <div className="p-4 rounded-xl bg-surface-800/30 border border-surface-700/50 space-y-3">
            <div>
              <span className="text-xs text-surface-500">Campaign Name</span>
              <p className="text-sm text-surface-200 font-medium">{name}</p>
            </div>
            {description && (
              <div>
                <span className="text-xs text-surface-500">Description</span>
                <p className="text-sm text-surface-300">{description}</p>
              </div>
            )}
            {targetAudience && (
              <div>
                <span className="text-xs text-surface-500">Target Audience</span>
                <p className="text-sm text-surface-300">{targetAudience}</p>
              </div>
            )}
            <div>
              <span className="text-xs text-surface-500">Sequence</span>
              <div className="mt-2 space-y-1.5">
                {sequenceSteps.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 text-xs text-surface-300"
                  >
                    <span className="w-5 h-5 rounded-full bg-surface-700 flex items-center justify-center text-[10px]">
                      {i + 1}
                    </span>
                    <span className="capitalize">{s.type}</span>
                    {s.type === 'email' && s.config.subject && (
                      <span className="text-surface-500">
                        — &ldquo;{s.config.subject}&rdquo;
                      </span>
                    )}
                    <ArrowRight className="w-3 h-3 text-surface-600" />
                    <span className="text-surface-500">
                      Wait {s.delayDays}d
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-surface-800">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-surface-400 hover:text-surface-200 transition-colors"
        >
          Cancel
        </button>

        <div className="flex items-center gap-2">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-surface-700/50 text-sm text-surface-300 hover:bg-surface-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}

          {step < totalSteps ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-sm text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="flex items-center gap-1.5 px-6 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-sm text-white font-medium transition-colors"
            >
              <Check className="w-4 h-4" />
              Launch Campaign
            </button>
          )}
        </div>
      </div>
    </div>
  );
}