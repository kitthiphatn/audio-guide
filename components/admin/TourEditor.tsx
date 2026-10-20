'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Plus, Trash2, Upload, Volume2 } from 'lucide-react';
import { pick } from '@/lib/text';
import { api } from './api';
import { PageHeader, Section, ErrorNote } from './ui';

// The editor works on the raw tour.json object, so fields it does not know about
// survive a save. The server validates every save with the same rules as loading.

type Text = Record<string, string>;
interface RawStop {
  id: string;
  title?: Text;
  description?: Text;
  transcript?: Text;
  lat?: number | null;
  lng?: number | null;
  audio?: Record<string, string>;
  [k: string]: unknown;
}
interface RawTour {
  title?: Text;
  subtitle?: Text;
  defaultLanguage?: string;
  languages: Record<string, { label?: string }>;
  access?: { mode?: 'open' | 'code'; sessionMinutes?: number; expiredRedirect?: string; maxTracksPerMinute?: number };
  listed?: boolean;
  theme?: { accent?: string };
  heroImages?: string[];
  stops: RawStop[];
  [k: string]: unknown;
}
interface Media {
  path: string;
  size: number;
}

const asText = (t: unknown): Text => (typeof t === 'string' ? { _: t } : t && typeof t === 'object' ? (t as Text) : {});
const fileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file';
const ext = (name: string) => (name.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
const kb = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.ceil(n / 1000)} KB`);

export default function TourEditor({ slug }: { slug: string }) {
  const [raw, setRaw] = useState<RawTour | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [json, setJson] = useState('');
  const [newLang, setNewLang] = useState('');

  const load = useCallback(
    () =>
      api<{ raw: RawTour; media: Media[] }>('GET', `tours/${slug}`).then(
        (d) => {
          setRaw(d.raw);
          setMedia(d.media);
          setDirty(false);
        },
        (e) => setError(e.message),
      ),
    [slug],
  );
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const langs = useMemo(() => Object.keys(raw?.languages || {}), [raw]);

  // Every edit goes through here: copy, change, mark unsaved.
  const edit = (change: (draft: RawTour) => void) => {
    setRaw((prev) => {
      if (!prev) return prev;
      const draft = structuredClone(prev);
      change(draft);
      return draft;
    });
    setDirty(true);
    setSaved('');
  };

  const save = async (next = raw) => {
    if (!next) return;
    setBusy(true);
    setError('');
    try {
      await api('PUT', `tours/${slug}`, { raw: next });
      setRaw(next);
      setDirty(false);
      setSaved('บันทึกแล้ว');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File, rel: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await api<Media>('PUT', `tours/${slug}/media?path=${encodeURIComponent(rel)}`, file, true);
      setMedia((m) => [...m.filter((x) => x.path !== res.path), res]);
      return res.path;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const removeFile = async (rel: string) => {
    try {
      await api('DELETE', `tours/${slug}/media?path=${encodeURIComponent(rel)}`);
      setMedia((m) => m.filter((x) => x.path !== rel));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!raw) {
    return (
      <>
        <PageHeader title={slug} />
        <ErrorNote>{error}</ErrorNote>
        {!error && <p className="text-muted">กำลังโหลด…</p>}
      </>
    );
  }

  const access = raw.access || {};
  const main = raw.defaultLanguage && langs.includes(raw.defaultLanguage) ? raw.defaultLanguage : langs[0];
  const sizeOf = (rel: string) => media.find((m) => m.path === rel)?.size;

  return (
    <>
      <PageHeader title={pick(asText(raw.title), main) || slug}>
        <div className="flex gap-2">
          <a href={`/t/${slug}`} target="_blank" rel="noreferrer" className="btn">
            <ExternalLink className="size-4" strokeWidth={1.75} />
            เปิดหน้าทัวร์
          </a>
          {access.mode === 'code' && (
            <Link href={`/admin/passes?slug=${slug}`} className="btn">
              ออก QR
            </Link>
          )}
        </div>
      </PageHeader>

      <Section title="ชื่อและภาษา">
        <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
          {langs.map((l) => (
            <div key={l} className="grid gap-3 sm:grid-cols-[6rem_1fr_1fr] sm:items-start">
              <div className="pt-2">
                <span className="font-mono text-sm font-semibold">{l}</span>
                <input
                  aria-label={`ชื่อภาษา ${l}`}
                  value={raw.languages[l]?.label || ''}
                  onChange={(e) => edit((d) => void (d.languages[l] = { ...d.languages[l], label: e.target.value }))}
                  className="mt-1 w-full border-b border-line bg-transparent text-xs text-muted outline-none focus:border-ink"
                />
              </div>
              <input
                aria-label={`ชื่อทัวร์ (${l})`}
                placeholder="ชื่อทัวร์"
                value={asText(raw.title)[l] || ''}
                onChange={(e) => edit((d) => void (d.title = { ...asText(d.title), [l]: e.target.value }))}
                className="field"
              />
              <input
                aria-label={`คำโปรย (${l})`}
                placeholder="คำโปรย"
                value={asText(raw.subtitle)[l] || ''}
                onChange={(e) => edit((d) => void (d.subtitle = { ...asText(d.subtitle), [l]: e.target.value }))}
                className="field"
              />
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
            <div>
              <label htmlFor="main-lang" className="label">
                ภาษาหลัก
              </label>
              <select id="main-lang" value={main} onChange={(e) => edit((d) => void (d.defaultLanguage = e.target.value))} className="field w-auto">
                {langs.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const code = newLang.trim().toLowerCase();
                if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(code) || langs.includes(code)) return setError('รหัสภาษาไม่ถูกต้องหรือมีอยู่แล้ว');
                edit((d) => void (d.languages[code] = { label: code }));
                setNewLang('');
              }}
            >
              <div>
                <label htmlFor="new-lang" className="label">
                  เพิ่มภาษา
                </label>
                <input id="new-lang" value={newLang} onChange={(e) => setNewLang(e.target.value)} placeholder="ja" className="field w-28 font-mono" />
              </div>
              <button className="btn" type="submit">
                <Plus className="size-4" />
                เพิ่ม
              </button>
            </form>
            {langs.length > 1 && (
              <div className="ml-auto">
                <label htmlFor="drop-lang" className="label">
                  ลบภาษา
                </label>
                <select
                  id="drop-lang"
                  value=""
                  onChange={(e) => {
                    const l = e.target.value;
                    if (!l || !confirm(`ลบภาษา ${l}? ข้อความและเสียงภาษานี้จะถูกเอาออกจาก tour.json (ไฟล์เสียงยังอยู่)`)) return;
                    edit((d) => {
                      delete d.languages[l];
                      for (const s of d.stops) delete s.audio?.[l];
                      if (d.defaultLanguage === l) d.defaultLanguage = Object.keys(d.languages)[0];
                    });
                  }}
                  className="field w-auto"
                >
                  <option value="">เลือก…</option>
                  {langs.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section title="การเข้าใช้">
        <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="mode" className="label">
              วิธีเข้า
            </label>
            <select
              id="mode"
              value={access.mode || 'open'}
              onChange={(e) => edit((d) => void (d.access = { ...d.access, mode: e.target.value as 'open' | 'code' }))}
              className="field"
            >
              <option value="code">ต้องสแกน QR / กรอกรหัส</option>
              <option value="open">เปิดสาธารณะ</option>
            </select>
          </div>
          <div>
            <label htmlFor="minutes" className="label">
              {access.mode === 'code' ? 'เวลาเริ่มต้นของ QR (นาที)' : 'เวลาต่อ session (นาที)'}
            </label>
            <input
              id="minutes"
              type="number"
              min={1}
              value={access.sessionMinutes ?? 180}
              onChange={(e) => edit((d) => void (d.access = { ...d.access, sessionMinutes: Number(e.target.value) }))}
              className="field tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="redirect" className="label">
              หมดเวลาแล้วไปที่
            </label>
            <input
              id="redirect"
              value={access.expiredRedirect ?? '/expired'}
              onChange={(e) => edit((d) => void (d.access = { ...d.access, expiredRedirect: e.target.value }))}
              className="field font-mono text-sm"
            />
          </div>
          <div>
            <label htmlFor="rate" className="label">
              เล่นได้สูงสุด (แทร็ก/นาที)
            </label>
            <input
              id="rate"
              type="number"
              min={1}
              value={access.maxTracksPerMinute ?? 8}
              onChange={(e) => edit((d) => void (d.access = { ...d.access, maxTracksPerMinute: Number(e.target.value) }))}
              className="field tabular-nums"
            />
          </div>
        </div>
      </Section>

      <Section title="หน้าตา">
        <div className="space-y-5 rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input
                type="color"
                value={raw.theme?.accent || '#9a2b1d'}
                onChange={(e) => edit((d) => void (d.theme = { ...d.theme, accent: e.target.value }))}
                className="size-9 cursor-pointer rounded border border-line bg-transparent"
              />
              สีหลักของทัวร์
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={raw.listed !== false} onChange={(e) => edit((d) => void (d.listed = e.target.checked))} className="size-4" />
              แสดงในหน้ารวมทัวร์
            </label>
          </div>
          <div>
            <span className="label">รูปหน้าปก</span>
            <div className="flex flex-wrap gap-3">
              {(raw.heroImages || []).map((img, i) => (
                <figure key={img} className="group relative h-28 w-40 overflow-hidden rounded-md border border-line bg-bg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/t/${slug}/${img}`} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="เอารูปออก"
                    onClick={() => edit((d) => void d.heroImages?.splice(i, 1))}
                    className="absolute top-1.5 right-1.5 rounded bg-surface/90 p-1 text-danger opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </figure>
              ))}
              <label className="grid h-28 w-40 cursor-pointer place-items-center rounded-md border border-dashed border-line text-sm text-muted hover:border-ink hover:text-ink">
                <span className="inline-flex flex-col items-center gap-1">
                  <ImagePlus className="size-5" strokeWidth={1.5} />
                  เพิ่มรูป
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.svg"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    const rel = await upload(file, `images/${fileName(file.name)}`);
                    if (rel) edit((d) => void (d.heroImages = [...(d.heroImages || []).filter((x) => x !== rel), rel]));
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title={`จุดในทัวร์ (${raw.stops.length})`}
        aside={
          <button
            className="btn"
            onClick={() =>
              edit((d) => {
                const ids = new Set(d.stops.map((s) => String(s.id)));
                let n = d.stops.length + 1;
                while (ids.has(String(n))) n++;
                d.stops.push({ id: String(n), title: Object.fromEntries(langs.map((l) => [l, ''])), transcript: {}, lat: null, lng: null, audio: {} });
              })
            }
          >
            <Plus className="size-4" />
            เพิ่มจุด
          </button>
        }
      >
        <ol className="space-y-4">
          {raw.stops.map((stop, i) => (
            <li key={`${stop.id}-${i}`} className="rounded-lg border border-line bg-surface">
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
                <span className="grid size-7 place-items-center rounded-full bg-ink text-xs font-semibold text-bg tabular-nums">{i + 1}</span>
                <span className="font-medium">{pick(asText(stop.title), main) || 'ไม่มีชื่อ'}</span>
                <span className="text-xs text-muted">id {stop.id}</span>
                <span className="flex-1" />
                <button
                  aria-label="เลื่อนขึ้น"
                  disabled={i === 0}
                  onClick={() => edit((d) => void d.stops.splice(i - 1, 0, d.stops.splice(i, 1)[0]))}
                  className="btn px-2 py-1"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  aria-label="เลื่อนลง"
                  disabled={i === raw.stops.length - 1}
                  onClick={() => edit((d) => void d.stops.splice(i + 1, 0, d.stops.splice(i, 1)[0]))}
                  className="btn px-2 py-1"
                >
                  <ArrowDown className="size-4" />
                </button>
                <button
                  aria-label="ลบจุดนี้"
                  disabled={raw.stops.length === 1}
                  onClick={() => confirm('ลบจุดนี้? (ไฟล์เสียงยังอยู่ในโฟลเดอร์)') && edit((d) => void d.stops.splice(i, 1))}
                  className="btn-danger px-2 py-1"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="grid gap-4 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`lat-${i}`}>
                      ละติจูด
                    </label>
                    <input
                      id={`lat-${i}`}
                      inputMode="decimal"
                      value={stop.lat ?? ''}
                      placeholder="13.7500"
                      onChange={(e) => edit((d) => void (d.stops[i].lat = e.target.value === '' ? null : Number(e.target.value)))}
                      className="field font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`lng-${i}`}>
                      ลองจิจูด
                    </label>
                    <input
                      id={`lng-${i}`}
                      inputMode="decimal"
                      value={stop.lng ?? ''}
                      placeholder="100.4913"
                      onChange={(e) => edit((d) => void (d.stops[i].lng = e.target.value === '' ? null : Number(e.target.value)))}
                      className="field font-mono text-sm"
                    />
                  </div>
                </div>
                {langs.map((l) => {
                  const audio = stop.audio?.[l];
                  const size = audio ? sizeOf(audio) : undefined;
                  return (
                    <div key={l} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[3rem_1fr]">
                      <span className="pt-2 font-mono text-sm font-semibold">{l}</span>
                      <div className="space-y-2">
                        <input
                          aria-label={`ชื่อจุด (${l})`}
                          placeholder="ชื่อจุด"
                          value={asText(stop.title)[l] || ''}
                          onChange={(e) => edit((d) => void (d.stops[i].title = { ...asText(d.stops[i].title), [l]: e.target.value }))}
                          className="field"
                        />
                        <textarea
                          aria-label={`บทบรรยาย (${l})`}
                          placeholder="บทบรรยาย (ไม่บังคับ)"
                          rows={2}
                          value={asText(stop.transcript)[l] || ''}
                          onChange={(e) => edit((d) => void (d.stops[i].transcript = { ...asText(d.stops[i].transcript), [l]: e.target.value }))}
                          className="field min-h-16 resize-y"
                        />
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          {audio ? (
                            <span className={`inline-flex items-center gap-1.5 ${size === undefined ? 'text-danger' : 'text-muted'}`}>
                              <Volume2 className="size-4" strokeWidth={1.75} />
                              <code className="font-mono text-xs">{audio}</code>
                              {size === undefined ? '(ไม่พบไฟล์)' : `· ${kb(size)}`}
                            </span>
                          ) : (
                            <span className="text-muted">ยังไม่มีเสียง</span>
                          )}
                          <label className="btn cursor-pointer px-2.5 py-1 text-xs">
                            <Upload className="size-3.5" />
                            {audio ? 'เปลี่ยนไฟล์' : 'อัปโหลดเสียง'}
                            <input
                              type="file"
                              accept=".mp3,.m4a,.aac,.ogg,.opus,.wav,audio/*"
                              className="sr-only"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (!file) return;
                                const id = fileName(String(stop.id));
                                const rel = await upload(file, `audio/${l}/${String(i + 1).padStart(2, '0')}-${id}${ext(file.name) || '.mp3'}`);
                                if (!rel) return;
                                // Point the stop at the file and save right away, so the upload is never orphaned by a forgotten save.
                                const next = structuredClone(raw);
                                next.stops[i].audio = { ...next.stops[i].audio, [l]: rel };
                                await save(next);
                              }}
                            />
                          </label>
                          {audio && (
                            <button
                              className="px-1 text-xs text-muted underline hover:text-danger"
                              onClick={() => edit((d) => void delete d.stops[i].audio?.[l])}
                            >
                              เอาออก
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="ไฟล์ในทัวร์">
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          {media.length === 0 && <li className="px-4 py-6 text-center text-muted">ยังไม่มีไฟล์</li>}
          {[...media]
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((m) => (
              <li key={m.path} className="flex items-center gap-3 px-4 py-2">
                <code className="font-mono text-xs">{m.path}</code>
                <span className="text-muted tabular-nums">{kb(m.size)}</span>
                <span className="flex-1" />
                <button
                  aria-label={`ลบ ${m.path}`}
                  className="text-muted hover:text-danger"
                  onClick={() => confirm(`ลบไฟล์ ${m.path}?`) && removeFile(m.path)}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
        </ul>
      </Section>

      <Section title="แก้ไข tour.json โดยตรง">
        <details
          className="rounded-lg border border-line bg-surface"
          onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setJson(JSON.stringify(raw, null, 2))}
        >
          <summary className="cursor-pointer px-5 py-3 text-muted">สำหรับคนที่คุ้นกับ JSON</summary>
          <div className="space-y-3 px-5 pb-5">
            <textarea
              aria-label="tour.json"
              value={json}
              onChange={(e) => setJson(e.target.value)}
              spellCheck={false}
              rows={18}
              className="field font-mono text-xs leading-relaxed"
            />
            <button
              className="btn"
              onClick={() => {
                try {
                  save(JSON.parse(json));
                } catch (e) {
                  setError(`JSON ไม่ถูกต้อง: ${(e as Error).message}`);
                }
              }}
            >
              บันทึก JSON
            </button>
          </div>
        </details>
      </Section>

      <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <span className={`text-sm ${dirty ? 'font-medium text-ink' : 'text-muted'}`} aria-live="polite">
            {error ? <span className="text-danger">{error}</span> : dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : saved || 'บันทึกครบแล้ว'}
          </span>
          <span className="flex-1" />
          <button className="btn" disabled={!dirty || busy} onClick={() => load()}>
            ยกเลิกการแก้ไข
          </button>
          <button className="btn-primary" disabled={!dirty || busy} onClick={() => save()}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </>
  );
}
