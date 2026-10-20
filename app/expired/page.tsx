import { Timer } from 'lucide-react';

export const metadata = { title: 'หมดเวลาแล้ว', robots: { index: false } };

export default function Expired() {
  return (
    <main className="theme-guide grid min-h-dvh place-items-center bg-bg px-6 text-center text-ink">
      <div className="animate-rise max-w-md">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-ink/[0.06]">
          <Timer className="size-7" strokeWidth={1.75} />
        </span>
        <h1 className="mt-6 text-5xl leading-[1.02] font-bold tracking-[-0.045em]">หมดเวลาแล้ว</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">เวลาใช้งานทัวร์ของคุณหมดแล้ว ขอบคุณที่ร่วมเดินทางกับเรา หากต้องการฟังต่อ กรุณาติดต่อเจ้าหน้าที่</p>
        <p className="mt-6 text-[15px] text-muted/80">Your tour time has ended. Thank you for walking with us. To keep listening, please ask our staff.</p>
      </div>
    </main>
  );
}
