import { ElectronAPI } from '@electron-toolkit/preload'
import type { HalilsPortalApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: HalilsPortalApi
  }
}
