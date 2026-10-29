import { cliApi, type CliCatalog, type CliInstallation } from '@/services/cli'
import { modelProfilesApi, type AiPreferences, type AiProfile } from '@/services/modelProfiles'
import { createContext, useContext, type ReactNode } from 'react'
import claudeLogo from '@/assets/cli-logos/claudecode-color.svg'
import codexLogo from '@/assets/cli-logos/codex-color.svg'
import cursorLogo from '@/assets/cli-logos/cursor.svg'
import geminiLogo from '@/assets/cli-logos/geminicli-color.svg'
import kimiLogo from '@/assets/cli-logos/kimi-color.svg'
import { RefreshCwIcon } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { errorMessage } from '@/lib/errors'

const emptyProfile = (path: string): AiProfile => ({
  id: 'new',
  label: 'Codex CLI',
  service: 'codex',
  protocol: 'codex',
  baseUrl: '',
  model: '',
  cliModelMode: 'inherit',
  reasoningEffort: null,
  codexPath: path,
  contextChars: 32000,
  maxOutputTokens: 4096,
  downstream: null,
})
type Props = {
  active?: boolean
  profiles: AiProfile[]
  preferences?: AiPreferences
  onChange: (profile?: AiProfile) => void
  onDirty: (value: boolean) => void
  onBusy: (value: boolean) => void
}

const cliLogos: Record<string, string> = {
  claude: claudeLogo,
  codex: codexLogo,
  cursor: cursorLogo,
  gemini: geminiLogo,
  kimi: kimiLogo,
}

