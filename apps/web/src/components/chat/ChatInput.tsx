'use client';

import { useState, useRef, useCallback } from 'react';
import { Send, Paperclip, X, Sparkles, Loader2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string, attachments: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = 'Ask the SDR agent to research, draft, or analyze...',
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed && files.length === 0) return;
    if (disabled) return;

    onSend(trimmed || 'Analyze attached files', files);
    setValue('');
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-surface-800 bg-surface-950/80 backdrop-blur-sm">
      {/* File previews */}
      {files.length > 0 && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 flex-wrap">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-800 border border-surface-700 text-xs"
            >
              <FileText className="w-3 h-3 text-brand-400" />
              <span className="text-surface-300 max-w-[120px] truncate">
                {file.name}
              </span>
              <button
                onClick={() => removeFile(i)}
                className="text-surface-500 hover:text-surface-300 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div
        className={cn(
          'flex items-end gap-2 px-4 py-3',
          isFocused && 'bg-surface-900/50'
        )}
      >
        {/* File upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-shrink-0 p-2 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors"
          title="Attach files"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.pdf,.docx,.txt,.json,.md"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className={cn(
            'flex-1 bg-transparent resize-none text-sm text-surface-100 placeholder-surface-500',
            'outline-none py-2 min-h-[40px] max-h-[160px]',
            'scrollbar-thin scrollbar-thumb-surface-700'
          )}
        />

        {/* Send / AI button */}
        <button
          onClick={handleSend}
          disabled={disabled || (!value.trim() && files.length === 0)}
          className={cn(
            'flex-shrink-0 p-2 rounded-lg transition-all',
            value.trim() || files.length > 0
              ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-500/25'
              : 'bg-surface-800 text-surface-500 cursor-not-allowed'
          )}
          title="Send message"
        >
          {disabled ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Suggestion chips */}
      <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
        {[
          'Research this company',
          'Draft a cold email',
          'Find leads in SaaS',
          'Analyze my pipeline',
          'Start a new campaign',
        ].map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => {
              setValue(suggestion);
              textareaRef.current?.focus();
              adjustHeight();
            }}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full border border-surface-700/50 bg-surface-800/30 text-xs text-surface-400 hover:text-surface-200 hover:border-surface-600 transition-colors"
          >
            <Sparkles className="w-3 h-3 text-brand-400" />
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}