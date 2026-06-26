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
    <div className="rounded-3xl border border-line bg-surface p-7 card-lift fade-up">
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
        className="group/zone grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all"
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
        <span
          className="mb-3.5 grid h-14 w-14 place-items-center rounded-2xl shadow-[0_8px_20px_-8px_var(--brand-glow)] transition-transform group-hover/zone:-translate-y-0.5"
          style={{ backgroundImage: "linear-gradient(135deg, #6b3bd1, var(--brand-ink))" }}
        >
          <svg viewBox="0 0 30 46" className="h-7 w-auto" fill="#ffffff" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M15.225 1.32715C13.6063 1.32715 11.9875 1.76946 10.8062 2.87523C9.625 4.02523 9.14375 5.5733 9.14375 7.25407V8.13869H13.125V7.25407C13.125 6.281 13.3875 5.88292 13.6062 5.66176C13.825 5.44061 14.2625 5.21946 15.225 5.21946H25.6812V7.16561C25.6812 7.51946 25.6375 8.93484 25.5938 9.06753C25.55 9.20023 25.5063 9.24446 25.5063 9.24446C25.5063 9.24446 25.4625 9.28869 25.3313 9.33292C25.2 9.37715 24.0625 9.42138 23.7125 9.42138H13.125H9.14375H5.775C4.1125 9.42138 2.5375 9.86369 1.4 11.0137C0.30625 12.1637 0 13.6675 0 15.0829V22.5579H7.9625V18.6656H3.98125V15.0829C3.98125 14.1541 4.2 13.8002 4.33125 13.6675C4.41875 13.5791 4.76875 13.3137 5.775 13.3137H9.14375H13.125H24.5875C25.9437 13.3137 27.3 13.0041 28.3062 11.9868C29.3125 10.9695 29.6625 9.64253 29.6625 8.35984V1.32715H15.225ZM13.125 14.5521H9.14375V17.8695V23.531V25.6541H13.125V23.531V17.8695V14.5521ZM14.35 18.6656V22.5579H20.7375V25.3887C20.7375 26.406 20.475 26.6714 20.4312 26.6714C20.3437 26.7598 19.9938 26.9368 19.1625 26.9368H13.125H9.14375H6.34375C4.50625 26.9368 2.8875 27.4233 1.70625 28.4848C0.481251 29.5906 0 31.0502 0 32.5541V44.1425H5.775C7.91875 44.1425 9.84375 43.656 11.2 42.4175C12.6 41.1348 13.125 39.4098 13.125 37.6406V32.0675H9.14375V37.5964C9.14375 38.6579 8.8375 39.1887 8.4875 39.4983C8.09375 39.8521 7.35 40.206 5.73125 40.206H3.9375V32.5098C3.9375 31.8906 4.15625 31.4925 4.375 31.2714C4.6375 31.0502 5.20625 30.7406 6.3 30.7406H8.88125H13.475H19.0312C20.2563 30.7406 21.7438 30.5195 22.925 29.5464C24.15 28.5291 24.6313 26.981 24.6313 25.3002V18.6656H14.35Z"
            />
          </svg>
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
        className="btn-primary mt-5 w-full rounded-xl py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        Find my matches
      </button>
      <p className="mt-3 text-center text-xs text-muted">
        We read it, match you to live roles, and tailor your CV per job.
      </p>
    </div>
  );
}
