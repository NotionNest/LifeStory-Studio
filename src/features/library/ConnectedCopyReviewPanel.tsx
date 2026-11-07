import { useEffect, useRef, useState } from 'react'
import type { useEditor } from '@tiptap/react'
import { ModelControls } from '@/components/ModelControls'
import { useModelProfiles } from '@/contexts/ModelProfilesContext'
import type { ModelSelection } from '@/services/modelProfiles'
import { requestCopyReview } from '@/services/copyReview'
import { CopyReviewPanel } from './CopyReviewPanel'
import { reviewTextBlocks } from './copyReviewDocument'
import { resolveReviewResult } from './copyReviewResult'

type Editor = NonNullable<ReturnType<typeof useEditor>>
const selectionKey = 'lifestory.copyReview.model'
function readSelection(): { profileId: string; selection: ModelSelection } | null {
  try {
    const value = JSON.parse(localStorage.getItem(selectionKey) ?? 'null')
    if (
      typeof value?.profileId === 'string' &&
      value.profileId &&
      (typeof value.selection?.model === 'string' || value.selection?.model === null) &&
      (typeof value.selection?.reasoningEffort === 'string' ||
        value.selection?.reasoningEffort === null)
    )
      return value
  } catch {
    // Invalid or inaccessible preferences do not identify a service.
  }
  return null
}
export function ConnectedCopyReviewPanel({
  editor,
  recordId,
  readOnly,
}: {
  editor: Editor
  recordId: string
  readOnly: boolean
}) {
  const { profiles, preferences, profilesLoaded } = useModelProfiles()
  const [saved] = useState(readSelection)
  const [profileId, setProfileId] = useState(saved?.profileId ?? '')
  const [selection, setSelection] = useState<ModelSelection | undefined>(saved?.selection)
  const selectedProfile = useRef(profileId)
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    if (!profileId && preferences.defaultProfileId) {
      selectedProfile.current = preferences.defaultProfileId
      setProfileId(preferences.defaultProfileId)
    }
  }, [preferences.defaultProfileId, profileId])
  const profile = profiles.find(
    (entry) => entry.id === profileId && !entry.label.startsWith('[已停用]'),
  )
  const model = selection?.model ?? (profile?.cliModelMode === 'inherit' ? null : profile?.model)
  const available = Boolean(profile && model && (profile.protocol === 'codex' || profile.hasKey))
  const modelControls = (compact: boolean) => (
    <ModelControls
      context="审查"
      compact={compact}
      active={profilesLoaded}
      profiles={profiles}
      profileId={profileId}
      selection={selection}
      disabled={readOnly}
      onProfile={(id) => {
        selectedProfile.current = id
        setProfileId(id)
      }}
      onSelection={(value) => {
        setSelection(value)
        try {
          localStorage.setItem(
            selectionKey,
            JSON.stringify({ profileId: selectedProfile.current, selection: value }),
          )
          setStorageError(false)
        } catch {
          setStorageError(true)
        }
      }}
    />
  )
  return (
    <CopyReviewPanel
      editor={editor}
      readOnly={readOnly}
      modelControls={modelControls(false)}
      compactModelControls={modelControls(true)}
      preferenceError={storageError ? '模型选择未能保存' : undefined}
      requestReview={
        available
          ? async (signal) => {
              const doc = editor.state.doc
              const blocks = reviewTextBlocks(doc)
              if (!blocks.some((block) => block.text.trim())) throw new Error('正文没有可审查文字')
              const result = await requestCopyReview(
                recordId,
                profileId,
                selection ?? null,
                blocks,
                signal,
              )
              return resolveReviewResult(doc, blocks, result).map((item) => ({
                id: item.id,
                type: item.type,
                quote: item.references[0].quote,
                reason: item.reason,
                replacement: item.replacement ?? undefined,
                references: item.references.map((reference) => ({
                  quote: reference.quote,
                  from: reference.from,
                  replaceable: reference.replaceable,
                })),
              }))
            }
          : undefined
      }
    />
  )
}
