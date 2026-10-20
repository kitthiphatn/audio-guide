'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, QrCode } from 'lucide-react';
import { pick } from '@/lib/text';
import { api, fmtLeft, fmtWhen, type Overview, type PassRow } from './api';
import { PageHeader, Section, Table, Td, StatusBadge, ErrorNote } from './ui';

interface Printed {
  code: string;
  slug: string;
  minutes: number;
  note: string;
  svg: string;
}

export default function PassesView({ initialSlug }: { initialSlug: string }) {
  const [tours, setTours] = useState<Overview['tours']>([]);
  const [slug, setSlug] = useState(initialSlug);
  const [passes, setPasses] = useState<PassRow[]>([]);
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ minutes: '', devices: '1', count: '1', note: '' });
  const [printed, setPrinted] = useState<Printed[]>([]);
  const [busy, setBusy] = useState(false);

  const codeTours = tours.filter((t) => t.mode === 'code');
  const tour = codeTours.find((t) => t.slug === slug);

  useEffect(() => {
    api<Overview>('GET', 'overview').then((d) => {
      setTours(d.tours);
      const first = d.tours.find((t) => t.mode === 'code');
      setSlug((s) => (d.tours.some((t) => t.slug === s && t.mode === 'code') ? s : first?.slug || ''));
    }, (e) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    if (!slug) return;
    api<{ now: number; passes: PassRow[] }>('GET', `passes?slug=${encodeURIComponent(slug)}`).then(
      (d) => {
        setPasses(d.passes);
        setNow(d.now);
      },
      (e) => setError(e.message),
    );
  }, [slug]);
  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const issue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tour) return;
    setBusy(true);
    setError('');
    try {
      const res = await api<{ passes: PassRow[] }>('POST', 'passes', {
        slug,
        minutes: Number(form.minutes) || tour.sessionMinutes,
        devices: Number(form.devices) || 1,
        count: Number(form.count) || 1,
        note: form.note,
      });
      const cards = await Promise.all(
        res.passes.map(async (p) => ({
          code: p.code,
          slug: p.slug,
          minutes: p.minutes,
          note: p.note,
          svg: await QRCode.toString(`${location.origin}/t/${p.slug}?code=${p.code}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
        })),
      );
      setPrinted(cards);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reprint = async (p: PassRow) => {
    const svg = await QRCode.toString(`${location.origin}/t/${p.slug}?code=${p.code}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    setPrinted([{ code: p.code, slug: p.slug, minutes: p.minutes, note: p.note, svg }]);
  };

  const act = (p: Promise<unknown>) => p.then(load, (e) => setError(e.message));
  const title = tour ? pick(tour.title, tour.defaultLanguage) : '';
  const counts = passes.reduce<Record<string, number>>((n, p) => ((n[p.status] = (n[p.status] || 0) + 1), n), {});

  return (
    <>
      <div className="no-print">
        <PageHeader title="บัตรเข้าใช้ (QR)">
          <select aria-label="เลือกทัวร์" value={slug} onChange={(e) => setSlug(e.target.value)} className="field w-auto min-w-56">
            {codeTours.length === 0 && <option value="">ยังไม่มีทัวร์แบบใช้ QR</option>}
            {codeTours.map((t) => (
              <option key={t.slug} value={t.slug}>
                {pick(t.title, t.defaultLanguage)}
              </option>
            ))}
          </select>
        </PageHeader>
        <p className="-mt-4 mb-8 max-w-[70ch] text-muted">
          ทุก QR เป็นรหัสใหม่ เวลาเริ่มนับเมื่อสแกนครั้งแรก หมดเวลาแล้วใช้ต่อไม่ได้จนกว่าเจ้าหน้าที่จะต่อเวลาให้ และกดตัดสิทธิ์ได้ทุกเมื่อ
        </p>
        <ErrorNote>{error}</ErrorNote>

        {tour && (
          <form onSubmit={issue} className="flex flex-wrap items-end gap-4 rounded-lg border border-line bg-surface p-5">
            <div>
              <label htmlFor="minutes" className="label">
                ใช้ได้ (นาที)
              </label>
              <input
                id="minutes"
                type="number"
                min={1}
                max={10080}
                placeholder={String(tour.sessionMinutes)}
                value={form.minutes}
                onChange={(e) => setForm({ ...form, minutes: e.target.value })}
                className="field w-28 tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="devices" className="label">
                จำนวนเครื่องต่อรหัส
              </label>
              <input
                id="devices"
                type="number"
                min={1}
                max={20}
                value={form.devices}
                onChange={(e) => setForm({ ...form, devices: e.target.value })}
                className="field w-28 tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="count" className="label">
                จำนวนบัตร
              </label>
              <input
                id="count"
                type="number"
                min={1}
                max={200}
                value={form.count}
                onChange={(e) => setForm({ ...form, count: e.target.value })}
                className="field w-24 tabular-nums"
              />
            </div>
            <div className="min-w-48 flex-1">
              <label htmlFor="note" className="label">
                หมายเหตุ (เช่น โต๊ะ / ชื่อกรุ๊ป)
              </label>
              <input id="note" maxLength={80} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="field" />
            </div>
            <button type="submit" disabled={busy} className="btn-primary">
              <QrCode className="size-4" strokeWidth={2} />
              ออก QR
            </button>
          </form>
        )}
      </div>

      {printed.length > 0 && (
        <section className="mt-10">
          <div className="no-print mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">พร้อมพิมพ์ ({printed.length} ใบ)</h2>
            <div className="flex gap-2">
              <button className="btn" onClick={() => setPrinted([])}>
                ปิด
              </button>
              <button className="btn-primary" onClick={() => window.print()}>
                <Printer className="size-4" />
                พิมพ์
              </button>
            </div>
          </div>
          <div className="print-sheet grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {printed.map((p) => (
              <article key={p.code} className="break-inside-avoid rounded-lg border border-line bg-white p-4 text-center text-[#141413]">
                <div className="mx-auto w-full max-w-44 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: p.svg }} />
                <p className="mt-2 font-mono text-lg font-semibold tracking-[0.18em]">{p.code}</p>
                <p className="mt-1 text-sm font-medium">{title || p.slug}</p>
                <p className="text-xs text-[#5e5d59]">
                  ใช้ได้ {p.minutes} นาที นับจากสแกนครั้งแรก
                  {p.note ? ` · ${p.note}` : ''}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="no-print mt-12">
        <Section
          title="รหัสทั้งหมด"
          aside={
            <p className="text-sm text-muted tabular-nums">
              กำลังใช้ {counts.active || 0} · ยังไม่ใช้ {counts.unused || 0} · หมดเวลา {counts.expired || 0} · ยกเลิก {counts.revoked || 0}
            </p>
          }
        >
          <Table head={['รหัส', 'สถานะ', 'หมายเหตุ', 'สแกนครั้งแรก', 'เหลือเวลา', 'เครื่อง', '']} empty="ยังไม่ได้ออก QR สำหรับทัวร์นี้">
            {passes.map((p) => (
              <tr key={p.code}>
                <Td>
                  <code className="font-mono font-semibold tracking-wider">{p.code}</code>
                </Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                <Td className="text-muted">{p.note}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtWhen(p.firstUsedAt)}</Td>
                <Td className="whitespace-nowrap">
                  {p.status === 'active' && p.expiresAt ? fmtLeft(p.expiresAt - now) : p.status === 'unused' ? `${p.minutes} นาที` : '–'}
                </Td>
                <Td>
                  {p.sids.length}/{p.devices}
                </Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    {p.status !== 'revoked' && (
                      <>
                        <button className="btn px-2.5 py-1 text-xs" onClick={() => act(api('POST', `passes/${p.code}/extend`, { minutes: 15 }))}>
                          +15
                        </button>
                        <button className="btn px-2.5 py-1 text-xs" onClick={() => act(api('POST', `passes/${p.code}/extend`, { minutes: 60 }))}>
                          +60
                        </button>
                      </>
                    )}
                    {p.status === 'unused' && (
                      <button className="btn px-2.5 py-1 text-xs" onClick={() => reprint(p)}>
                        พิมพ์ซ้ำ
                      </button>
                    )}
                    {p.status !== 'revoked' && (
                      <button
                        className="btn-danger px-2.5 py-1 text-xs"
                        onClick={() => confirm(`ตัดสิทธิ์รหัส ${p.code}?`) && act(api('POST', `passes/${p.code}/revoke`, {}))}
                      >
                        ตัดสิทธิ์
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      </div>
    </>
  );
}
