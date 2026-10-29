import { memo } from 'react'
import { ChatModelControls } from './ChatModelControls'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { ArrowUpIcon, PlusIcon, ImagePlusIcon, BookOpenIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group'
import { useChatView } from './ChatSessionProvider'
import { ChatQueue } from './ChatQueue'
import { ChatMaterialPicker } from './ChatMaterialPicker'
export const ChatComposer = memo(function ChatComposer() {
  const {
    id,
    active,
    profiles,
    onSettings,
    onOpenDiary,
    contextSources,
    profileId,
    text,
    sources,
    busy,
    compare,
    selection,
    inputRef,
    previewPending,
    fileInput,
    profile,
    running,
    send,
    stop,
    importFiles,
    openMaterials,
    sourceTitles,
    removeSource,
    changeText,
    changeProfile,
    changeSelection,
    compareSource,
    closeCompare,
  } = useChatView('composer')
  return (
    <div className="mx-auto flex w-full max-w-4xl shrink-0 flex-col gap-3 px-5 pb-5">
      <ChatQueue />
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sources.map((source) => (
            <Button
              key={source}
              size="sm"
              variant="secondary"
              className="h-auto max-w-full whitespace-normal"
              disabled={busy || running}
              onClick={() => removeSource(source)}
            >
              日记：{sourceTitles[source] || '已选日记'} ×
            </Button>
          ))}
        </div>
      )}
      <ChatMaterialPicker />
      {!profile && (
        <p className="text-sm text-muted-foreground">
          {profiles.some((p) => !p.label.startsWith('[已停用]'))
            ? '请选择 AI 服务'
            : '未配置 AI 服务'}
          <Button variant="link" size="sm" onClick={onSettings}>
            前往设置
          </Button>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (!busy && !running) void importFiles(Array.from(e.dataTransfer.files))
        }}
      >
        <InputGroup className="rounded-3xl border-input/80 bg-background shadow-sm has-[[data-slot=input-group-control]:focus-visible]:border-input/80 has-[[data-slot=input-group-control]:focus-visible]:ring-0">
          <InputGroupTextarea
            className="min-h-20 max-h-56 overflow-y-auto px-4 pt-4 pb-2"
            ref={inputRef}
            aria-label="聊天输入"
            placeholder="输入消息…"
            value={text}
            disabled={busy}
            onChange={(e) => changeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === '@' && !e.nativeEvent.isComposing && !e.metaKey && !e.ctrlKey) {
                e.preventDefault()
                openMaterials()
                return
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (profile && text.trim() && !busy) void send()
              }
            }}
            onPaste={(e) => {
              const images = Array.from(e.clipboardData.files).filter((f) =>
                f.type.startsWith('image/'),
              )
              if (images.length && !busy && !running) {
                e.preventDefault()
                void importFiles(images)
              }
            }}
          />
          <InputGroupAddon align="block-end" className="flex-wrap gap-1 px-3 pt-0 pb-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <InputGroupButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="添加附件"
                  title="添加附件"
                  className="rounded-full"
                  disabled={busy || running}
                >
                  <PlusIcon />
                </InputGroupButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" sideOffset={4}>
                <DropdownMenuItem disabled={!id} onSelect={() => fileInput.current?.click()}>
                  <ImagePlusIcon aria-hidden="true" />
                  添加图片
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={openMaterials}>
                  <BookOpenIcon aria-hidden="true" />
                  附加日记
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ChatModelControls
              active={active}
              profiles={profiles}
              profileId={profileId}
              selection={selection}
              disabled={busy || running}
              onProfile={changeProfile}
              onSelection={changeSelection}
            />
            {running && (
              <InputGroupButton
                type="button"
                aria-label="停止生成"
                title="停止生成"
                className="shrink-0 rounded-full"
                size="icon-sm"
                variant="secondary"
                disabled={busy}
                onClick={stop}
              >
                <SquareIcon />
              </InputGroupButton>
            )}
            <InputGroupButton
              type="submit"
              aria-label="发送消息"
              title="发送消息"
              variant="default"
              className="shrink-0 rounded-full"
              size="icon-sm"
              disabled={busy || previewPending || !profile || !text.trim()}
            >
              <ArrowUpIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          multiple
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            void importFiles(files)
          }}
        />
      </form>
      {Boolean(contextSources?.length) && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">来源与关联</summary>
          <div className="flex flex-col gap-2 pt-3">
            {contextSources?.map((source) => (
              <div
                key={`${source.id}:${source.revisionId}`}
                className="flex flex-wrap items-center gap-1 text-xs"
              >
                {source.unavailable ? '来源已删除' : source.title || '无标题日记'}
                {!source.unavailable && (
                  <>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => compareSource(source.id, source.revisionId!)}
                    >
                      查看当时版本
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => onOpenDiary(source.id)}>
                      打开日记
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
          {compare !== null && (
            <section className="mt-3 max-h-48 overflow-y-auto">
              <Button size="xs" variant="ghost" onClick={closeCompare}>
                收起来源
              </Button>
              <p className="whitespace-pre-wrap text-xs leading-6">{compare}</p>
            </section>
          )}
        </details>
      )}
    </div>
  )
})
