'use client';

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface CSVUploadProps {
  onUploadComplete: (result: { imported: number; skipped: number; errors: string[] }) => void;
}

export function CSVUpload({ onUploadComplete }: CSVUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (selectedFile: File) => {
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Only CSV files are supported');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setUploading(true);

      try {
        const res = await api.uploadLeadsCSV(selectedFile);
        setResult(res);
        onUploadComplete(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) handleFile(selected);
    },
    [handleFile]
  );

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'relative border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer',
          dragOver
            ? 'border-brand-400 bg-brand-500/5'
            : 'border-surface-700/50 bg-surface-800/20 hover:border-surface-600/50 hover:bg-surface-800/40',
          uploading && 'pointer-events-none opacity-70'
        )}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleChange}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
            <div>
              <p className="text-sm text-surface-300 font-medium">
                Processing {file?.name}...
              </p>
              <p className="text-xs text-surface-500 mt-1">
                Importing leads from CSV
              </p>
            </div>
          </div>
        ) : result ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-accent-green/10 flex items-center justify-center">
              <Check className="w-6 h-6 text-accent-green" />
            </div>
            <div>
              <p className="text-sm text-surface-200 font-medium">
                Import complete
              </p>
              <p className="text-xs text-surface-400 mt-1">
                {result.imported} imported, {result.skipped} skipped
              </p>
              {result.errors.length > 0 && (
                <details className="mt-2 text-left">
                  <summary className="text-[11px] text-accent-amber cursor-pointer">
                    {result.errors.length} warning
                    {result.errors.length > 1 ? 's' : ''}
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-[10px] text-surface-500">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                reset();
              }}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              Upload another file
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                dragOver ? 'bg-brand-500/20' : 'bg-surface-700/50'
              )}
            >
              {dragOver ? (
                <Upload className="w-6 h-6 text-brand-400" />
              ) : (
                <FileSpreadsheet className="w-6 h-6 text-surface-400" />
              )}
            </div>
            <div>
              <p className="text-sm text-surface-200 font-medium">
                Drop your CSV file here
              </p>
              <p className="text-xs text-surface-500 mt-1">
                or click to browse — CSV with Name, Email, Company columns
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-surface-600 mt-1">
              <span>Expected columns:</span>
              <code className="px-1.5 py-0.5 rounded bg-surface-700/50 text-surface-400">
                firstName
              </code>
              <code className="px-1.5 py-0.5 rounded bg-surface-700/50 text-surface-400">
                lastName
              </code>
              <code className="px-1.5 py-0.5 rounded bg-surface-700/50 text-surface-400">
                email
              </code>
              <code className="px-1.5 py-0.5 rounded bg-surface-700/50 text-surface-400">
                company
              </code>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-accent-red/10 border border-accent-red/20 text-sm text-accent-red">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}