export const metadata = { title: 'หมดเวลาแล้ว', robots: { index: false } };

export default function Expired() {
  return (
    <main className="theme-guide grid min-h-dvh place-items-center bg-bg px-6 text-ink">
      <div className="max-w-md">
        <h1 className="font-display text-5xl leading-[1.05] font-semibold tracking-[-0.02em]">หมดเวลาแล้ว</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          เวลาใช้งานทัวร์ของคุณหมดแล้ว ขอบคุณที่ร่วมเดินทางกับเรา หากต้องการฟังต่อ กรุณาติดต่อเจ้าหน้าที่
        </p>
        <p className="mt-6 border-t border-line pt-6 text-muted">Your tour time has ended. Thank you for walking with us. To keep listening, please ask our staff.</p>
      </div>
    </main>
  );
}
