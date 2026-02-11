import { useEffect, useRef, useState } from "react";

import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: File[]) => Promise<void>;
  hasApiKey: boolean;
  pendingFiles: File[];
}

export function UploadModal({ isOpen, onClose, onUpload, hasApiKey, pendingFiles }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeFiles = pendingFiles.length > 0 ? pendingFiles : files;
  const showFileUpload = pendingFiles.length === 0;

  useEffect(() => {
    if (!isOpen) {
      setFiles([]);
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

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf",
    );
    if (droppedFiles.length > 0) {
      setFiles((prev) => [...prev, ...droppedFiles]);
    } else {
      setError("Please upload PDF files");
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selectedFiles = Array.from(e.target.files || []).filter(
      (f) => f.type === "application/pdf",
    );
    if (selectedFiles.length > 0) {
      setFiles((prev) => [...prev, ...selectedFiles]);
    } else if (e.target.files?.length) {
      setError("Please upload PDF files");
    }
  }

  async function handleSubmit() {
    if (!hasApiKey) {
      setError("Add GEMINI_API_KEY to your .env file and restart the server");
      return;
    }
    if (activeFiles.length === 0) {
      setError("Please select at least one PDF file");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onUpload(activeFiles);
      setFiles([]);
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
      setError(null);
      onClose();
    }
  }

  const title = "Upload Tax Return";

  return (
    <Dialog open={isOpen} onClose={handleClose} title={title} closeDisabled={isLoading}>
      {/* Pending files indicator */}
      {pendingFiles.length > 0 && (
        <div className="mb-4 text-sm">
          <div className="text-(--color-text-muted)">
            {pendingFiles.length} file
            {pendingFiles.length > 1 ? "s" : ""} selected
          </div>
          <div className="mt-1 text-xs text-(--color-text-muted)">
            {pendingFiles.map((f, i) => (
              <div key={i} className="truncate">
                {f.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API key required notice */}
      {!hasApiKey && (
        <div className="mb-4 rounded-lg border border-(--color-border) bg-(--color-bg-muted) px-4 py-3 text-sm">
          <p className="font-medium">Gemini API key required</p>
          <p className="mt-1 text-(--color-text-muted)">
            Add <code className="rounded bg-black/10 px-1 py-0.5">GEMINI_API_KEY=your-key</code> to
            a <code className="rounded bg-black/10 px-1 py-0.5">.env</code> file in the project
            root, then restart the server.
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
            "cursor-pointer rounded-xl border border-dashed p-6 text-center text-sm transition-colors",
            isDragging
              ? "border-(--color-text-muted) bg-(--color-bg-muted)"
              : "border-(--color-border) hover:border-(--color-text-muted)",
            isLoading ? "cursor-not-allowed opacity-50" : "",
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
              <div>
                {files.length} file
                {files.length > 1 ? "s" : ""} selected
              </div>
              <div className="mt-1 text-xs text-(--color-text-muted)">
                {files.map((f, i) => (
                  <div key={i} className="truncate">
                    {f.name}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-(--color-text-muted)">Drop PDF files here or click to browse</div>
          )}
        </div>
      )}

      {/* Error message */}
      {error && <div className="mt-4 text-sm text-(--color-negative)">{error}</div>}

      {/* Privacy note */}
      <div className="mt-4 text-xs text-(--color-text-muted)">
        Your tax return is sent directly to Google's Gemini API. Data stored locally.
      </div>

      {/* Submit button */}
      <Button
        onClick={handleSubmit}
        disabled={isLoading || !hasApiKey || activeFiles.length === 0}
        className="mt-4 w-full"
      >
        {isLoading
          ? "Processing..."
          : `Parse ${activeFiles.length > 1 ? `${activeFiles.length} returns` : "tax return"}`}
      </Button>
    </Dialog>
  );
}
