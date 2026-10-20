'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { pick } from '@/lib/text';
import { api, fmtLeft, fmtWhen, type Overview } from './api';
import { PageHeader, Section, Table, Td, ErrorNote } from './ui';

export default function OverviewView() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api<Overview>('GET', 'overview').then(setData, (e) => setError(e.message)), []);
  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const act = (p: Promise<unknown>) => p.then(load, (e) => setError(e.message));
  const listening = data?.tours.reduce((n, t) => n + t.stats.activeSessions, 0) ?? 0;

  return (
    <>
      <PageHeader title="ภาพรวม">
        <p className="text-muted">
          ตอนนี้มีคนฟังอยู่ <strong className="text-ink tabular-nums">{listening}</strong> คน · อัปเดตทุก 10 วินาที
        </p>
      </PageHeader>
      <ErrorNote>{error}</ErrorNote>
      {data?.loadErrors.length ? (
        <p className="mb-6 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">ทัวร์ที่โหลดไม่ได้: {data.loadErrors.join(' · ')}</p>
      ) : null}

      <Section title="ทัวร์">
        <Table
          head={['ทัวร์', 'การเข้าใช้', 'กำลังฟัง', 'session ทั้งหมด', 'ครั้งที่เล่น', 'QR ยังไม่ใช้', '']}
          empty={
            <>
              ยังไม่มีทัวร์ ·{' '}
              <Link href="/admin/tours" className="font-medium text-ink underline">
                สร้างทัวร์แรก
              </Link>
            </>
          }
        >
          {data?.tours.map((t) => (
            <tr key={t.slug}>
              <Td>
                <Link href={`/admin/tours/${t.slug}`} className="font-medium hover:underline">
                  {pick(t.title, t.defaultLanguage)}
                </Link>
                <div className="text-xs text-muted">/t/{t.slug}</div>
              </Td>
              <Td className="text-muted">{t.mode === 'code' ? 'ใช้ QR' : 'สาธารณะ'}</Td>
              <Td className={t.stats.activeSessions ? 'font-semibold' : 'text-muted'}>{t.stats.activeSessions}</Td>
              <Td>{t.stats.sessions}</Td>
              <Td>{t.stats.plays}</Td>
              <Td>{t.mode === 'code' ? t.stats.unusedPasses : '–'}</Td>
              <Td className="text-right">
                {t.mode === 'code' && (
                  <Link href={`/admin/passes?slug=${t.slug}`} className="btn px-2.5 py-1 text-xs">
                    ออก QR
                  </Link>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title={`กำลังใช้งาน${data ? ` (${data.sessions.length})` : ''}`}>
        <Table head={['ทัวร์', 'รหัส', 'หมายเหตุ', 'เริ่ม', 'เหลือเวลา', 'เล่น', '']} empty="ยังไม่มีใครใช้งานตอนนี้">
          {data?.sessions.map((s) => {
            const left = s.expiresAt - data.now;
            return (
              <tr key={s.sid}>
                <Td>{s.slug}</Td>
                <Td>{s.code ? <code className="font-mono">{s.code}</code> : <span className="text-muted">สาธารณะ</span>}</Td>
                <Td className="text-muted">{s.note}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtWhen(s.createdAt)}</Td>
                <Td className={`whitespace-nowrap ${left < 10 * 60_000 ? 'font-semibold text-danger' : ''}`}>{fmtLeft(left)}</Td>
                <Td>{s.plays}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    {s.code && (
                      <button className="btn px-2.5 py-1 text-xs" onClick={() => act(api('POST', `passes/${s.code}/extend`, { minutes: 30 }))}>
                        +30 นาที
                      </button>
                    )}
                    <button
                      className="btn-danger px-2.5 py-1 text-xs"
                      onClick={() => confirm('ตัดสิทธิ์ทันที?') && act(s.code ? api('POST', `passes/${s.code}/revoke`, {}) : api('POST', `sessions/${s.sid}/end`, {}))}
                    >
                      ตัดสิทธิ์
                    </button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </>
  );
}
