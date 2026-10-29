export function SearchHighlight({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword) return <>{text}</>
  const index = text.toLowerCase().indexOf(keyword.toLowerCase())
  return index < 0 ? (
    <>{text}</>
  ) : (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-primary/15 text-foreground">
        {text.slice(index, index + keyword.length)}
      </mark>
      {text.slice(index + keyword.length)}
    </>
  )
}
