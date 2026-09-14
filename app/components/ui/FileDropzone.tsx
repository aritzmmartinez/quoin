import { UploadCloud } from "lucide-react";
import { useId, useRef, useState } from "react";

export function FileDropzone({
  accept,
  label,
  hint,
  fileName,
  disabled = false,
  onFile,
}: {
  accept: string;
  label: string;
  hint?: string;
  fileName?: string | null;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const describedBy = useId();
  const [dragging, setDragging] = useState(false);

  function take(file: File | undefined): void {
    if (file && !disabled) onFile(file);
  }

  return (
    <div
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        take(event.dataTransfer.files[0]);
      }}
      onClick={() => input.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          input.current?.click();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-describedby={hint ? describedBy : undefined}
      aria-disabled={disabled || undefined}
      className={`flex flex-col items-center gap-3 rounded-card border-[1.5px] border-dashed bg-surface px-6 py-10 text-center transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:border-accent"
      } ${dragging ? "border-accent bg-surface-2" : "border-border"}`}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-accent/15 text-accent">
        <UploadCloud size={20} strokeWidth={1.5} aria-hidden />
      </span>
      <p className="text-[14px] font-semibold leading-snug">{label}</p>
      {hint && (
        <p
          id={describedBy}
          className="max-w-105 text-[12px] leading-relaxed text-muted text-pretty"
        >
          {hint}
        </p>
      )}
      {fileName && (
        <p className="font-mono text-[12px] text-text">{fileName}</p>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        disabled={disabled}
        className="hidden"
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
