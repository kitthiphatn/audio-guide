'use client';

// Small shared pieces for the dashboard.

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <h1 className="font-display text-[clamp(1.9rem,4vw,2.6rem)] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
      {children}
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-12 first:mt-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: React.ReactNode }) {
  const rows = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-left text-sm tabular-nums">
        <thead className="border-b border-line text-[13px] text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-2.5 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {rows === 0 && empty && <div className="px-4 py-10 text-center text-muted">{empty}</div>}
    </div>
  );
}

export const Td = ({ children, className = '' }: { children?: React.ReactNode; className?: string }) => (
  <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>
);

const BADGE = {
  active: 'bg-ok/12 text-ok',
  unused: 'bg-ink/6 text-ink',
  expired: 'bg-ink/6 text-muted',
  revoked: 'bg-danger/12 text-danger',
} as const;
const LABEL = { active: 'กำลังใช้', unused: 'ยังไม่ใช้', expired: 'หมดเวลา', revoked: 'ยกเลิกแล้ว' } as const;

export function StatusBadge({ status }: { status: keyof typeof BADGE }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${BADGE[status]}`}>{LABEL[status]}</span>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-3 text-sm font-medium text-danger">
      {children}
    </p>
  );
}
