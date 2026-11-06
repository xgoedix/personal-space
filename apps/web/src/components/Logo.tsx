import { cn } from "../lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-7 w-7", className)} aria-hidden>
      <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="32" cy="32" rx="13" ry="29" transform="rotate(45 32 32)" fill="none" stroke="currentColor" strokeWidth="1.5"/><ellipse cx="32" cy="32" rx="13" ry="29" transform="rotate(-45 32 32)" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="32" cy="32" r="3" fill="currentColor" />
    </svg>
  );
}
