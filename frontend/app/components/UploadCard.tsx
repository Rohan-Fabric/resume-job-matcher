"use client";

import { useRef, useState } from "react";

interface Props {
  onSubmit: (file: File) => void;
}

export function UploadCard({ onSubmit }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | null | undefined) {
    if (f && f.type === "application/pdf") setFile(f);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_12px_40px_-20px_rgba(11,18,32,0.18)] fade-up">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className="grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors"
        style={{
          borderColor: dragging ? "var(--brand)" : "var(--line-strong)",
          background: dragging ? "var(--brand-wash)" : "transparent",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-wash text-brand-ink text-xl">
          ↑
        </span>
        {file ? (
          <>
            <p className="font-medium text-ink">{file.name}</p>
            <p className="mt-0.5 text-sm text-muted">
              {(file.size / 1024).toFixed(0)} KB · click to replace
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-ink">Drop your resume here</p>
            <p className="mt-0.5 text-sm text-muted">or click to browse · PDF only</p>
          </>
        )}
      </div>

      <button
        disabled={!file}
        onClick={() => file && onSubmit(file)}
        className="mt-5 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        Find my matches
      </button>
      <p className="mt-3 text-center text-xs text-muted">
        We read it, match you to live roles, and tailor your CV per job.
      </p>
    </div>
  );
}
