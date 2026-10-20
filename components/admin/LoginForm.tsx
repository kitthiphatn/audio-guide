'use client';

import { useState } from 'react';
import { api } from './api';

export default function LoginForm({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-4xl font-semibold tracking-[-0.02em]">Audio Guide</h1>
        <p className="mt-2 text-muted">หน้าจัดการสำหรับเจ้าหน้าที่</p>
        {configured ? (
          <form
            className="mt-10"
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
            <button type="submit" disabled={busy} className="btn-primary mt-4 w-full py-2.5">
              {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
            {error && (
              <p role="alert" className="mt-3 text-sm font-medium text-danger">
                {error}
              </p>
            )}
          </form>
        ) : (
          <p className="mt-10 rounded-md border border-line bg-surface p-4 leading-relaxed">
            ยังไม่ได้ตั้งรหัสผ่าน ให้เพิ่มบรรทัด <code className="font-mono text-sm">AG_ADMIN_PASSWORD=รหัสของคุณ</code> ในไฟล์ <code className="font-mono text-sm">.env</code> แล้วเปิด server ใหม่
          </p>
        )}
      </div>
    </main>
  );
}
