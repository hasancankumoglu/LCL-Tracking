import flags from 'react-phone-number-input/flags'
import { useTranslation } from 'react-i18next'
import type { Language } from '@shared/types'

interface LanguageSwitcherProps {
  variant?: 'login' | 'header'
}

/** TR/EN flag toggle - persists the choice via the main process and switches i18next live. */
export default function LanguageSwitcher({
  variant = 'header'
}: LanguageSwitcherProps): React.JSX.Element {
  const { i18n } = useTranslation()
  const current = (i18n.language as Language) === 'en' ? 'en' : 'tr'

  async function selectLanguage(language: Language): Promise<void> {
    if (language === current) return
    await window.api.ui.setLanguage(language)
    await i18n.changeLanguage(language)
  }

  const TrFlag = flags.TR!
  const GbFlag = flags.GB!

  return (
    <div className={`language-switcher language-switcher--${variant}`}>
      <button
        type="button"
        className={`language-switcher__flag${current === 'tr' ? ' language-switcher__flag--active' : ''}`}
        onClick={() => selectLanguage('tr')}
        title="Türkçe"
        aria-label="Türkçe"
      >
        <TrFlag title="Türkçe" />
      </button>
      <button
        type="button"
        className={`language-switcher__flag${current === 'en' ? ' language-switcher__flag--active' : ''}`}
        onClick={() => selectLanguage('en')}
        title="English"
        aria-label="English"
      >
        <GbFlag title="English" />
      </button>
    </div>
  )
}
