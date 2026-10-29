import { type AiWorkspace, type ChatSummary } from '@/services/chats'
import { type RecordFile } from '@/services/records'
import { type SearchItem } from '@/services/search'
import { type DeleteImpact } from '@/services/trash'
import { useRef, useState } from 'react'
import type { ModelSelection } from '@/services/modelProfiles'
import type { MessageLocation } from './chatTypes'
export function useChatState(defaultProfileId: string | null) {
  const pendingAddress = useRef<{
    chat: string | null
    replace: boolean
    preview: string | null
  } | null>(null)
  const [workspace, setWorkspace] = useState<AiWorkspace | null>(null)
  const [profileId, setProfileId] = useState('')
  const [text, setText] = useState('')
  const [sources, setSources] = useState<string[]>([])
  const [items, setItems] = useState<SearchItem[]>([])
  const [sourceKeyword, setSourceKeyword] = useState('')
  const [sourceNext, setSourceNext] = useState<number | null>(null)
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [materialOpen, setMaterialOpen] = useState(false)
  const [target, setTarget] = useState<string | null>(null)
  const [targetRecord, setTargetRecord] = useState<RecordFile | null>(null)
  const [rename, setRename] = useState<string | null>(null)
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null)
  const [compare, setCompare] = useState<string | null>(null)
  const [selection, setSelection] = useState<ModelSelection | undefined>(undefined)
  const [localActions, setLocalActions] = useState<HTMLDivElement | null>(null)
  const [targetOpen, setTargetOpen] = useState(false)
  const [latestVersion, setLatestVersion] = useState(0)
  const [atLatest, setAtLatest] = useState(true)
  const [location, setLocation] = useState<MessageLocation | null>(null)
  const contextDiary = useRef<string | null>(null)
  const diaryChats = useRef(new Map<string, string>())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const loadedChat = useRef<string | null>(null)
  // 权威读取完成后需触发队列调度，不能只更新 ref。
  const [readyChatId, setReadyChatId] = useState<string | null>(null)
  const alive = useRef(true)
  const current = useRef<string | null>(null)
  const loadedKey = useRef<string | null>(null)
  const listSeq = useRef(0)
  const materialSeq = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const drafts = useRef(
    new Map<
      string,
      {
        text: string
        sources: string[]
        profileId: string
        selection?: ModelSelection
      }
    >(),
  )
  const busyRef = useRef(false)
  const previousDefault = useRef(defaultProfileId)
  const sourceInput = useRef<HTMLInputElement>(null)
  return {
    pendingAddress,
    workspace,
    setWorkspace,
    profileId,
    setProfileId,
    text,
    setText,
    sources,
    setSources,
    items,
    setItems,
    sourceKeyword,
    setSourceKeyword,
    sourceNext,
    setSourceNext,
    chats,
    setChats,
    next,
    setNext,
    busy,
    setBusy,
    loading,
    setLoading,
    error,
    setError,
    notice,
    setNotice,
    materialOpen,
    setMaterialOpen,
    target,
    setTarget,
    targetRecord,
    setTargetRecord,
    rename,
    setRename,
    deleteImpact,
    setDeleteImpact,
    compare,
    setCompare,
    selection,
    setSelection,
    localActions,
    setLocalActions,
    targetOpen,
    setTargetOpen,
    location,
    setLocation,
    latestVersion,
    setLatestVersion,
    atLatest,
    setAtLatest,
    contextDiary,
    diaryChats,
    inputRef,
    loadedChat,
    readyChatId,
    setReadyChatId,
    alive,
    current,
    loadedKey,
    listSeq,
    materialSeq,
    fileInput,
    drafts,
    busyRef,
    previousDefault,
    sourceInput,
  }
}
