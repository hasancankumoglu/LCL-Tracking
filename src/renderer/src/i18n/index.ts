import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import trResources from '@shared/locales/tr'
import enResources from '@shared/locales/en'

i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: trResources },
    en: { translation: enResources }
  },
  lng: 'tr',
  fallbackLng: 'tr',
  interpolation: { escapeValue: false }
})

export default i18n
