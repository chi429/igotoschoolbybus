import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // 上架前改做你自己嘅 reverse-domain ID（要同 App Store Connect 一致）
  appId: 'digital.skymakers.dapmebus',
  appName: '搭咩巴士',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
  },
}

export default config
