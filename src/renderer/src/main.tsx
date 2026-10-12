import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'

// Electron/Chromium'un varsayılan davranışı, pencereye bırakılan (drop edilen) bir
// dosyayı doğrudan açmak/pencereyi o dosyaya yönlendirmektir. Sürükle-bırak alanlarının
// dışına yanlışlıkla bırakılan dosyaların uygulamayı bozmasını engellemek için
// pencere genelinde varsayılan dragover/drop davranışını devre dışı bırakıyoruz.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
)
