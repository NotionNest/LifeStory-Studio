import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { BaselineIcon, CheckIcon, HighlighterIcon, EraserIcon, PaletteIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const textColors = [
  [
    '中性色',
    [
      ['深灰', '#26272b'],
      ['灰色', '#70737b'],
      ['浅灰', '#a5a5b0'],
      ['石墨灰', '#42454d'],
      ['炭灰', '#565962'],
      ['银灰', '#858892'],
    ],
  ],
  [
    '暖色',
    [
      ['红色', '#b42318'],
      ['橙色', '#a34d00'],
      ['棕色', '#80552f'],
      ['玫红', '#a32d5f'],
      ['砖红', '#a3442b'],
      ['赭黄', '#81650c'],
    ],
  ],
  [
    '冷色',
    [
      ['绿色', '#167447'],
      ['蓝色', '#285ac4'],
      ['紫色', '#7043a2'],
      ['青色', '#0d6d70'],
      ['靛蓝', '#414ca0'],
      ['森林绿', '#3e6531'],
    ],
  ],
] as const
const backgroundColors = [
  [
    '中性色',
    [
      ['浅灰', '#e5e7eb'],
      ['灰色', '#cbd5e1'],
      ['深灰', '#94a3b8'],
      ['云灰', '#f1f5f9'],
      ['暖灰', '#e7e5e4'],
      ['石灰', '#d6d3d1'],
    ],
  ],
  [
    '暖色',
    [
      ['浅红', '#fecaca'],
      ['浅橙', '#fed7aa'],
      ['浅黄', '#fef08a'],
      ['浅粉', '#fbcfe8'],
      ['蜜桃', '#ffedd5'],
      ['米色', '#fef3c7'],
    ],
  ],
  [
    '冷色',
    [
      ['浅绿', '#bbf7d0'],
      ['浅蓝', '#bfdbfe'],
      ['浅紫', '#e9d5ff'],
      ['薄荷', '#ccfbf1'],
      ['浅青', '#cffafe'],
      ['淡靛蓝', '#c7d2fe'],
    ],
  ],
] as const

export function ColorPalette({
  editor,
  kind,
  color,
  disabled,
}: {
  editor: Editor | null
  kind: 'text' | 'background'
  color: string | null
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const applied = useRef(false)
  const label = kind === 'text' ? '文字颜色' : '背景颜色'
  const Icon = kind === 'text' ? BaselineIcon : HighlighterIcon
  const groups = kind === 'text' ? textColors : backgroundColors
  const customColor =
    color && !groups.some(([, colors]) => colors.some(([, value]) => value === color.toLowerCase()))
      ? color
      : null
  const apply = (value: string | null) => {
    if (!editor || disabled) return
    applied.current = true
    const chain = editor.chain().focus()
    if (kind === 'text') {
      if (value) chain.setColor(value).run()
      else chain.unsetColor().run()
    } else if (value) chain.setBackgroundColor(value).run()
    else chain.unsetBackgroundColor().run()
    setOpen(false)
  }
  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={label} disabled={disabled}>
          <Icon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-60 gap-1 p-3"
        aria-label={label}
        onCloseAutoFocus={(event) => {
          if (applied.current) {
            applied.current = false
            event.preventDefault()
            editor?.commands.focus()
          }
        }}
      >
        {groups.map(([group, colors]) => (
          <div className="color-palette-group" key={group}>
            <span className="color-palette-label">{group}</span>
            <div className="color-palette-swatches" role="group" aria-label={`${label}：${group}`}>
              {colors.map(([name, value]) => (
                <button
                  key={value}
                  type="button"
                  className="color-palette-swatch"
                  style={{ backgroundColor: value }}
                  aria-label={`${name} ${value}`}
                  aria-pressed={color?.toLowerCase() === value}
                  title={name}
                  onClick={() => apply(value)}
                >
                  {color?.toLowerCase() === value && <CheckIcon aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="color-palette-actions">
          <Button
            type="button"
            size="icon-sm"
            variant={!color ? 'secondary' : 'ghost'}
            aria-label={kind === 'text' ? '默认颜色' : '清除背景色'}
            aria-pressed={!color}
            onClick={() => apply(null)}
          >
            <EraserIcon aria-hidden="true" />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="color-palette-custom-icon">
                <PaletteIcon aria-hidden="true" />
                {customColor && (
                  <span
                    className="color-palette-current"
                    style={{ backgroundColor: customColor }}
                    aria-label={`当前自定义颜色 ${customColor}`}
                  >
                    <CheckIcon aria-hidden="true" />
                  </span>
                )}
                <input
                  type="color"
                  aria-label={`${label}：更多颜色`}
                  value={
                    color && /^#[0-9a-f]{6}$/i.test(color)
                      ? color
                      : kind === 'text'
                        ? '#26272b'
                        : '#fef08a'
                  }
                  onChange={(event) => apply(event.target.value)}
                />
              </label>
            </TooltipTrigger>
            <TooltipContent>更多颜色</TooltipContent>
          </Tooltip>
        </div>
      </PopoverContent>
    </Popover>
  )
}
