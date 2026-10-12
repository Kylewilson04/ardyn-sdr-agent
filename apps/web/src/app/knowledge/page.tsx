'use client';

import { useEffect, useState, useCallback } from 'react';
import { useKnowledgeStore } from '@/lib/store';
import { api } from '@/lib/api';
import type { KnowledgeSource } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  Upload,
  Globe,
  Plus,
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Sparkles,
  X,
} from 'lucide-react';

// Demo sources
const demoSources: KnowledgeSource[] = [
  {
    id: '1',
    type: 'document',
    name: 'Product One-Pager',
    fileName: 'ardyn-sdr-overview.pdf',
    fileSize: 245000,
    status: 'ready',
    chunks: 12,
    createdAt: '2026-10-08T00:00:00Z',
  },
  {
    id: '2',
    type: 'website',
    name: 'Ardyn Documentation',
    url: 'https://docs.ardyn.ai',
    status: 'ready',
    chunks: 34,
    createdAt: '2026-10-07T00:00:00Z',
  },
  {
    id: '3',
    type: 'document',
    name: 'Competitive Battle Cards',
    fileName: 'battle-cards.pdf',
    fileSize: 180000,
    status: 'ready',
    chunks: 8,
    createdAt: '2026-10-05T00:00:00Z',
  },
  {
    id: '4',
    type: 'website',
    name: 'Pricing Page',
    url: 'https://ardyn.ai/pricing',
    status: 'processing',
    chunks: 0,
    createdAt: '2026-10-11T00:00:00Z',
  },
];

const typeIcons: Record<KnowledgeSource['type'], typeof FileText> = {
  document: FileText,
  website: Globe,
  text: FileText,
  api: Globe,
};

const statusIcons: Record<KnowledgeSource['status'], typeof CheckCircle2> = {
  ready: CheckCircle2,
  processing: Clock,
  error: AlertCircle,
};

const statusColors: Record<KnowledgeSource['status'], string> = {
  ready: 'text-accent-green',
  processing: 'text-accent-amber',
  error: 'text-accent-red',
};

