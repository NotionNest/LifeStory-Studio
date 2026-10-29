import { modelProfilesApi, type AiProfile, type AiPreferences } from '@/services/modelProfiles'
import { createContext, useContext, type ReactNode } from 'react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { EyeIcon, EyeOffIcon, PlugIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { errorMessage } from '@/lib/errors'

import { providerPresets } from '@/features/settings/providerPresets'
const initial: AiProfile = {
  id: 'new',
  label: 'OpenAI',
  service: 'openai',
  protocol: 'responses',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  contextChars: 32000,
  maxOutputTokens: 4096,
  downstream: null,
  codexPath: null,
}
const providers = providerPresets.filter((p) => p[2] !== 'codex')
interface Props {
  ready?: boolean
  active?: boolean
  profiles: AiProfile[]
  onChange: (profile?: AiProfile) => void
  preferences?: AiPreferences
  onDirty?: (value: boolean) => void
  onBusy?: (value: boolean) => void
}
function useAiSettings({
  ready = true,
  active = true,
  profiles,
  onChange,
  preferences,
  onDirty,
  onBusy,
}: Props) {
  const [profile, setProfile] = useState(initial),
    [key, setKey] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [failure, setFailure] = useState(false),
    [models, setModels] = useState<string[]>([]),
    [manualModel, setManualModel] = useState(true),
    [editing, setEditing] = useState<string | null>(null),
    [dirty, setDirty] = useState(false),
    [showKey, setShowKey] = useState(false),
    [testing, setTesting] = useState<string | null>(null)
  const [readingModels, setReadingModels] = useState(false)
  const catalogEpoch = useRef(0),
    currentProfile = useRef(profile)
  currentProfile.current = profile
  useEffect(
    () => () => {
      catalogEpoch.current++
    },
    [],
  )
  const busyRef = useRef(false),
    visitedApi = useRef(false),
    savedProfile = useRef<AiProfile | null>(null)
  useEffect(() => {
    onDirty?.(dirty)
  }, [dirty, onDirty])
  useEffect(() => {
    onBusy?.(busy)
  }, [busy, onBusy])
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    onBusy?.(true)
    setBusy(true)
    setMessage('')
    setFailure(false)
    try {
      await action()
    } catch (e) {
      setMessage(errorMessage(e))
      setFailure(true)
    } finally {
      busyRef.current = false
      onBusy?.(false)
      setBusy(false)
    }
  }
  const clearCatalog = () => {
    catalogEpoch.current++
    setModels([])
    setManualModel(true)
    setReadingModels(false)
  }
  const field = (name: keyof AiProfile, value: string | number | null) => {
    if (name === 'baseUrl' || name === 'protocol') clearCatalog()
    setProfile((p) => ({ ...p, [name]: value }))
    setDirty(true)
    setMessage('')
  }
  const configured = profiles.filter(
    (p) => !p.label.startsWith('[已停用]') && p.protocol !== 'codex',
  )
  const matching = configured.filter((p) => p.service === profile.service)
  const preset = providers.find((p) => p[0] === profile.service)
  const check = !dirty ? preferences?.checks?.find((c) => c.profileId === editing) : undefined
  const load = (next: AiProfile, existing: boolean) => {
    clearCatalog()
    savedProfile.current = existing ? next : null
    setProfile(next)
    setEditing(existing ? next.id : null)
    setKey('')
    setShowKey(false)
    setDirty(false)
    setModels([])
    setManualModel(true)
    setMessage('')
    setFailure(false)
  }
  const fresh = (service: string) => {
    const p = providers.find((p) => p[0] === service)!
    load({ ...initial, service: p[0], label: p[1], protocol: p[2], baseUrl: p[3] }, false)
  }
  const selectProvider = (service: string) => {
    if (busyRef.current || dirty) return
    const existing =
      configured.find((p) => p.service === service && p.id === preferences?.defaultProfileId) ??
      configured.find((p) => p.service === service)
    if (existing) load(existing, true)
    else fresh(service)
  }
  const cancel = () => {
    if (savedProfile.current) load(savedProfile.current, true)
    else fresh(profile.service)
  }
  const onFirstVisit = useEffectEvent(() => {
    const saved = configured.find((p) => p.id === preferences?.defaultProfileId) ?? configured[0]
    if (saved) load(saved, true)
  })
  useEffect(() => {
    if (active && ready && !visitedApi.current) {
      visitedApi.current = true
      onFirstVisit()
    }
  }, [active, ready, profiles, preferences?.defaultProfileId])
  const savedConnection = Boolean(
    editing &&
    savedProfile.current?.baseUrl === profile.baseUrl &&
    savedProfile.current?.protocol === profile.protocol,
  )
  const readModels = async () => {
    if (readingModels || busyRef.current) return
    const epoch = ++catalogEpoch.current
    setReadingModels(true)
    setMessage('')
    setFailure(false)
    try {
      const next = key.trim()
        ? await modelProfilesApi.modelsDraft(profile, key)
        : await modelProfilesApi.models(editing!)
      if (epoch !== catalogEpoch.current) return
      setModels(next)
      setManualModel(!next.includes(currentProfile.current.model))
      setMessage(next.length ? '模型目录已更新。' : '服务没有返回模型，可填写自定义模型 ID。')
    } catch (e) {
      if (epoch === catalogEpoch.current) {
        setMessage(errorMessage(e))
        setFailure(true)
      }
    } finally {
      if (epoch === catalogEpoch.current) setReadingModels(false)
    }
  }
  const input = (name: keyof AiProfile, label: string, type = 'text') => (
    <Field>
      <FieldLabel htmlFor={`ai-${name}`}>{label}</FieldLabel>
      <Input
        id={`ai-${name}`}
        aria-label={label}
        type={type}
        disabled={busy}
        value={String(profile[name] ?? '')}
        onChange={(e) => field(name, type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </Field>
  )
  const test = () =>
    run(async () => {
      if (!editing) return
      const request = crypto.randomUUID()
      setTesting(request)
      try {
        await modelProfilesApi.test(editing, request)
        onChange()
        setMessage('连接测试成功。')
      } finally {
        setTesting(null)
      }
    })

  return {
    ready,
    onChange,
    preferences,
    profile,
    key,
    setKey,
    busy,
    message,
    setMessage,
    failure,
    setFailure,
    models,
    manualModel,
    setManualModel,
    editing,
    dirty,
    setDirty,
    showKey,
    setShowKey,
    testing,
    readingModels,
    run,
    clearCatalog,
    field,
    matching,
    preset,
    check,
    load,
    fresh,
    selectProvider,
    cancel,
    savedConnection,
    readModels,
    input,
    test,
  }
}
const ApiSettingsContext = createContext<ReturnType<typeof useAiSettings> | null>(null)
export function ApiSettingsSession({ children, ...props }: Props & { children: ReactNode }) {
  const session = useAiSettings(props)
  return <ApiSettingsContext value={session}>{children}</ApiSettingsContext>
}
export function AiSettings(props: Props) {
  return (
    <ApiSettingsSession {...props}>
      <AiSettingsView />
    </ApiSettingsSession>
  )
}
export function AiSettingsView() {
  const session = useContext(ApiSettingsContext)
  if (!session) throw new Error('缺少会话上下文')
  const {
    ready,
    onChange,
    preferences,
    profile,
    key,
    setKey,
    busy,
    message,
    setMessage,
    failure,
    setFailure,
    models,
    manualModel,
    setManualModel,
    editing,
    dirty,
    setDirty,
    showKey,
    setShowKey,
    testing,
    readingModels,
    run,
    clearCatalog,
    field,
    matching,
    preset,
    check,
    load,
    fresh,
    selectProvider,
    cancel,
    savedConnection,
    readModels,
    input,
    test,
  } = session
  if (!ready)
    return (
      <p role="status" className="p-6">
        正在读取服务配置…
      </p>
    )
  return (
    <section aria-label="AI 服务设置" className="flex min-w-0 flex-col gap-6">
      <header className="settings-heading">
        <h1>模型与提供商</h1>
      </header>
      <div role="group" aria-label="API 提供商预设" className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <Button
            key={p[0]}
            variant={profile.service === p[0] ? 'secondary' : 'outline'}
            className="rounded-full"
            aria-pressed={profile.service === p[0]}
            disabled={busy || dirty}
            onClick={() => selectProvider(p[0])}
          >
            {p[1]}
          </Button>
        ))}
      </div>
      <section
        className="flex flex-col gap-6 rounded-xl border bg-sidebar p-5 sm:p-6"
        aria-label="当前提供商配置"
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <PlugIcon className="size-4 shrink-0" aria-hidden="true" />
            <h2 className="font-medium">{preset?.[1] ?? profile.service}</h2>
            {editing && preferences?.defaultProfileId === editing && (
              <span className="text-xs text-muted-foreground">默认</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editing && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || dirty || preferences?.defaultProfileId === editing}
                onClick={() =>
                  void run(async () => {
                    await modelProfilesApi.setDefault(editing)
                    onChange()
                  })
                }
              >
                设为默认
              </Button>
            )}
            {testing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void modelProfilesApi.cancelTest(testing).catch((e) => {
                    setMessage(errorMessage(e))
                    setFailure(true)
                  })
                }
              >
                停止测试
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={busy || dirty || !editing}
                onClick={() => void test()}
              >
                测试连接
              </Button>
            )}
          </div>
        </header>
        {matching.length > 0 && (
          <Field>
            <FieldLabel htmlFor="api-config">已配置服务</FieldLabel>
            <NativeSelect
              id="api-config"
              className="w-full"
              aria-label="已配置服务"
              disabled={busy || dirty}
              value={editing ?? 'new'}
              onChange={(e) => {
                if (e.target.value === 'new') fresh(profile.service)
                else
                  load(
                    matching.find((p) => p.id === e.target.value)!,
                    true,
                  )
              }}
            >
              <NativeSelectOption value="new">添加配置</NativeSelectOption>
              {matching.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.label}
                  {preferences?.defaultProfileId === p.id ? ' · 默认' : ''}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              const saved = editing
                ? await modelProfilesApi.updateProfile(profile, key)
                : await modelProfilesApi.configure(profile, key)
              load(saved, true)
              setMessage('配置已保存。')
              onChange(saved)
            })
          }}
          className="flex flex-col gap-5"
        >
          {input('label', 'AI 配置名称')}
          <Field>
            <FieldLabel htmlFor="ai-key">API Key</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="ai-key"
                aria-label="AI API Key"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                disabled={busy}
                required
                placeholder={editing ? '重新填写 API Key' : undefined}
                value={key}
                onChange={(e) => {
                  clearCatalog()
                  setKey(e.target.value)
                  setDirty(true)
                  setMessage('')
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                  aria-pressed={showKey}
                  disabled={busy}
                  onClick={() => setShowKey((value) => !value)}
                >
                  {showKey ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <p className="text-xs text-muted-foreground">
              API Key 明文保存在本机应用私有目录，不加入应用备份或导出。
            </p>
          </Field>
          {input('baseUrl', 'AI 服务地址')}
          <Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FieldLabel htmlFor="ai-model-select">模型</FieldLabel>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || readingModels || (!key.trim() && !savedConnection)}
                onClick={() => void readModels()}
              >
                {readingModels ? '正在读取…' : '读取模型目录'}
              </Button>
            </div>
            <NativeSelect
              id="ai-model-select"
              aria-label="AI 模型"
              className="w-full"
              disabled={busy}
              value={manualModel ? 'custom' : `model:${profile.model}`}
              onChange={(e) => {
                setManualModel(e.target.value === 'custom')
                if (e.target.value !== 'custom') field('model', e.target.value.slice(6))
              }}
            >
              {models.map((model) => (
                <NativeSelectOption key={model} value={`model:${model}`}>
                  {model}
                </NativeSelectOption>
              ))}
              <NativeSelectOption value="custom">自定义模型 ID（在下方填写）</NativeSelectOption>
            </NativeSelect>
            {manualModel && (
              <Input
                id="ai-model"
                aria-label="AI 模型 ID"
                placeholder="填写模型 ID"
                disabled={busy}
                value={profile.model}
                required
                onChange={(e) => field('model', e.target.value)}
              />
            )}
          </Field>
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">高级配置</summary>
            <FieldGroup className="mt-4 grid sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ai-protocol">协议</FieldLabel>
                <NativeSelect
                  id="ai-protocol"
                  aria-label="AI 协议"
                  disabled={busy}
                  value={profile.protocol}
                  onChange={(e) => field('protocol', e.target.value)}
                >
                  {[
                    ['responses', 'Responses'],
                    ['chat', 'Chat Completions'],
                    ['messages', 'Claude Messages'],
                    ['gemini', 'Gemini 原生'],
                  ].map(([v, n]) => (
                    <NativeSelectOption key={v} value={v}>
                      {n}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              {profile.service === 'openrouter' && input('downstream', 'OpenRouter 下游服务')}
              {input('contextChars', '上下文字符预算', 'number')}
              {input('maxOutputTokens', '最大输出 tokens', 'number')}
              {profile.protocol === 'chat' && (
                <Field>
                  <FieldLabel htmlFor="ai-output">输出预算参数</FieldLabel>
                  <NativeSelect
                    id="ai-output"
                    aria-label="输出预算参数"
                    value={profile.outputTokenParameter ?? 'max_tokens'}
                    disabled={busy}
                    onChange={(e) => field('outputTokenParameter', e.target.value)}
                  >
                    <NativeSelectOption value="max_tokens">max_tokens</NativeSelectOption>
                    <NativeSelectOption value="max_completion_tokens">
                      max_completion_tokens
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
              )}
            </FieldGroup>
          </details>
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button disabled={busy}>保存服务配置</Button>
            {(editing || dirty) && (
              <Button type="button" variant="outline" disabled={busy} onClick={cancel}>
                取消本次修改
              </Button>
            )}
            {editing && (
              <Button
                type="button"
                variant="ghost"
                className="ml-auto"
                disabled={busy || dirty}
                onClick={() =>
                  void run(async () => {
                    await modelProfilesApi.removeProfile(editing)
                    fresh(profile.service)
                    onChange()
                    setMessage('服务已停用。')
                  })
                }
              >
                停用
              </Button>
            )}
          </div>
        </form>
        <div className="flex flex-col gap-2">
          {busy && (
            <p role="status" className="text-sm">
              {testing ? '正在测试连接…' : '正在处理…'}
            </p>
          )}
          {message ? (
            <p
              role={failure ? 'alert' : 'status'}
              className={
                failure
                  ? 'whitespace-pre-wrap text-sm text-destructive'
                  : 'whitespace-pre-wrap text-sm'
              }
            >
              {message}
            </p>
          ) : (
            check && (
              <p className="text-xs text-muted-foreground">
                最近测试：{new Date(check.testedAt).toLocaleString()} · {check.error || '连接成功'}
              </p>
            )
          )}
          {editing && <p className="text-xs text-muted-foreground">测试可能消耗服务额度。</p>}
        </div>
      </section>
    </section>
  )
}
