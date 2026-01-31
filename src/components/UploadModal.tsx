import { useState, useRef, useEffect } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "./Button";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: File[], apiKey: string) => Promise<void>;
  onSaveApiKey?: (apiKey: string) => Promise<void>;
  hasStoredKey: boolean;
  pendingFiles: File[];
  configureKeyOnly?: boolean;
}

export function UploadModal({ isOpen, onClose, onUpload, onSaveApiKey, hasStoredKey, pendingFiles, configureKeyOnly }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeFiles = pendingFiles.length > 0 ? pendingFiles : files;
  const needsApiKey = !hasStoredKey && !apiKey.trim();
  const showFileUpload = pendingFiles.length === 0 && !configureKeyOnly;

  useEffect(() => {
    if (!isOpen) {
      setFiles([]);
      setApiKey("");
      setError(null);
    }
  }, [isOpen]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
    if (droppedFiles.length > 0) {
      setFiles(prev => [...prev, ...droppedFiles]);
    } else {
      setError("Please upload PDF files");
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selectedFiles = Array.from(e.target.files || []).filter(f => f.type === "application/pdf");
    if (selectedFiles.length > 0) {
      setFiles(prev => [...prev, ...selectedFiles]);
    } else if (e.target.files?.length) {
      setError("Please upload PDF files");
    }
  }

  async function handleSubmit() {
    if (configureKeyOnly) {
      if (!apiKey.trim()) {
        setError("Please enter your API key");
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        await onSaveApiKey?.(apiKey.trim());
        setApiKey("");
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save API key");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (needsApiKey) {
      setError("Please enter your API key");
      return;
    }
    if (activeFiles.length === 0) {
      setError("Please select at least one PDF file");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onUpload(activeFiles, apiKey.trim());
      setFiles([]);
      setApiKey("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process PDF");
    } finally {
      setIsLoading(false);
    }
  }

  function handleClose() {
    if (!isLoading) {
      setFiles([]);
      setApiKey("");
      setError(null);
      onClose();
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-[var(--color-overlay)] backdrop-blur-[2px] z-40" />
        <Dialog.Popup className="dialog-popup fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl shadow-2xl p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <Dialog.Title className="text-base font-medium">
              {configureKeyOnly ? "API Key" : pendingFiles.length > 0 ? "Enter API Key" : "Upload Tax Return"}
            </Dialog.Title>
            <Dialog.Close
              disabled={isLoading}
              className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-lg hover:bg-[var(--color-bg-muted)] disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </Dialog.Close>
          </div>

          {/* Pending files indicator */}
          {pendingFiles.length > 0 && (
            <div className="mb-4 text-sm">
              <div className="text-[var(--color-text-muted)]">
                {pendingFiles.length} file{pendingFiles.length > 1 ? "s" : ""} selected
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="truncate">{f.name}</div>
                ))}
              </div>
            </div>
          )}

          {/* API Key input */}
          {(!hasStoredKey || configureKeyOnly) && (
            <div className="mb-4">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1.5">
                Anthropic API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                disabled={isLoading}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                className="w-full px-3 py-2 border border-[var(--color-border)] bg-[var(--color-bg-muted)] rounded-lg text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-text-muted)] disabled:opacity-50"
              />
              <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
                Saved locally to .env file
              </p>
            </div>
          )}

          {/* File upload area */}
          {showFileUpload && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isLoading && fileInputRef.current?.click()}
              className={[
                "border border-dashed rounded-xl p-6 text-center cursor-pointer text-sm transition-colors",
                isDragging
                  ? "border-[var(--color-text-muted)] bg-[var(--color-bg-muted)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]",
                isLoading ? "opacity-50 cursor-not-allowed" : "",
              ].join(" ")}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileSelect}
                disabled={isLoading}
                className="hidden"
              />
              {files.length > 0 ? (
                <div>
                  <div>{files.length} file{files.length > 1 ? "s" : ""} selected</div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-1">
                    {files.map((f, i) => (
                      <div key={i} className="truncate">{f.name}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[var(--color-text-muted)]">
                  Drop PDF files here or click to browse
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-4 text-sm text-[var(--color-negative)]">
              {error}
            </div>
          )}

          {/* Privacy note */}
          {!configureKeyOnly && (
            <div className="mt-4 text-xs text-[var(--color-text-muted)]">
              Your tax return is sent directly to Anthropic's API. Data stored locally.
            </div>
          )}

          {/* Submit button */}
          <Button
            onClick={handleSubmit}
            disabled={isLoading || (configureKeyOnly ? !apiKey.trim() : (needsApiKey || activeFiles.length === 0))}
            className="mt-4 w-full"
          >
            {isLoading
              ? (configureKeyOnly ? "Saving..." : "Processing...")
              : (configureKeyOnly ? "Save API Key" : `Parse ${activeFiles.length > 1 ? `${activeFiles.length} Returns` : "Tax Return"}`)}
          </Button>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
