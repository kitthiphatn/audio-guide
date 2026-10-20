'use client';

import { Children, cloneElement, isValidElement } from 'react';

// Small shared pieces for the dashboard.

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-[clamp(2rem,5vw,2.75rem)] leading-[1.05] font-bold tracking-[-0.045em]">{title}</h1>
      {children}
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-12 first:mt-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[22px] font-bold tracking-[-0.03em]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// A table on wide screens; on phones each row becomes its own card with labelled fields,
// so nothing needs sideways scrolling. Labels come from `head`, matched by column.
export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: React.ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement) as React.ReactElement<{ children?: React.ReactNode }>[];
  return (
    <div className="rtable md:card md:overflow-x-auto">
      <table className="w-full text-left text-sm tabular-nums">
        <thead className="border-b border-line text-[13px] text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-5 py-3 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="md:divide-y md:divide-line">
          {rows.map((row) =>
            cloneElement(
              row,
              undefined,
              Children.toArray(row.props.children)
                .filter(isValidElement)
                .map((cell, i) => cloneElement(cell as React.ReactElement<{ label?: string }>, { label: typeof head[i] === 'string' ? (head[i] as string) : '' })),
            ),
          )}
        </tbody>
      </table>
      {rows.length === 0 && empty && <div className="card px-5 py-12 text-center text-muted md:rounded-none md:shadow-none">{empty}</div>}
    </div>
  );
}

export const Td = ({ children, className = '', label = '' }: { children?: React.ReactNode; className?: string; label?: string }) => (
  <td data-label={label} className={`px-5 py-3.5 align-middle ${className}`}>
    {children}
  </td>
);

export function Stat({ label, value, live = false }: { label: string; value: React.ReactNode; live?: boolean }) {
  return (
    <div className="card px-5 py-4">
      <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
        {live && (
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-ok" />
          </span>
        )}
        {label}
      </p>
      <p className="mt-1 text-[34px] leading-none font-bold tracking-[-0.04em] tabular-nums">{value}</p>
    </div>
  );
}

const BADGE = {
  active: 'bg-ok/12 text-ok before:bg-ok',
  unused: 'bg-accent/10 text-accent before:bg-accent',
  expired: 'bg-ink/[0.06] text-muted before:bg-muted',
  revoked: 'bg-danger/10 text-danger before:bg-danger',
} as const;
const LABEL = { active: 'กำลังใช้', unused: 'ยังไม่ใช้', expired: 'หมดเวลา', revoked: 'ยกเลิกแล้ว' } as const;

export function StatusBadge({ status }: { status: keyof typeof BADGE }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap before:size-1.5 before:rounded-full ${BADGE[status]}`}>{LABEL[status]}</span>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-3 text-sm font-medium text-danger">
      {children}
    </p>
  );
}
