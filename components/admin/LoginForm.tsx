'use client';

import { useState } from 'react';
import { AudioLines } from 'lucide-react';
import { api } from './api';

export default function LoginForm({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(90%_60%_at_50%_0%,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_70%)] px-5">
      <div className="animate-rise w-full max-w-sm text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-[20px] bg-ink text-bg shadow-[var(--shadow-float)]">
          <AudioLines className="size-8" strokeWidth={2} />
        </span>
        <h1 className="mt-6 text-[34px] font-bold tracking-[-0.045em]">Audio Guide</h1>
        <p className="mt-1 text-muted">หน้าจัดการสำหรับเจ้าหน้าที่</p>
        {configured ? (
          <form
            className="card mt-8 p-6 text-left"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await api('POST', 'login', { password });
                window.location.reload();
              } catch (err) {
                setError((err as Error).message);
                setBusy(false);
              }
            }}
          >
            <label htmlFor="pw" className="label">
              รหัสผ่าน
            </label>
            <input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="field" />
            <button type="submit" disabled={busy} className="btn-primary mt-4 w-full py-3 text-[15px]">
              {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
            {error && (
              <p role="alert" className="mt-3 text-sm font-medium text-danger">
                {error}
              </p>
            )}
          </form>
        ) : (
          <p className="card mt-8 p-5 text-left leading-relaxed">
            ยังไม่ได้ตั้งรหัสผ่าน ให้เพิ่มบรรทัด <code className="font-mono text-sm">AG_ADMIN_PASSWORD=รหัสของคุณ</code> ในไฟล์ <code className="font-mono text-sm">.env</code> แล้วเปิด server ใหม่
          </p>
        )}
      </div>
    </main>
  );
}
