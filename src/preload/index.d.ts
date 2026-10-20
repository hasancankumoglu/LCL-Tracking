import { ElectronAPI } from '@electron-toolkit/preload'
import type { LclTrackingApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: LclTrackingApi
  }
}
