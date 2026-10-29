import { trashApi } from '@/services/trash'
import { aiTasksApi, type AiTask } from '@/services/aiTasks'
import type { ModelSelection } from '@/services/modelProfiles'
import { chatsApi, type ChatWindowRequest } from '@/services/chats'
import { recordsApi } from '@/services/records'
import { searchApi } from '@/services/search'
import { useLocation, useNavigate } from 'react-router'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useModelProfiles } from '@/contexts/ModelProfilesContext'
import { useSearchLocation } from '@/features/search/SearchLocationContext'
import { useDiaryActions } from '@/features/library/DiaryActions'
import { useLeaveStatus } from '@/contexts/LeaveProtectionContext'
import { chatRoute, dockPath, paths, locationPath } from '@/router/paths'
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef } from 'react'
import { errorMessage } from '@/lib/errors'
import { emptyFilters } from '@/features/library/useLibraryQuery'
import { useChatState } from './useChatState'
import { useChatTask } from './useChatTask'
import { historyRequest, mergeHistory } from './chatHistory'
import { useChatQueue } from './useChatQueue'
import { useChatPreview } from './useChatPreview'
export function useChatSession() {
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const studio = useWorkspace()
  const status = useLeaveStatus()
  const modelProfiles = useModelProfiles()
  const searchKeyword = useSearchLocation()
  const diaryActions = useDiaryActions()
  const { profiles, preferences } = modelProfiles
  const route = chatRoute(routerLocation)
  const lastRoute = useRef(route)
  const state = useChatState(preferences.defaultProfileId)
  const {
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
  } = state
  if (route.active) lastRoute.current = route
  const selectedRoute = route.active ? route : lastRoute.current
  const id = selectedRoute.chatId
  const active = route.active
  const titlebarTarget = route.docked ? null : studio.titlebarTarget
  const sidebarOpen = !route.docked && studio.sidebarOpen
  const onClose = route.docked ? () => void navigate(paths.diary(route.diaryId!)) : undefined
  const withSavedDiary = route.docked ? diaryActions.withSavedDiary : undefined
  const onSettings = () =>
    void navigate(paths.cli, { state: { returnTo: locationPath(routerLocation) } })
  const onOpenDiary = (record: string) =>
    void navigate(paths.diary(record), {
      state: { returnTo: route.docked ? paths.chat(id!) : locationPath(routerLocation) },
    })
  const setChatAddress = (chat: string | null, replace = false, preview: string | null = null) => {
    if (status.isBusy()) {
      pendingAddress.current = { chat, replace, preview }
      return
    }
    const to = selectedRoute.docked
      ? dockPath(selectedRoute.diaryId!, chat, preview)
      : preview && chat
        ? paths.preview(chat, preview)
        : chat
          ? paths.chat(chat)
          : paths.newChat
    void navigate(to, { replace })
  }
  useEffect(() => {
    setTargetOpen(false)
  }, [id, active, setTargetOpen])
  const draftKey = () =>
    current.current ?? (contextDiary.current ? `diary:${contextDiary.current}` : 'new')
  const savedDiaryAction = async (action: () => Promise<void>) => {
    if (withSavedDiary) await withSavedDiary(action)
    else await action()
  }
  useEffect(() => {
    if (active && !route.messageId) inputRef.current?.focus()
  }, [active, id, routerLocation.key, route.messageId, inputRef])
  const profile = profiles.find((p) => p.id === profileId && !p.label.startsWith('[已停用]'))
  const running = workspace?.task?.status === 'running'
  const task = workspace?.task
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [alive])
  const refreshChats = useCallback(
    async (offset = 0) => {
      const seq = ++listSeq.current
      setLoading(true)
      try {
        const page = await chatsApi.chats('', offset)
        if (alive.current && seq === listSeq.current) {
          setChats((old) =>
            offset
              ? [...old, ...page.items.filter((i) => !old.some((o) => o.id === i.id))]
              : page.items,
          )
          setNext(page.nextOffset)
        }
      } catch (e) {
        if (alive.current && seq === listSeq.current) setError(errorMessage(e))
      } finally {
        if (alive.current && seq === listSeq.current) setLoading(false)
      }
    },
    [alive, listSeq, setLoading, setChats, setNext, setError],
  )
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    status.setBusy(true)
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      if (alive.current) setError(errorMessage(e))
    } finally {
      busyRef.current = false
      status.setBusy(false)
      if (alive.current) setBusy(false)
      const address = pendingAddress.current
      pendingAddress.current = null
      if (address) setChatAddress(address.chat, address.replace, address.preview)
    }
  }
  const history = useRef({ workspace, atLatest })
  useLayoutEffect(() => {
    history.current = { workspace, atLatest }
  }, [workspace, atLatest])
  const readWorkspace = useCallback(async (record: string, input?: ChatWindowRequest) => {
    const { workspace: previous, atLatest } = history.current
    if (
      !previous ||
      previous.id !== record ||
      input?.around ||
      (input && !input.before && !input.after)
    )
      return chatsApi.workspace(record, input)
    const incoming = await chatsApi.workspace(record, input ?? historyRequest(previous))
    return mergeHistory(
      previous,
      incoming,
      input?.before ? 'before' : input?.after ? 'after' : 'updates',
      atLatest,
    )
  }, [])
  const { refresh, loadWindow } = useChatTask({
    readWorkspace,
    sessionKey: `${active}:${selectedRoute.diaryId ?? ''}:${id ?? ''}:${routerLocation.key}`,
    current,
    alive,
    setWorkspace,
    running: running && readyChatId === id,
    setError,
  })
  const isCurrent = useCallback(
    (chatId: string | null) => alive.current && current.current === chatId,
    [alive, current],
  )
  const currentChat = useCallback(() => current.current, [current])
  const previewSession = useChatPreview({
    id,
    active,
    previewId: route.previewId,
    task,
    profileId: profile?.id,
    hasPending: () => queueSession.pending.length > 0,
    target,
    selection,
    sources,
    run,
    savedDiaryAction,
    refresh,
    refreshChats,
    showChat: (chat, previewId) => setChatAddress(chat, false, previewId ?? null),
    reportError: setError,
    onDiaryChanged: (recordId, message) => {
      setTarget(recordId)
      setNotice(message)
    },
    isCurrent,
    currentChat,
  })
  const { preview, previewText, previewTitle, previewDate } = previewSession.view
  const { reconcileWorkspace } = previewSession.lifecycle
  const previewActions = previewSession.actions
  const queueSession = useChatQueue({
    id,
    canDispatch:
      active &&
      readyChatId === id &&
      !route.previewId &&
      !preview &&
      !busy &&
      !running &&
      workspace?.id === id,
    previewPending: previewSession.pending,
    running,
    task,
    profileId: profile?.id,
    text,
    sources,
    selection,
    isBusy: () => busyRef.current,
    clearInput: () => setText(''),
    onSent: async (sent: AiTask, queued: boolean) => {
      if (!queued) {
        setText('')
        drafts.current.delete(draftKey())
        setLocation(null)
      }
      if (contextDiary.current) diaryChats.current.set(contextDiary.current, sent.recordId)
      drafts.current.set(sent.recordId, {
        text: queued ? text : '',
        sources: [...sources],
        profileId,
        selection,
      })
      if (!id) {
        loadedKey.current = `${contextDiary.current ?? 'global'}:${sent.recordId}`
        setChatAddress(sent.recordId, true)
      }
      current.current = sent.recordId
      setWorkspace((old) => (old?.id === sent.recordId ? { ...old, task: sent } : null))
      if (queued) {
        await refresh()
        void refreshChats()
        return
      }
      const w = await chatsApi.workspace(sent.recordId)
      setWorkspace(w)
      setLatestVersion((value) => value + 1)
      setAtLatest(true)
      const used = w.effectiveModel
        ? { model: w.effectiveModel, reasoningEffort: w.effectiveEffort ?? null }
        : selection
      setSelection(used)
      drafts.current.set(sent.recordId, {
        text: '',
        sources: [...sources],
        profileId,
        selection: used,
      })
      void refreshChats()
    },
    run,
    savedDiaryAction,
    refresh,
  })
  const { pending, editingQueue, queueBlocked } = queueSession
  const queueActions = queueSession.actions
  useEffect(() => {
    if (active) void refreshChats()
  }, [active, refreshChats])
  const onReconcileWorkspace = useEffectEvent(
    (chatId: string, value: Parameters<typeof reconcileWorkspace>[1], valid: () => boolean) =>
      reconcileWorkspace(chatId, value, valid),
  )
  useEffect(() => {
    setReadyChatId(null)
    if (!id || !active) return
    let valid = true
    setWorkspace((old) => (old?.id === id ? old : null))
    void (async () => {
      try {
        const w = await chatsApi.workspace(id, route.messageId ? { around: route.messageId } : {})
        if (!valid) return
        setReadyChatId(id)
        setWorkspace(w)
        setAtLatest(!route.messageId)
        if (route.messageId)
          setLocation({
            messageId: route.messageId,
            keyword: searchKeyword.current,
            nonce: Date.now(),
          })
        if (loadedChat.current !== id && !drafts.current.has(id)) {
          setProfileId(w.profileId ?? '')
          setSelection(
            w.effectiveModel
              ? { model: w.effectiveModel, reasoningEffort: w.effectiveEffort ?? null }
              : undefined,
          )
          setSources(w.contextIds ?? [])
        } else {
          setSources((old) =>
            old.filter((source) => !w.sources.some((s) => s.id === source && s.unavailable)),
          )
        }
        loadedChat.current = id
        if (!(await onReconcileWorkspace(id, w, () => valid))) return
        if (w.linkedDiaryId) {
          setTarget(w.linkedDiaryId)
          try {
            const r = await recordsApi.read(w.linkedDiaryId)
            if (valid) setTargetRecord(r)
          } catch {
            if (valid) setTargetRecord(null)
          }
        }
      } catch (e) {
        if (valid) setError(errorMessage(e))
      }
    })()
    return () => {
      valid = false
    }
  }, [
    id,
    active,
    setReadyChatId,
    setAtLatest,
    route.messageId,
    routerLocation.key,
    searchKeyword,
    setLocation,
    setWorkspace,
    loadedChat,
    drafts,
    setProfileId,
    setSelection,
    setSources,
    setTarget,
    setTargetRecord,
    setError,
  ])
  useEffect(() => {
    const before = previousDefault.current
    previousDefault.current = preferences.defaultProfileId
    if (
      !id &&
      preferences.defaultProfileId &&
      (!profileId ||
        (before !== preferences.defaultProfileId &&
          profileId === before &&
          profiles.some((p) => p.id === before && p.label.startsWith('[已停用]'))))
    )
      setProfileId(preferences.defaultProfileId)
  }, [id, profileId, profiles, preferences.defaultProfileId, previousDefault, setProfileId])
  const stash = () => {
    drafts.current.set(draftKey(), {
      text,
      sources,
      profileId,
      selection,
    })
    previewSession.lifecycle.stash(current.current)
  }
  const loadChat = useEffectEvent((nextId: string | null, context: string | null = null) => {
    if (busyRef.current) return
    const selected = nextId
    const key = `${context ?? 'global'}:${selected ?? 'new'}`
    if (loadedKey.current === key) return
    if (loadedKey.current !== null) stash()
    loadedKey.current = key
    setLocation(null)
    previewSession.lifecycle.reset()
    loadedChat.current = null
    contextDiary.current = context
    current.current = selected
    const saved = drafts.current.get(selected ?? (context ? `diary:${context}` : 'new'))
    setSelection(saved?.selection)
    setWorkspace(null)
    setText(saved?.text ?? '')
    setSources(saved?.sources ?? (context ? [context] : []))
    setProfileId(saved?.profileId ?? (!selected ? (preferences.defaultProfileId ?? '') : ''))
    setTarget(context)
    setTargetRecord(null)
    setRename(null)
    setCompare(null)
    setError('')
    setNotice('')
    queueSession.resetRequest()
  })
  const switchChat = (chat: string | null) => {
    if (!busyRef.current) setChatAddress(chat)
  }
  useEffect(() => {
    if (!active) return
    let valid = true
    loadChat(route.chatId, route.diaryId)
    current.current = route.chatId
    if (route.diaryId)
      void recordsApi
        .read(route.diaryId)
        .then((record) => {
          if (valid) setTargetRecord(record)
        })
        .catch((e) => {
          if (valid) setError(errorMessage(e))
        })
    return () => {
      valid = false
    }
  }, [
    active,
    id,
    route.chatId,
    route.diaryId,
    route.messageId,
    routerLocation.key,
    current,
    searchKeyword,
    setTargetRecord,
    setError,
    setLocation,
  ])
  useLayoutEffect(() => {
    status.setDraft(
      queueSession.hasDrafts ||
        Boolean(text.trim()) ||
        previewSession.lifecycle.hasDrafts() ||
        [...drafts.current.values()].some((d) => d.text.trim()),
    )
    status.setBusy(busy)
  })
  useEffect(() => {
    if (materialOpen) {
      const frame = requestAnimationFrame(() => sourceInput.current?.focus())
      return () => cancelAnimationFrame(frame)
    }
  }, [materialOpen, sourceInput])
  const queryMaterials = async (offset = 0, keyword = sourceKeyword) => {
    const seq = ++materialSeq.current
    try {
      const page = await searchApi.query({
        ...emptyFilters,
        keyword,
        month: null,
        offset,
      })
      if (alive.current && seq === materialSeq.current) {
        setItems((old) =>
          offset
            ? [...old, ...page.items.filter((i) => !old.some((o) => o.id === i.id))]
            : page.items,
        )
        setSourceNext(page.nextOffset)
      }
    } catch (e) {
      if (alive.current) setError(errorMessage(e))
    }
  }
  const openMaterials = () => {
    setSourceKeyword('')
    setMaterialOpen(true)
    void queryMaterials(0, '')
  }
  const closeMaterials = () => {
    setMaterialOpen(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  const importFiles = (files: File[]) =>
    run(async () => {
      if (!id) throw new Error('先发送一条讲述，再添加本地图片')
      const failures: string[] = []
      for (const file of files) {
        try {
          await chatsApi.importImage(id, file)
        } catch (e) {
          failures.push(`${file.name}：${errorMessage(e)}`)
        }
      }
      await refresh()
      if (failures.length) throw new Error(failures.join('\n'))
    })
  const sourceTitles = useMemo(() => {
    const titles: Record<string, string> = {}
    for (const source of workspace?.sources ?? []) titles[source.id] = source.title || '已选日记'
    for (const item of items) titles[item.id] = item.title || titles[item.id] || '已选日记'
    if (targetRecord) titles[targetRecord.id] = targetRecord.title || '无标题日记'
    return titles
  }, [workspace?.sources, items, targetRecord])
  const availablePreview =
    workspace?.previewTaskId ?? (id ? previewSession.lifecycle.cachedTaskId(id) : null)
  const canMakeDiary = !!id && !!workspace?.page.hasUserText
  const deleted = () => {
    setDeleteImpact(null)
    for (const [diary, chat] of diaryChats.current) {
      if (chat === id) diaryChats.current.delete(diary)
    }
    queueSession.forget(id!)
    drafts.current.delete(id!)
    previewSession.lifecycle.forget(id!)
    previewSession.lifecycle.reset()
    setSelection(undefined)
    setChatAddress(null, true)
    setWorkspace(null)
    setText('')
    setSources(contextDiary.current ? [contextDiary.current] : [])
    setTarget(contextDiary.current)
    void refreshChats()
  }
  const saveRename = () =>
    void run(async () => {
      await chatsApi.rename(id!, rename!)
      setRename(null)
      await refresh()
      await refreshChats()
    })
  const verifyState = () =>
    void run(async () => {
      await refresh()
      await refreshChats()
    })
  const selectTarget = (value: string | null) => {
    setTarget(value)
    setTargetRecord(null)
  }
  const chooseTarget = () => {
    setTargetOpen(true)
    void queryMaterials(0, '')
  }
  const startRename = () => setRename(workspace?.title || '')
  const requestDeletion = () =>
    void run(async () => setDeleteImpact(await trashApi.trashImpact(id!)))
  const located = () => setLocation((old) => (old ? { ...old, located: true } : null))
  const missing = () => {
    setLocation(null)
    setError('命中的消息已不存在，请重新搜索。')
  }
  const followLatest = () => {
    if (location) setLocation({ ...location, follow: true })
  }
  const resetLocation = async () => {
    if (!(await loadWindow({}))) return false
    setLocation(null)
    setAtLatest(true)
    setLatestVersion((value) => value + 1)
    return true
  }
  const retrySave = () =>
    void run(async () => {
      await aiTasksApi.retrySave(task!.id)
      await refresh()
    })
  const removeSource = (source: string) => setSources((old) => old.filter((s) => s !== source))
  const changeText = (value: string) => {
    setText(value)
    queueSession.resetRequest()
  }
  const changeProfile = (value: string) => {
    setProfileId(value)
    setSelection(undefined)
    queueSession.resetRequest()
  }
  const changeSelection = (value: ModelSelection) => {
    setSelection(value)
    queueSession.resetRequest()
  }
  const compareSource = (sourceId: string, revisionId: string) =>
    void run(async () => setCompare(await aiTasksApi.compare(id!, sourceId, revisionId)))
  const closeCompare = () => setCompare(null)
  const changeKeyword = (value: string) => setSourceKeyword(value)
  const chooseSource = (sourceId: string, checked: boolean) =>
    setSources((old) => (checked ? [...old, sourceId] : old.filter((s) => s !== sourceId)))
  return {
    navigation: {
      previewOpen: Boolean(route.previewId),
      diaryChatAddress: (diaryId: string) =>
        dockPath(diaryId, diaryChats.current.get(diaryId) ?? null),
    },
    shell: {
      id,
      active,
      titlebarTarget,
      sidebarTrigger: studio.sidebarTrigger,
      sidebarOpen,
      onClose,
      setChatAddress,
      title: workspace?.title ?? null,
      items,
      sourceNext,
      chats,
      next,
      busy,
      loading,
      error,
      notice,
      target,
      rename,
      setRename,
      deleteImpact,
      setDeleteImpact,
      localActions,
      setLocalActions,
      targetOpen,
      setTargetOpen,
      refreshChats,
      switchChat,
      queryMaterials,
      sourceTitles,
      availablePreview,
      canMakeDiary,
      previewOpen: Boolean(route.previewId),
      running,
      pendingCount: pending.length,
      profile,
      generate: previewActions.generate,
      chooseTarget,
      startRename,
      requestDeletion,
      deleted,
      saveRename,
      verifyState,
      selectTarget,
    },
    messages: {
      id,
      workspace,
      task,
      running,
      busy,
      location,
      located,
      missing,
      followLatest,
      resetLocation,
      latestVersion,
      loadWindow,
      atLatest,
      setAtLatest,
      retrySave,
    },
    composer: {
      id,
      active,
      profiles,
      onSettings,
      onOpenDiary,
      contextSources: workspace?.sources ?? null,
      profileId,
      text,
      sources,
      busy,
      compare,
      selection,
      inputRef,
      previewPending: previewSession.pending,
      fileInput,
      profile,
      running,
      send: queueActions.send,
      stop: queueActions.stop,
      importFiles,
      openMaterials,
      sourceTitles,
      removeSource,
      changeText,
      changeProfile,
      changeSelection,
      compareSource,
      closeCompare,
    },
    queue: {
      pending,
      queueBlocked,
      editingQueue,
      taskStatus: task?.status,
      busy,
      running,
      continueQueue: queueActions.continueQueue,
      changeQueueText: queueActions.changeQueueText,
      cancelQueueEdit: queueActions.cancelQueueEdit,
      editQueue: queueActions.editQueue,
      removeQueue: queueActions.removeQueue,
      saveQueueEdit: queueActions.saveQueueEdit,
    },
    materials: {
      materialOpen,
      sourceInput,
      sourceKeyword,
      items,
      sources,
      sourceNext,
      busy,
      running,
      closeMaterials,
      queryMaterials,
      changeKeyword,
      chooseSource,
    },
    preview: {
      verified: previewSession.view.verified,
      onOpenDiary,
      busy,
      error,
      preview,
      previewText,
      previewTitle,
      previewDate,
      profile,
      running,
      pendingCount: pending.length,
      ...previewActions,
    },
  }
}