function useLocalCliSettings({
  active = true,
  profiles,
  preferences,
  onChange,
  onDirty,
  onBusy,
}: Props) {
  const [installations, setInstallations] = useState<CliInstallation[]>([])
  const [scanned, setScanned] = useState(false)
  const [open, setOpen] = useState('')
  const [profile, setProfile] = useState<AiProfile>(emptyProfile(''))
  const [editing, setEditing] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [useForNewChat, setUseForNewChat] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const scanPending = useRef(false)
  const working = busy || scanning || reading
  const [catalog, setCatalog] = useState<CliCatalog | null>(null)
  const [message, setMessage] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const mutation = useRef(false)
  const epoch = useRef(0)
  const initialScan = useRef(false)
  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])
  useEffect(() => {
    onBusy(busy)
  }, [busy, onBusy])

  const activeProfiles = profiles.filter(
    (p) => p.protocol === 'codex' && !p.label.startsWith('[已停用]'),
  )
  const current = installations.filter((i) => i.preferred !== false)
  const installation = current.find((i) => i.kind === 'codex')
  const mode = profile.cliModelMode ?? 'selected'
  const selected = catalog?.models.find(
    (m) => m.model === (mode === 'inherit' ? catalog.currentModel : profile.model),
  )
  const efforts = selected?.supportedReasoningEfforts ?? []
  const selectedMissing =
    mode === 'selected' && !catalog?.models.some((m) => m.model === profile.model)
  const invalidEffort =
    !!profile.reasoningEffort &&
    !!catalog &&
    !efforts.some((e) => e.reasoningEffort === profile.reasoningEffort)
  const invalidModel = mode !== 'inherit' && !profile.model.trim()

  const run = async (action: () => Promise<void>) => {
    if (mutation.current) return
    mutation.current = true
    onBusy(true)
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (e) {
      setMessage(errorMessage(e))
    } finally {
      mutation.current = false
      onBusy(false)
      setBusy(false)
    }
  }
  const read = async (action: () => Promise<void>) => {
    setReading(true)
    setMessage('')
    try {
      await action()
    } catch (e) {
      setMessage(errorMessage(e))
    } finally {
      setReading(false)
    }
  }
  const refreshCatalog = async (path: string) => {
    const request = ++epoch.current
    setCatalog(null)
    const next = await cliApi.codexCatalog(path)
    if (request !== epoch.current) return
    setCatalog(next)
    if (next.version)
      setInstallations((items) =>
        items.map((i) => (i.path === path ? { ...i, version: next.version! } : i)),
      )
  }
  const load = async (item: CliInstallation) => {
    const previous =
      activeProfiles.find((p) => p.id === preferences?.defaultProfileId) ??
      activeProfiles[activeProfiles.length - 1]
    const next = previous
      ? {
          ...previous,
          label: 'Codex CLI',
          codexPath: item.path,
          cliModelMode: previous.cliModelMode ?? ('selected' as const),
        }
      : emptyProfile(item.path)
    setProfile(next)
    setEditing(previous?.id ?? null)
    setUseForNewChat(!!previous && preferences?.defaultProfileId === previous.id)
    setDirty(!!previous && (previous.codexPath !== item.path || previous.label !== 'Codex CLI'))
    await refreshCatalog(item.path)
  }
  const field = (name: keyof AiProfile, value: string | number | null) => {
    setProfile((p) => ({ ...p, [name]: value }))
    setDirty(true)
    setMessage('')
  }
  const scan = async () => {
    if (scanPending.current || busy || dirty) return
    scanPending.current = true
    setScanning(true)
    setMessage('')
    setOpen('')
    try {
      const result = await cliApi.scanCli()
      setInstallations(result)
      setScanned(true)
      setOpen('')
      setCatalog(null)
      ++epoch.current
      if (!result.length)
        setMessage('未找到当前可用的 CLI。已有配置和聊天保留，请检查终端中的安装后重新扫描。')
    } catch (e) {
      setMessage(errorMessage(e))
    } finally {
      scanPending.current = false
      setScanning(false)
    }
  }
  const onInitialScan = useEffectEvent(() => {
    void scan()
  })
  useEffect(() => {
    if (!active || initialScan.current) return
    initialScan.current = true
    onInitialScan()
  }, [active])
  const test = () =>
    run(async () => {
      const requestId = crypto.randomUUID()
      setTesting(requestId)
      try {
        const result = await cliApi.testCli(profile, requestId)
        setMessage(
          `${result.modelReply ? '连接测试通过' : '模型测试未完成'}${result.model ? ` · ${result.model}` : ''}。${result.detail}`,
        )
      } finally {
        setTesting(null)
      }
    })

  return {
    preferences,
    onChange,
    scanned,
    open,
    setOpen,
    profile,
    setProfile,
    editing,
    setEditing,
    dirty,
    setDirty,
    useForNewChat,
    setUseForNewChat,
    busy,
    reading,
    scanning,
    working,
    catalog,
    message,
    setMessage,
    testing,
    activeProfiles,
    current,
    installation,
    mode,
    efforts,
    selectedMissing,
    invalidEffort,
    invalidModel,
    run,
    read,
    refreshCatalog,
    load,
    field,
    scan,
    test,
  }
}
const LocalCliContext = createContext<ReturnType<typeof useLocalCliSettings> | null>(null)
export function LocalCliSession({ children, ...props }: Props & { children: ReactNode }) {
  const session = useLocalCliSettings(props)
  return <LocalCliContext value={session}>{children}</LocalCliContext>
}
export function LocalCliSettings(props: Props) {
  return (
    <LocalCliSession {...props}>
      <LocalCliSettingsView />
    </LocalCliSession>
  )
}
export function LocalCliSettingsView() {
  const session = useContext(LocalCliContext)
  if (!session) throw new Error('缺少会话上下文')
  const {
    preferences,
    onChange,
    scanned,
    open,
    setOpen,
    profile,
    setProfile,
    editing,
    setEditing,
    dirty,
    setDirty,
    useForNewChat,
    setUseForNewChat,
    busy,
    reading,
    scanning,
    working,
    catalog,
    message,
    setMessage,
    testing,
    activeProfiles,
    current,
    installation,
    mode,
    efforts,
    selectedMissing,
    invalidEffort,
    invalidModel,
    run,
    read,
    refreshCatalog,
    load,
    field,
    scan,
    test,
  } = session
  return (
    <section aria-label="本机 CLI 设置" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">本机 CLI</h2>
        <Button variant="outline" disabled={working || dirty} onClick={() => void scan()}>
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          {scanned ? '重新扫描' : '扫描本机 CLI'}
        </Button>
      </div>
      <Accordion
        className="gap-3"
        type="single"
        collapsible
        value={open}
        onValueChange={(value) => {
          if (working || dirty) return
          setOpen(value)
          setMessage('')
          if (value === 'codex' && installation) void read(() => load(installation))
        }}
      >
        {current.map((item) => (
          <AccordionItem
            key={item.kind}
            value={item.kind}
            className="rounded-xl border bg-sidebar px-4 sm:px-5"
          >
            <div className="flex items-center gap-3 [&>h3]:min-w-0 [&>h3]:flex-1">
              <AccordionTrigger
                className="min-w-0 py-5 hover:no-underline **:data-[slot=accordion-trigger-icon]:hidden!"
                aria-label={`配置 ${item.name}`}
                disabled={working || dirty}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white">
                    <img
                      src={cliLogos[item.kind]}
                      className="size-7 object-contain"
                      alt=""
                      aria-hidden="true"
                    />
                  </span>
                  <span className="flex min-w-0 flex-col items-start gap-1">
                    <span className="flex items-center gap-2">
                      {item.name}
                      {item.kind === 'codex' &&
                        activeProfiles.some((p) => p.id === preferences?.defaultProfileId) && (
                          <span className="text-xs font-normal text-muted-foreground">默认</span>
                        )}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {item.version || '版本未核实'}
                      {item.kind !== 'codex' ? ' · 暂不支持聊天' : ''}
                    </span>
                  </span>
                </span>
              </AccordionTrigger>
              {item.kind === 'codex' &&
                open === 'codex' &&
                (testing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void modelProfilesApi
                        .cancelTest(testing)
                        .then(() => setMessage('正在停止测试…'))
                        .catch((e) => setMessage(errorMessage(e)))
                    }
                  >
                    停止测试
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={working || invalidEffort || invalidModel}
                    title="测试会发送一条简短消息，可能消耗服务额度。"
                    onClick={() => void test()}
                  >
                    测试连接
                  </Button>
                ))}
            </div>
            <AccordionContent className="flex flex-col gap-5 pb-5">
              {item.kind !== 'codex' ? (
                <p className="text-sm text-muted-foreground">当前仅支持通过 Codex CLI 聊天。</p>
              ) : (
                <>
                  {item.error && (
                    <p role="alert" className="text-sm text-destructive">
                      {item.error}
                    </p>
                  )}
                  <form
                    className="flex flex-col gap-5"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void run(async () => {
                        const next = editing
                          ? await modelProfilesApi.updateProfile(profile, '', useForNewChat)
                          : await modelProfilesApi.configure(profile, '', useForNewChat)
                        setProfile(next)
                        setEditing(next.id)
                        setDirty(false)
                        onChange(next)
                        setMessage('设置已保存。')
                      })
                    }}
                  >
                    <FieldGroup className="flex flex-col gap-5">
                      <Field>
                        <div className="flex items-center justify-between gap-2">
                          <FieldLabel htmlFor="cli-model">模型</FieldLabel>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={working}
                            onClick={() => void read(() => refreshCatalog(item.path))}
                          >
                            刷新列表
                          </Button>
                        </div>
                        <NativeSelect
                          id="cli-model"
                          aria-label="CLI 模型"
                          className="w-full"
                          disabled={working}
                          value={mode === 'selected' ? `model:${profile.model}` : mode}
                          onChange={(e) => {
                            const value = e.target.value
                            setProfile((p) => ({
                              ...p,
                              cliModelMode:
                                value === 'inherit'
                                  ? 'inherit'
                                  : value === 'custom'
                                    ? 'custom'
                                    : 'selected',
                              model:
                                value === 'inherit' || value === 'custom' ? '' : value.slice(6),
                            }))
                            setDirty(true)
                            setMessage('')
                          }}
                        >
                          <NativeSelectOption value="inherit">
                            跟随 CLI 设置
                            {catalog?.currentModel ? `（当前 ${catalog.currentModel}）` : ''}
                          </NativeSelectOption>
                          {selectedMissing && (
                            <NativeSelectOption value={`model:${profile.model}`}>
                              已保存：{profile.model}（未在目录中核实）
                            </NativeSelectOption>
                          )}
                          {catalog?.models.map((m) => (
                            <NativeSelectOption key={m.model} value={`model:${m.model}`}>
                              {m.displayName} · {m.model}
                            </NativeSelectOption>
                          ))}
                          <NativeSelectOption value="custom">自定义模型 ID</NativeSelectOption>
                        </NativeSelect>
                        {!working && !catalog && (
                          <FieldDescription>未能读取模型列表，请刷新重试。</FieldDescription>
                        )}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="cli-effort">推理强度</FieldLabel>
                        <NativeSelect
                          id="cli-effort"
                          aria-label="CLI 推理强度"
                          className="w-full"
                          disabled={working || (!efforts.length && !profile.reasoningEffort)}
                          value={profile.reasoningEffort ?? 'inherit'}
                          onChange={(e) =>
                            field(
                              'reasoningEffort',
                              e.target.value === 'inherit' ? null : e.target.value,
                            )
                          }
                        >
                          <NativeSelectOption value="inherit">
                            跟随 CLI 设置
                            {catalog?.currentEffort ? `（当前 ${catalog.currentEffort}）` : ''}
                          </NativeSelectOption>
                          {invalidEffort && (
                            <NativeSelectOption value={profile.reasoningEffort!}>
                              原选择：{profile.reasoningEffort}（请重新选择）
                            </NativeSelectOption>
                          )}
                          {efforts.map((e) => (
                            <NativeSelectOption key={e.reasoningEffort} value={e.reasoningEffort}>
                              {e.reasoningEffort}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                        {invalidEffort && (
                          <FieldDescription>原强度不可用，请重新选择。</FieldDescription>
                        )}
                      </Field>
                      {mode === 'custom' && (
                        <Field className="sm:col-span-2">
                          <FieldLabel htmlFor="cli-custom">自定义模型 ID</FieldLabel>
                          <Input
                            id="cli-custom"
                            aria-label="CLI 自定义模型 ID"
                            disabled={working}
                            value={profile.model}
                            onChange={(e) => field('model', e.target.value)}
                            required
                          />
                        </Field>
                      )}
                    </FieldGroup>
                    {catalog?.models.length === 0 && (
                      <p role="status" className="text-sm text-muted-foreground">
                        没有可用的模型列表，请检查 CLI 登录状态后刷新。
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <label
                        id="cli-default-label"
                        htmlFor="cli-default"
                        className="text-sm font-medium"
                      >
                        用于新聊天
                      </label>
                      <Button
                        id="cli-default"
                        type="button"
                        variant="ghost"
                        size="sm"
                        role="switch"
                        aria-labelledby="cli-default-label"
                        aria-checked={useForNewChat}
                        disabled={working}
                        onClick={() => {
                          setUseForNewChat((value) => !value)
                          setDirty(true)
                          setMessage('')
                        }}
                        className="h-5 w-9 shrink-0 justify-start rounded-full bg-input p-0.5 hover:bg-input transition-colors aria-checked:bg-primary aria-checked:hover:bg-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          className="size-4 rounded-full bg-background shadow-sm transition-transform"
                          style={{
                            transform: useForNewChat ? 'translateX(16px)' : 'translateX(0)',
                          }}
                        />
                      </Button>
                    </div>
                    {(!editing || dirty) && (
                      <div className="flex flex-wrap gap-2 border-t pt-4">
                        <Button disabled={working || invalidEffort || invalidModel}>保存</Button>
                        {dirty && (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={working}
                            onClick={() =>
                              void read(async () => {
                                await load(item)
                                setDirty(false)
                              })
                            }
                          >
                            放弃修改
                          </Button>
                        )}
                      </div>
                    )}
                  </form>
                  {(busy || reading) && (
                    <p role="status" className="text-sm">
                      {testing ? '正在检查 CLI 和模型连接…' : '正在读取 CLI…'}
                    </p>
                  )}
                  {message && (
                    <p role="status" aria-live="polite" className="whitespace-pre-wrap text-sm">
                      {message}
                    </p>
                  )}
                </>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      {scanning && (
        <p role="status" className="text-sm">
          正在扫描 CLI…
        </p>
      )}
      {open !== 'codex' && message && (
        <p role="status" aria-live="polite" className="whitespace-pre-wrap text-sm">
          {message}
        </p>
      )}
    </section>
  )
}
