import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useChatView } from './ChatSessionProvider'
export const ChatDiaryPreviewPage = memo(function ChatDiaryPreviewPage() {
  const {
    verified,
    onOpenDiary,
    busy,
    error,
    preview,
    previewText,
    previewTitle,
    previewDate,
    profile,
    running,
    pendingCount,
    generate,
    adopt,
    closePreview,
    returnToChat,
    changeTitle,
    changeDate,
    changeText,
    undoAdoption,
  } = useChatView('preview')
  return preview && verified ? (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <section className="mx-auto flex max-w-4xl flex-col gap-5 p-6" aria-label="日记预览">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-medium">
            {preview.mode === 'append'
              ? '补充到日记'
              : preview.mode === 'rewrite'
                ? '重新整理全文'
                : '创建日记'}{' '}
            · 预览
          </h1>
          <Button variant="ghost" onClick={closePreview}>
            返回聊天
          </Button>
        </div>
        {preview.adoptedId && (
          <p role="status" className="text-sm">
            已保存到日记
          </p>
        )}
        {!preview.adoptedId && preview.mode === 'rewrite' && (
          <p className="text-sm text-muted-foreground">采用后替换日记正文。</p>
        )}
        {preview.mode !== 'create' && (
          <details>
            <summary className="cursor-pointer text-sm">查看修改前的日记</summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
              {preview.targetText || '原文不可用'}
            </p>
          </details>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="preview-title">标题</FieldLabel>
            <Input
              id="preview-title"
              aria-label="日记预览标题"
              disabled={Boolean(preview.adoptedId)}
              value={previewTitle}
              onChange={(e) => changeTitle(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="preview-date">日记日期</FieldLabel>
            <Input
              id="preview-date"
              aria-label="日记预览日期"
              type="date"
              disabled={Boolean(preview.adoptedId) || preview.mode !== 'create'}
              value={previewDate}
              onChange={(e) => changeDate(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="preview-text">
              {preview.mode === 'append' ? '新增段落' : '日记正文'}
            </FieldLabel>
            <Textarea
              id="preview-text"
              aria-label="日记预览正文"
              className="min-h-64"
              disabled={Boolean(preview.adoptedId)}
              value={previewText}
              onChange={(e) => changeText(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap gap-2">
          {preview.adoptedId ? (
            <>
              <Button onClick={() => onOpenDiary(preview.adoptedId!)}>打开日记</Button>
              {preview.canUndo && (
                <Button variant="outline" disabled={busy} onClick={undoAdoption}>
                  撤销本次修改
                </Button>
              )}
            </>
          ) : (
            <>
              <Button disabled={busy || !previewText.trim()} onClick={() => void adopt()}>
                {preview.mode === 'create'
                  ? '创建日记'
                  : preview.mode === 'append'
                    ? '加入日记'
                    : '采用修改'}
              </Button>
              <Button
                variant="outline"
                disabled={busy || running || pendingCount > 0 || !profile}
                onClick={() => void generate(preview.mode)}
              >
                重新生成
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  ) : (
    <div role="status" className="p-6">
      {error ? '预览无法打开，请返回聊天后核对。' : '正在读取日记预览…'}
      <Button variant="ghost" onClick={returnToChat}>
        返回聊天
      </Button>
    </div>
  )
})
