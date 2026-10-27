# 可组合日期筛选组件

`ui/calendar.tsx` 是基础日历；本目录在其上提供完整日期条件面板、规则解析/匹配和动态日期 hook。共享层不导入日记 API、查询、存储或其他业务模块。

## 默认能力

`DateFilterContent` 是受控面板，可放进现有 Popover、Dialog 或页面；外层负责入口、宽度和开关。

- 字段：开始日期、结束日期。
- 条件：是、早于、晚于、不晚于、不早于、介于、相对于今天、为空白、不为空白。
- 快捷日期：今天、明天、昨天、一周前/后、一个月前/后、自定义日期输入及日历点选。
- 相对日期：过去/未来/本，天/周/月/年；保留区间预览、无效范围反馈、清除及键盘选择。

```tsx
const [value, setValue] = useState<DateCondition | null>(null)
<DateFilterContent value={value} onChange={setValue} />
```

`DateCondition.field` 决定比较数据的开始还是结束日期；`start/end` 是用户输入的筛选边界，并非被筛选记录本身的日期值。日期用本地日期字符串 YYYY-MM-DD，空值用 null，不使用 UTC 转换重新归档。

## 按场景启用

`capabilities` 提供 `fields`、`operators`、`shortcuts`、`relativeUnits`、`relativeDirections` 白名单。省略时启用该组全部能力；`shortcuts: []` 可关闭快捷菜单，其余组至少保留一个选项。字段可自定义标签，只有一个字段时不显示字段选择菜单；只有一个操作时也不显示条件下拉。当前 value 必须符合配置；无效配置明确报错，不自动换成其他筛选条件。

```tsx
<DateFilterContent
  value={value}
  onChange={setValue}
  capabilities={{
    fields: [{ value: 'start', label: '记录日期' }],
    operators: ['is', 'before', 'after', 'onOrBefore', 'onOrAfter', 'between', 'relative'],
  }}
/>
```

未启用的操作不会由日历交互偷偷开启。例如未启用 between 时，相对日期仍可预览区间，但不能通过点选日历生成区间条件。改变配置时由调用方同步提供符合新配置的 value。

## 规则与动态更新

- `resolveDateConstraint(value, now?)` 返回日期上下界；空/非空返回 presence: empty/nonempty。固定日期与区间边界含义明确，严格早于/晚于不含当天。
- `matchesDateCondition({start, end}, value, now?)` 对真实日期值执行字段选择、空值判断和比较；不是仅返回菜单文字。
- `useResolvedDateCondition(value, active?)` 在本地午夜、窗口聚焦及页面恢复可见时重算动态条件；inactive 时停止监听与计时。用于内容预览和消费方查询，卸载自动清理。
- 本周为周一至周日，本月/年为自然周期；过去/未来沿用一单位滚动窗口并排除今天，月末和闰日按目标月份末日收敛。

日记通过薄适配层只启用记录日期和适用的七种条件，转换为既有 dateFrom/dateTo；不改变日记数据模型。其他调用方可启用完整字段和空值能力，并使用规则引擎处理自己的数据。

日记编辑的记录日期复用同一面板，仅配置记录日期字段与 `operators: ['is']`、`shortcuts: []`，保留日期输入/清除/单日历，不显示快捷日期选择器；消费方将解析结果写为固定日期字符串（空值写为空字符串），不把动态快捷条件存入日记日期。完整筛选场景继续使用原配置。
