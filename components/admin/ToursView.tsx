'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, Plus } from 'lucide-react';
import { pick } from '@/lib/text';
import { api, type Overview } from './api';
import { PageHeader, Section, Table, Td, ErrorNote } from './ui';

export default function ToursView() {
  const router = useRouter();
  const [tours, setTours] = useState<Overview['tours'] | null>(null);
  const [error, setError] = useState('');
  const [slug, setSlug] = useState('');
  const [langs, setLangs] = useState('th, en, zh');
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Overview>('GET', 'overview').then((d) => setTours(d.tours), (e) => setError(e.message));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const languages = langs.split(/[\s,]+/).filter(Boolean);
      await api('POST', 'tours', { slug: slug.trim().toLowerCase(), languages, from: from || null });
      router.push(`/admin/tours/${slug.trim().toLowerCase()}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="ทัวร์และเทมเพลต" />
      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <Section title="ทัวร์ทั้งหมด">
          <Table head={['ทัวร์', 'ภาษา', 'จุด', 'การเข้าใช้', '']} empty="ยังไม่มีทัวร์">
            {tours?.map((t) => (
              <tr key={t.slug}>
                <Td>
                  <Link href={`/admin/tours/${t.slug}`} className="font-medium hover:underline">
                    {pick(t.title, t.defaultLanguage)}
                  </Link>
                  <div className="text-xs text-muted">/t/{t.slug}</div>
                </Td>
                <Td className="text-muted">{t.defaultLanguage}</Td>
                <Td>{t.stops}</Td>
                <Td className="text-muted">{t.mode === 'code' ? `QR · ${t.sessionMinutes} นาที` : `สาธารณะ · ${t.sessionMinutes} นาที`}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Link href={`/admin/tours/${t.slug}`} className="btn px-2.5 py-1 text-xs">
                      แก้ไข
                    </Link>
                    <a href={`/t/${t.slug}`} target="_blank" rel="noreferrer" className="btn px-2 py-1 text-xs" aria-label="เปิดหน้าทัวร์">
                      <ExternalLink className="size-3.5" strokeWidth={1.75} />
                    </a>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Section>

        <Section title="สร้างทัวร์ใหม่">
          <form onSubmit={create} className="space-y-4 rounded-lg border border-line bg-surface p-5">
            <div>
              <label htmlFor="slug" className="label">
                ชื่อในลิงก์
              </label>
              <input
                id="slug"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                pattern="[a-z0-9][a-z0-9\-]{0,63}"
                placeholder="wat-pho"
                className="field font-mono"
              />
              <p className="mt-1.5 text-xs text-muted">ใช้ a-z, 0-9 และ - ลิงก์จะเป็น /t/{slug || 'wat-pho'}</p>
            </div>
            <div>
              <label htmlFor="from" className="label">
                เริ่มจาก
              </label>
              <select id="from" value={from} onChange={(e) => setFrom(e.target.value)} className="field">
                <option value="">ทัวร์เปล่า</option>
                {tours?.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    คัดลอกจาก {pick(t.title, t.defaultLanguage)}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted">คัดลอกข้อความ การตั้งค่า และรูป แต่ไม่คัดลอกไฟล์เสียง</p>
            </div>
            {!from && (
              <div>
                <label htmlFor="langs" className="label">
                  ภาษา
                </label>
                <input id="langs" value={langs} onChange={(e) => setLangs(e.target.value)} className="field font-mono" />
                <p className="mt-1.5 text-xs text-muted">รหัสภาษาคั่นด้วยจุลภาค ภาษาแรกเป็นภาษาหลัก</p>
              </div>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              <Plus className="size-4" strokeWidth={2} />
              สร้างทัวร์
            </button>
            <ErrorNote>{error}</ErrorNote>
          </form>
        </Section>
      </div>
    </>
  );
}