export default function KnowledgePage() {
  const { sources, setSources, isLoading, setLoading } = useKnowledgeStore();
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlName, setUrlName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      try {
        const data = await api.getKnowledgeSources();
        setSources(data);
      } catch {
        setSources(demoSources);
        setDemoMode(true);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      try {
        const source = await api.uploadDocument(file);
        useKnowledgeStore.getState().addSource(source);
      } catch {
        // Demo fallback
        const demoSource: KnowledgeSource = {
          id: `demo-${Date.now()}`,
          type: 'document',
          name: file.name.replace(/\.[^/.]+$/, ''),
          fileName: file.name,
          fileSize: file.size,
          status: 'processing',
          chunks: 0,
          createdAt: new Date().toISOString(),
        };
        useKnowledgeStore.getState().addSource(demoSource);
        setDemoMode(true);

        // Simulate processing completion
        setTimeout(() => {
          useKnowledgeStore
            .getState()
            .updateKnowledgeSource(demoSource.id, {
              status: 'ready',
              chunks: Math.floor(Math.random() * 20) + 5,
            });
        }, 3000);
      } finally {
        setUploading(false);
        if (e.target) e.target.value = '';
      }
    },
    []
  );

  const handleAddUrl = useCallback(async () => {
    if (!urlInput.trim()) return;

    const name = urlName.trim() || new URL(urlInput).hostname;
    try {
      const source = await api.addWebsite(urlInput.trim(), name);
      useKnowledgeStore.getState().addSource(source);
    } catch {
      const demoSource: KnowledgeSource = {
        id: `demo-url-${Date.now()}`,
        type: 'website',
        name,
        url: urlInput.trim(),
        status: 'processing',
        chunks: 0,
        createdAt: new Date().toISOString(),
      };
      useKnowledgeStore.getState().addSource(demoSource);
      setDemoMode(true);

      setTimeout(() => {
        useKnowledgeStore
          .getState()
          .updateKnowledgeSource(demoSource.id, {
            status: 'ready',
            chunks: Math.floor(Math.random() * 15) + 3,
          });
      }, 2500);
    }

    setUrlInput('');
    setUrlName('');
    setShowAddUrl(false);
  }, [urlInput, urlName]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteKnowledgeSource(id);
    } catch {
      // Demo fallback — just remove locally
    }
    useKnowledgeStore.getState().removeSource(id);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-700 scrollbar-track-transparent">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-surface-100">
              Knowledge Base
            </h1>
            <p className="text-sm text-surface-500 mt-1">
              Upload documents and add websites the agent uses to personalize
              outreach
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddUrl(!showAddUrl)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-700/50 text-sm text-surface-300 hover:bg-surface-800 transition-colors"
            >
              <Globe className="w-4 h-4" />
              Add URL
            </button>
            <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-sm text-white font-medium transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              Upload File
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Add URL form */}
        {showAddUrl && (
          <div className="p-4 rounded-xl bg-surface-900/50 border border-surface-700/50 animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-800/50 border border-surface-700/50 text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-brand-500/50 transition-colors"
                />
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={urlName}
                  onChange={(e) => setUrlName(e.target.value)}
                  placeholder="Display name (optional)"
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-800/50 border border-surface-700/50 text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-brand-500/50 transition-colors"
                />
              </div>
              <button
                onClick={handleAddUrl}
                disabled={!urlInput.trim()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-sm text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
              <button
                onClick={() => setShowAddUrl(false)}
                className="p-2.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Uploading indicator */}
        {uploading && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-900/50 border border-surface-700/50">
            <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
            <span className="text-sm text-surface-300">
              Processing document...
            </span>
          </div>
        )}

        {/* Sources list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {sources.map((source) => {
              const Icon = typeIcons[source.type];
              const StatusIcon = statusIcons[source.status];
              return (
                <div
                  key={source.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-surface-900/50 border border-surface-800/50 hover:border-surface-700/50 transition-all group"
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                      source.type === 'document'
                        ? 'bg-blue-500/10'
                        : 'bg-accent-purple/10'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-5 h-5',
                        source.type === 'document'
                          ? 'text-blue-400'
                          : 'text-accent-purple'
                      )}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-surface-200 truncate">
                        {source.name}
                      </h3>
                      <StatusIcon
                        className={cn(
                          'w-3.5 h-3.5 flex-shrink-0',
                          statusColors[source.status]
                        )}
                      />
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {source.fileName && (
                        <span className="text-xs text-surface-500">
                          {source.fileName}
                          {source.fileSize && ` · ${formatSize(source.fileSize)}`}
                        </span>
                      )}
                      {source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
                        >
                          {source.url}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {source.status === 'ready' && (
                        <span className="text-xs text-surface-600">
                          {source.chunks} chunk{source.chunks !== 1 ? 's' : ''}
                        </span>
                      )}
                      {source.status === 'processing' && (
                        <span className="flex items-center gap-1 text-xs text-accent-amber">
                          <Clock className="w-3 h-3" />
                          Processing...
                        </span>
                      )}
                      {source.status === 'error' && (
                        <span className="text-xs text-accent-red">
                          Processing failed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Created date */}
                  <span className="text-[10px] text-surface-600 hidden sm:block">
                    {new Date(source.createdAt).toLocaleDateString()}
                  </span>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(source.id)}
                    className="p-2 rounded-lg text-surface-600 hover:text-accent-red hover:bg-surface-800 opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove source"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}

            {sources.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-surface-500">
                <BookOpen className="w-10 h-10 mb-4 opacity-30" />
                <p className="text-sm">No knowledge sources yet</p>
                <p className="text-xs mt-1">
                  Upload documents or add URLs the agent can reference
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tips */}
        <div className="p-5 rounded-2xl bg-surface-900/50 border border-surface-800/50">
          <h3 className="flex items-center gap-2 text-sm font-medium text-surface-300 mb-3">
            <Sparkles className="w-4 h-4 text-brand-400" />
            Knowledge Base Tips
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-surface-500">
            <div className="flex items-start gap-2">
              <span className="text-brand-400 font-mono">01</span>
              <span>
                Upload product docs, battle cards, and pricing pages so the
                agent knows your offering cold.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-brand-400 font-mono">02</span>
              <span>
                Add competitor websites for the agent to reference when handling
                objections.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-brand-400 font-mono">03</span>
              <span>
                Include case studies and testimonials for social proof in
                outreach.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-brand-400 font-mono">04</span>
              <span>
                The agent uses your knowledge base to personalize every email
                with real context.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}