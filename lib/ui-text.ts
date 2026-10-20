// Interface text for the visitor pages. Add a language by adding a block;
// missing keys fall back to English.

const UI = {
  en: {
    language: 'Language',
    searchLanguage: 'Search languages',
    stops: 'Stops',
    map: 'Map',
    transcript: 'Read along',
    timeLeft: 'left',
    speed: 'Speed',
    locateMe: 'Show where I am',
    noAudio: 'This stop has no audio in this language yet.',
    tooFast: 'Please wait a moment before starting another stop.',
    playError: 'This stop could not play. Try again.',
    stopOf: 'Stop {n} of {total}',
    choose: 'Choose a stop to begin',
    play: 'Play',
    pause: 'Pause',
    previous: 'Previous stop',
    next: 'Next stop',
    back15: 'Back 15 seconds',
    forward15: 'Forward 15 seconds',
    theme: 'Switch light or dark',
    enterCode: 'Enter the code from your ticket',
    start: 'Start the tour',
    codeHelp: 'Scan the QR code on your ticket, or type its code here.',
  },
  th: {
    language: 'ภาษา',
    searchLanguage: 'ค้นหาภาษา',
    stops: 'จุดในทัวร์',
    map: 'แผนที่',
    transcript: 'อ่านบทบรรยาย',
    timeLeft: 'เหลือ',
    speed: 'ความเร็ว',
    locateMe: 'แสดงตำแหน่งของฉัน',
    noAudio: 'จุดนี้ยังไม่มีเสียงภาษานี้',
    tooFast: 'กรุณารอสักครู่ก่อนเริ่มจุดถัดไป',
    playError: 'เล่นเสียงไม่ได้ ลองใหม่อีกครั้ง',
    stopOf: 'จุดที่ {n} จาก {total}',
    choose: 'เลือกจุดเพื่อเริ่มฟัง',
    play: 'เล่น',
    pause: 'หยุดชั่วคราว',
    previous: 'จุดก่อนหน้า',
    next: 'จุดถัดไป',
    back15: 'ย้อน 15 วินาที',
    forward15: 'ข้าม 15 วินาที',
    theme: 'สลับโหมดสว่าง/มืด',
    enterCode: 'กรอกรหัสบนบัตรของคุณ',
    start: 'เริ่มทัวร์',
    codeHelp: 'สแกน QR บนบัตร หรือพิมพ์รหัสที่นี่',
  },
  zh: {
    language: '语言',
    searchLanguage: '搜索语言',
    stops: '景点',
    map: '地图',
    transcript: '讲解词',
    timeLeft: '剩余',
    speed: '速度',
    locateMe: '显示我的位置',
    noAudio: '此景点暂无该语言的音频。',
    tooFast: '请稍候再开始下一个景点。',
    playError: '无法播放，请重试。',
    stopOf: '第 {n} 站，共 {total} 站',
    choose: '选择一个景点开始收听',
    play: '播放',
    pause: '暂停',
    previous: '上一站',
    next: '下一站',
    back15: '后退 15 秒',
    forward15: '前进 15 秒',
    theme: '切换明暗模式',
    enterCode: '输入门票上的代码',
    start: '开始游览',
    codeHelp: '扫描门票上的二维码，或在此输入代码。',
  },
} as const;

export type UiKey = keyof (typeof UI)['en'];

export function ui(lang: string, key: UiKey, vars: Record<string, string | number> = {}): string {
  const table = UI as Record<string, Partial<Record<UiKey, string>>>;
  const text = table[lang]?.[key] ?? table[lang.split('-')[0]]?.[key] ?? UI.en[key];
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export const CODE_ERRORS: Record<string, string> = {
  unknown_code: 'รหัสไม่ถูกต้อง · Invalid code',
  code_expired: 'รหัสนี้หมดเวลาแล้ว · This code has expired',
  code_revoked: 'รหัสนี้ถูกยกเลิกแล้ว กรุณาติดต่อเจ้าหน้าที่ · This code was cancelled, please ask staff',
  code_device_limit: 'รหัสนี้ใช้ครบจำนวนเครื่องแล้ว · This code is already in use on its maximum number of devices',
};
