import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import App from './App'
import AppUpdateDialog from './components/AppUpdateDialog'
import { LoadingOverlayProvider } from './lib/loadingOverlay'
import { AuthProvider } from './auth/AuthContext'
import i18n from './i18n'

// Electron/Chromium'un varsayılan davranışı, pencereye bırakılan (drop edilen) bir
// dosyayı doğrudan açmak/pencereyi o dosyaya yönlendirmektir. Sürükle-bırak alanlarının
// dışına yanlışlıkla bırakılan dosyaların uygulamayı bozmasını engellemek için
// pencere genelinde varsayılan dragover/drop davranışını devre dışı bırakıyoruz.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

// Main process'te kalıcı tutulan dil tercihini, renderer'ın i18next örneğiyle senkronize et.
window.api.ui.getLanguage().then((lang) => i18n.changeLanguage(lang))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <AppUpdateDialog />
      <HashRouter>
        <LoadingOverlayProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LoadingOverlayProvider>
      </HashRouter>
    </I18nextProvider>
  </StrictMode>
)
