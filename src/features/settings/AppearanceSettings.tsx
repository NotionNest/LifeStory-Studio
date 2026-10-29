import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Field, FieldLabel } from '@/components/ui/field'
import type { ThemePreference } from '@/hooks/useAppearance'

export function AppearanceSettings({
  preference,
  onChange,
  error,
}: {
  preference: ThemePreference
  onChange: (value: string) => void
  error: string
}) {
  return (
    <section className="settings-content" aria-labelledby="appearance-heading">
      <header className="settings-heading">
        <h1 id="appearance-heading">外观</h1>
      </header>
      <div className="settings-group">
        <Field orientation="horizontal" className="settings-row">
          <FieldLabel htmlFor="appearance-theme">主题</FieldLabel>
          <NativeSelect
            id="appearance-theme"
            aria-label="主题模式"
            value={preference}
            onChange={(event) => onChange(event.target.value)}
          >
            <NativeSelectOption value="system">跟随系统</NativeSelectOption>
            <NativeSelectOption value="light">浅色</NativeSelectOption>
            <NativeSelectOption value="dark">深色</NativeSelectOption>
          </NativeSelect>
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
