export const PLATFORM_LABELS: Record<string, string> = {
  'android.release': 'Android',
  'android.debug': 'Android Debug',
  'ios.release': 'iOS',
  'ios.debug': 'iOS Debug',
  'desktop.release': 'Desktop',
  'ext.release': 'Extension',
  'web.release': 'Web',
  android: 'Android',
  ios: 'iOS',
  desktop: 'Desktop',
  ext: 'Extension',
  web: 'Web',
};

export function platformLabel(key: string): string {
  return PLATFORM_LABELS[key] || key;
}

export const STATUS_LABELS: Record<string, string> = {
  ok: '正常',
  regression: '回归',
  failed: '失败',
  recovered: '已恢复',
};

export function statusLabel(key: string): string {
  return STATUS_LABELS[key] || key;
}
