import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import CreatableSelect from 'react-select/creatable'
import type { StylesConfig } from 'react-select'

interface Option {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: string[]
  /** Kullanıcı listede olmayan bir değeri oluşturduğunda listeye kalıcı olarak eklemek için çağrılır. */
  onAddOption: (value: string) => void | Promise<void>
  placeholder?: string
  required?: boolean
}

const selectStyles: StylesConfig<Option, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: 34,
    borderRadius: 6,
    borderColor: state.isFocused ? 'var(--color-navy)' : 'var(--color-border)',
    boxShadow: state.isFocused ? '0 0 0 1px var(--color-navy)' : 'none',
    backgroundColor: 'var(--color-surface)',
    fontSize: 13,
    ':hover': { borderColor: 'var(--color-navy)' }
  }),
  valueContainer: (base) => ({ ...base, padding: '2px 10px' }),
  input: (base) => ({ ...base, color: 'var(--color-text)', margin: 0, padding: 0 }),
  singleValue: (base) => ({ ...base, color: 'var(--color-text)' }),
  placeholder: (base) => ({ ...base, color: 'var(--color-text-muted)' }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base) => ({ ...base, color: 'var(--color-text-muted)', padding: 6 }),
  clearIndicator: (base) => ({ ...base, color: 'var(--color-text-muted)', padding: 6 }),
  menu: (base) => ({
    ...base,
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
    zIndex: 20
  }),
  menuList: (base) => ({ ...base, padding: 4 }),
  option: (base, state) => ({
    ...base,
    fontSize: 13,
    borderRadius: 4,
    cursor: 'pointer',
    backgroundColor: state.isSelected
      ? 'var(--color-navy)'
      : state.isFocused
        ? 'var(--color-bg)'
        : 'transparent',
    color: state.isSelected ? '#fff' : 'var(--color-text)'
  })
}

/**
 * Serbest metin girişine izin veren, mevcut değerler arasında arama/filtreleme
 * yapan ve yeni bir değerin dropdown'dan kalıcı olarak eklenebildiği combobox.
 * Kategori/Destination/Line/POL gibi tekrar eden alanlar için kullanılır.
 * react-select'in Creatable bileşeni üzerine kuruludur (https://react-select.com/creatable).
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  onAddOption,
  placeholder,
  required
}: Props): React.JSX.Element {
  const { t } = useTranslation()
  const selectOptions = useMemo<Option[]>(
    () => options.map((o) => ({ value: o, label: o })),
    [options]
  )
  const trimmedValue = value.trim()
  const selected = trimmedValue ? { value: trimmedValue, label: trimmedValue } : null

  function handleChange(next: Option | null): void {
    onChange(next?.value ?? '')
  }

  async function handleCreate(inputValue: string): Promise<void> {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput) return
    onChange(trimmedInput)
    await onAddOption(trimmedInput)
  }

  return (
    <CreatableSelect<Option, false>
      classNamePrefix="rs"
      styles={selectStyles}
      isClearable
      required={required}
      value={selected}
      options={selectOptions}
      onChange={handleChange}
      onCreateOption={handleCreate}
      placeholder={placeholder}
      formatCreateLabel={(input) => t('misc.createOption', { input })}
      noOptionsMessage={() => t('misc.noOptions')}
    />
  )
}
