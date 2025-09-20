import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createHubConnection } from '../lib/hub'
import { listConversations, history, me, sendMessage, upload, createConversation, discoverConversations, searchConversations, joinConversation, deleteConversation, react, unreact, conversationMembers, conversationCode, markRead, mentionFeed, updateProfile, uploadAvatarImage, listUsers, directConversation } from '../lib/api'

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

export default function App(){
  const token = localStorage.getItem('token')
  const [user, setUser] = useState(null)
  const [convs, setConvs] = useState([])
  const [discover, setDiscover] = useState([])
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [typingUsers, setTypingUsers] = useState({})
  const [reactions, setReactions] = useState({})
  const [members, setMembers] = useState([])
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionList, setMentionList] = useState([])
  const [dark, setDark] = useState(true)
  const [unreadMap, setUnreadMap] = useState({})
  const [mentionCount, setMentionCount] = useState(0)
  const [replyTo, setReplyTo] = useState(null)
  const [searchQ, setSearchQ] = useState('')
  const [modal, setModal] = useState(null)
  const [toasts, setToasts] = useState([])
  const [showMembers, setShowMembers] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [incomingCall, setIncomingCall] = useState(null)
  const [callInfo, setCallInfo] = useState({ conversationId: null, active: false })
  const [callPanelOpen, setCallPanelOpen] = useState(false)
  const [callParticipants, setCallParticipants] = useState([])
  const [remoteStreams, setRemoteStreams] = useState([])
  const [localStream, setLocalStream] = useState(null)
  const [callLoading, setCallLoading] = useState(false)

  const connRef = useRef(null)
  const activeIdRef = useRef(null)
  const convsRef = useRef([])
  const joinedConvsRef = useRef(new Set())
  const connectionReadyRef = useRef(false)
  const pageRef = useRef(1)
  const hasMoreRef = useRef(true)
  const profileMenuRef = useRef(null)
  const fileInputRef = useRef(null)
  const membersCacheRef = useRef(new Map())
  const peersRef = useRef(new Map())
  const localStreamRef = useRef(null)
  const remoteStreamsRef = useRef(new Map())
  const callInfoRef = useRef(callInfo)
  const callParticipantsRef = useRef(callParticipants)
  const userRef = useRef(null)

  function showToast(message, type = 'info'){
    const id = (typeof window !== 'undefined' && window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).slice(2))
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, type === 'error' ? 6000 : 3500)
  }

  const activeId = useMemo(() => getConversationId(active), [active])

  useEffect(() => { callInfoRef.current = callInfo }, [callInfo])
  useEffect(() => { callParticipantsRef.current = callParticipants }, [callParticipants])
  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  useEffect(() => {
    (async () => {
      try {
        const meRes = await me()
        setUser(meRes.data)
        userRef.current = meRes.data
      } catch (err) {
        console.warn('fetch me failed', err)
      }
      try {
        const convRes = await listConversations()
        setConvs(convRes.data)
        convsRef.current = convRes.data || []
      } catch (err) {
        console.error('list conversations failed', err)
      }
    })()
  }, [])

  useEffect(() => {
    convsRef.current = convs || []
    if (connectionReadyRef.current){
      syncConversationMembership(convs)
    }
  }, [convs])

  useEffect(() => {
    function onClickOutside(e){
      if (!profileMenuOpen) return
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)){
        setProfileMenuOpen(false)
      }
    }
    if (profileMenuOpen){
      document.addEventListener('mousedown', onClickOutside)
    }
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [profileMenuOpen])

  useEffect(() => {
    if (!token) return
    const connection = createHubConnection(token)
    connRef.current = connection

    const handleMessage = (msg) => {
      const convId = msg.conversationId || msg.ConversationId
      if (String(convId) === String(activeIdRef.current)){
        setMessages(prev => {
          const id = msg.id || msg.Id
          if (id && prev.some(m => (m.id || m.Id) === id)) return prev
          return [...prev, msg]
        })
      } else {
        setUnreadMap(prev => ({ ...prev, [convId]: (prev[convId] || 0) + 1 }))
        const title = getConversationNameById(convId) || 'một phòng'
        const sender = msg.senderDisplayName || msg.senderUsername || msg.SenderDisplayName || msg.SenderUsername || 'Ai đó'
        showToast('Tin nhắn mới từ ' + sender + ' trong ' + title, 'info')
      }
    }
    const handleTyping = ({ conversationId, userId, isTyping }) => {
      if (String(conversationId) !== String(activeIdRef.current)) return
      setTypingUsers(prev => ({ ...prev, [userId]: isTyping }))
    }

    const handleReaction = ({ messageId, emoji, op }) => {
      setReactions(prev => {
        const next = { ...prev }
        const entry = { ...(next[messageId] || {}) }
        const current = entry[emoji] || 0
        entry[emoji] = Math.max(0, current + (op === 'add' ? 1 : -1))
        next[messageId] = entry
        return next
      })
    }

    const handleMention = (msg) => {
      setMentionCount(c => c + 1)
      const convId = msg.conversationId || msg.ConversationId
      setUnreadMap(prev => ({ ...prev, [convId]: (prev[convId] || 0) + 1 }))
      if (String(convId) !== String(activeIdRef.current)){
        const title = getConversationNameById(convId) || 'một phòng'
        showToast('Có nhắc đến bạn ở ' + title, 'info')
      }
    }

    const handleCallStart = async ({ conversationId, from }) => {
      if (!conversationId) return
      const currentUserId = userRef.current?.id
      const conversationName = getConversationNameById(conversationId) || null

      if (from === currentUserId){
        const info = { conversationId, active: true }
        callInfoRef.current = info
        setCallInfo(info)
        setCallPanelOpen(true)
        setCallLoading(false)
        setIncomingCall(null)
        setCallParticipants(prev => prev.includes(currentUserId) ? prev : [...prev, currentUserId])
        return
      }

      if (callInfoRef.current.active && String(callInfoRef.current.conversationId) === String(conversationId)) return

      let callerDisplayName = null
      const cacheKey = conversationId.toString()
      let cachedMembers = membersCacheRef.current.get(cacheKey)
      if (!cachedMembers){
        try {
          const res = await conversationMembers(conversationId)
          cachedMembers = res.data || []
          membersCacheRef.current.set(cacheKey, cachedMembers)
        } catch (err) {
          console.warn('fetch members for call failed', err)
          cachedMembers = []
        }
      }
      const caller = cachedMembers.find(m => (m.userId || m.UserId) === from)
      callerDisplayName = caller ? (caller.displayName || caller.DisplayName || caller.username || caller.Username || null) : null
      setCallParticipants([from])
      setIncomingCall({ conversationId, from, conversationName, callerDisplayName })
      showToast('Có cuộc gọi trong ' + (conversationName || 'một phòng'), 'info')
    }

    const handleCallJoin = async ({ conversationId, userId }) => {
      if (!conversationId || !userId) return
      setCallParticipants(prev => prev.includes(userId) ? prev : [...prev, userId])

      if (userId === userRef.current?.id){
        const info = { conversationId, active: true }
        callInfoRef.current = info
        setCallInfo(info)
        setCallPanelOpen(true)
        setIncomingCall(null)
        return
      }

      if (!callInfoRef.current.active || String(callInfoRef.current.conversationId) !== String(conversationId)) return

      try {
        const stream = await ensureLocalStream()
        const pc = createPeerConnection(userId)
        if (stream){
          const existingKinds = pc.getSenders().map(s => s.track?.kind)
          stream.getTracks().forEach(track => {
            if (!existingKinds.includes(track.kind)){
              pc.addTrack(track, stream)
            }
          })
        }
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await connRef.current?.invoke('SendOffer', userId, offer)
      } catch (err) {
        console.warn('call join offer failed', err)
      }
    }

    const handleCallLeave = ({ conversationId, userId }) => {
      if (!conversationId || !userId) return
      if (String(callInfoRef.current.conversationId) !== String(conversationId)) return
      closePeer(userId)
      setCallParticipants(prev => prev.filter(id => id !== userId))
      if (userId === userRef.current?.id){
        cleanupCall()
      }
    }

    const handleCallEnd = ({ conversationId }) => {
      if (String(callInfoRef.current.conversationId) !== String(conversationId)) return
      showToast('Cuộc gọi đã kết thúc', 'info')
      cleanupCall()
    }

    const handleOffer = async ({ from, offer }) => {
      if (!offer || !callInfoRef.current.active) return
      try {
        const pc = createPeerConnection(from)
        const stream = await ensureLocalStream()
        if (stream){
          const existingKinds = pc.getSenders().map(s => s.track?.kind)
          stream.getTracks().forEach(track => {
            if (!existingKinds.includes(track.kind)){
              pc.addTrack(track, stream)
            }
          })
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await connRef.current?.invoke('SendAnswer', from, answer)
      } catch (err) {
        console.warn('handle offer failed', err)
      }
    }

    const handleAnswer = async ({ from, answer }) => {
      if (!answer) return
      const pc = peersRef.current.get(from)
      if (!pc) return
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
      } catch (err) {
        console.warn('handle answer failed', err)
      }
    }

    const handleCandidate = async ({ from, candidate }) => {
      if (!candidate) return
      const pc = peersRef.current.get(from)
      if (!pc) return
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.warn('add ice candidate failed', err)
      }
    }

    connection.on('message', handleMessage)
    connection.on('typing', handleTyping)
    connection.on('reaction', handleReaction)
    connection.on('mention', handleMention)
    connection.on('call/start', handleCallStart)
    connection.on('call/join', handleCallJoin)
    connection.on('call/leave', handleCallLeave)
    connection.on('call/end', handleCallEnd)
    connection.on('webrtc/offer', handleOffer)
    connection.on('webrtc/answer', handleAnswer)
    connection.on('webrtc/candidate', handleCandidate)

    connection.onreconnected(() => {
      connectionReadyRef.current = true
      syncConversationMembership()
    })

    connection.onclose(() => {
      connectionReadyRef.current = false
      joinedConvsRef.current.clear()
    })

    connection.start()
      .then(() => {
        connectionReadyRef.current = true
        syncConversationMembership()
      })
      .catch(err => console.error('hub start failed', err))

    return () => {
      connection.off('message', handleMessage)
      connection.off('typing', handleTyping)
      connection.off('reaction', handleReaction)
      connection.off('mention', handleMention)
      connection.off('call/start', handleCallStart)
      connection.off('call/join', handleCallJoin)
      connection.off('call/leave', handleCallLeave)
      connection.off('call/end', handleCallEnd)
      connection.off('webrtc/offer', handleOffer)
      connection.off('webrtc/answer', handleAnswer)
      connection.off('webrtc/candidate', handleCandidate)
      connection.stop().catch(()=>{})
    }
  }, [token])
  async function syncConversationMembership(conversations = convsRef.current){
    const connection = connRef.current
    if (!connection || !connectionReadyRef.current || !connection.connectionId) return
    const ids = (conversations || [])
      .map(getConversationId)
      .filter(Boolean)
      .map(id => id.toString())

    const joined = joinedConvsRef.current

    for (const id of ids){
      if (!joined.has(id)){
        try {
          await connection.invoke('JoinConversation', id)
          joined.add(id)
        } catch (err) {
          console.warn('join conversation group failed', id, err)
        }
      }
    }

    for (const id of Array.from(joined)){
      if (!ids.includes(id)){
        try {
          await connection.invoke('LeaveConversation', id)
        } catch (err) {
          console.warn('leave conversation group failed', id, err)
        }
        joined.delete(id)
      }
    }
  }

  function getConversationId(conv){
    if (!conv) return null
    return conv?.conversationId || conv?.ConversationId || conv?.id || conv?.Id || null
  }

  function getConversationNameById(id){
    if (!id) return null
    const match = convsRef.current.find(c => String(getConversationId(c)) === String(id))
    return match ? (match.name || match.Name || '') : null
  }

  async function openConv(conv){
    if (!conv) return
    const convId = getConversationId(conv)
    if (!convId) return
    setShowMembers(false)
    setActive(conv)
    if (incomingCall && String(incomingCall.conversationId) === String(convId)){
      setIncomingCall(null)
    }

    try {
      const res = await history(convId)
      const items = (res.data?.items || []).slice().reverse()
      setMessages(items)
      pageRef.current = 1
      hasMoreRef.current = true

      const seed = {}
      for (const item of items){
        const id = item.id || item.Id
        if (!id || !item.reactions) continue
        const map = {}
        for (const r of item.reactions){
          map[r.emoji] = r.count
        }
        if (Object.keys(map).length){
          seed[id] = map
        }
      }
      setReactions(seed)
    } catch (err) {
      console.warn('history failed', err)
      setMessages([])
    }

    try {
      const membersRes = await conversationMembers(convId)
      const memberList = membersRes.data || []
      setMembers(memberList)
      membersCacheRef.current.set(convId.toString(), memberList)
    } catch (err) {
      console.warn('load members failed', err)
      setMembers([])
    }

    setUnreadMap(prev => {
      const copy = { ...prev }
      delete copy[convId]
      return copy
    })

    try {
      await markRead(convId)
    } catch (err) {
      console.warn('mark read failed', err)
    }

    if (connRef.current && connectionReadyRef.current){
      const key = convId.toString()
      if (!joinedConvsRef.current.has(key)){
        try {
          await connRef.current.invoke('JoinConversation', convId)
          joinedConvsRef.current.add(key)
        } catch (err) {
          console.warn('join conversation for open failed', err)
        }
      }
    }
  }

  async function ensureLocalStream(){
    if (localStreamRef.current) return localStreamRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      localStreamRef.current = stream
      setLocalStream(stream)
      return stream
    } catch (err) {
      showToast('Không thể truy cập camera/micro', 'error')
      throw err
    }
  }

  function createPeerConnection(userId){
    let pc = peersRef.current.get(userId)
    if (pc) return pc
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pc.onicecandidate = event => {
      if (event.candidate){
        connRef.current?.invoke('SendIceCandidate', userId, event.candidate).catch(()=>{})
      }
    }
    pc.ontrack = event => {
      const stream = event.streams[0]
      if (!stream) return
      remoteStreamsRef.current.set(userId, stream)
      setRemoteStreams(Array.from(remoteStreamsRef.current.entries()).map(([uid, s]) => ({ userId: uid, stream: s })))
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed'){
        closePeer(userId)
      }
    }
    peersRef.current.set(userId, pc)
    return pc
  }

  function closePeer(userId){
    const pc = peersRef.current.get(userId)
    if (pc){
      try { pc.close() } catch {}
      peersRef.current.delete(userId)
    }
    if (remoteStreamsRef.current.delete(userId)){
      setRemoteStreams(Array.from(remoteStreamsRef.current.entries()).map(([uid, s]) => ({ userId: uid, stream: s })))
    }
  }

  function cleanupCall(){
    peersRef.current.forEach(pc => { try { pc.close() } catch {} })
    peersRef.current.clear()
    remoteStreamsRef.current.clear()
    setRemoteStreams([])
    if (localStreamRef.current){
      localStreamRef.current.getTracks().forEach(track => track.stop())
    }
    localStreamRef.current = null
    setLocalStream(null)
    setCallParticipants([])
    const info = { conversationId: null, active: false }
    callInfoRef.current = info
    setCallInfo(info)
    setCallPanelOpen(false)
    setIncomingCall(null)
    setCallLoading(false)
  }

  async function joinCall(conversationId, { autoStart = false } = {}){
    if (!conversationId) return
    if (callInfoRef.current.active && String(callInfoRef.current.conversationId) === String(conversationId)) return
    setCallLoading(true)
    try {
      await ensureLocalStream()
      const info = { conversationId, active: true }
      callInfoRef.current = info
      setCallInfo(info)
      setCallPanelOpen(true)
      setIncomingCall(null)
      setCallParticipants(prev => prev.includes(userRef.current?.id) ? prev : [...prev, userRef.current?.id])
      await connRef.current?.invoke('JoinCall', conversationId)
      if (!autoStart){
        showToast('Đã tham gia cuộc gọi', 'success')
      }
    } catch (err) {
      console.warn('join call failed', err)
      showToast('Không thể tham gia cuộc gọi', 'error')
      cleanupCall()
    } finally {
      setCallLoading(false)
    }
  }

  async function startCall(){
    if (!active){
      showToast('Hãy chọn cuộc trò chuyện trước', 'error')
      return
    }
    const convId = getConversationId(active)
    if (!convId){
      showToast('Không xác định được cuộc trò chuyện', 'error')
      return
    }
    try {
      setCallLoading(true)
      await connRef.current?.invoke('StartCall', convId)
      await joinCall(convId, { autoStart: true })
      showToast('Đang bắt đầu cuộc gọi nhóm', 'info')
    } catch (err) {
      console.warn('start call failed', err)
      showToast('Không thể bắt đầu cuộc gọi', 'error')
      setCallLoading(false)
    }
  }

  async function leaveCall(endAll = false){
    const convId = callInfoRef.current.conversationId
    if (!convId) return
    try {
      if (endAll){
        await connRef.current?.invoke('EndCall', convId)
      } else {
        await connRef.current?.invoke('LeaveCall', convId)
      }
    } catch (err) {
      console.warn('leave call failed', err)
    } finally {
      cleanupCall()
    }
  }

  async function handleGroupSearch(){
    if (!searchQ.trim()){
      showToast('Nhập tên nhóm để tìm kiếm', 'error')
      return
    }
    try {
      const { data } = await searchConversations(searchQ.trim())
      setModal({ type: 'search-groups', query: searchQ.trim(), results: data || [] })
    } catch (err) {
      console.warn('search groups failed', err)
      showToast('Không thể tìm nhóm', 'error')
    }
  }

  async function onSend(){
    if (!text.trim() || !active) return
    const convId = getConversationId(active)
    if (!convId) return
    let payload = { ConversationId: convId, Content: text, Type: 0 }
    if (replyTo){
      payload.ParentMessageId = replyTo.id || replyTo.Id || replyTo
    }
    if (text.startsWith('/giphy ')){
      const q = text.slice(7).trim()
      if (q){
        try {
          const key = import.meta.env.VITE_GIPHY_KEY || 'dc6zaTOxFJmzC'
          const res = await fetch(`https://api.giphy.com/v1/gifs/translate?api_key=${encodeURIComponent(key)}&s=${encodeURIComponent(q)}&weirdness=0`)
          const data = await res.json()
          const gifUrl = data?.data?.images?.downsized_medium?.url || data?.data?.images?.original?.url
          if (gifUrl){
            payload = { ConversationId: convId, Content: `giphy: ${q}`, Type: 1, Metadata: gifUrl }
          }
        } catch (err) {
          console.warn('giphy error', err)
          showToast('Không lấy được GIF', 'error')
        }
      }
    }
    try {
      await sendMessage(payload)
      setText('')
      setReplyTo(null)
    } catch (err) {
      console.error('send failed', err)
      showToast('Gửi tin nhắn thất bại', 'error')
    }
  }

  async function onUpload(e){
    const files = Array.from(e.target?.files || e.dataTransfer?.files || [])
    if (!files.length || !active) return
    const convId = getConversationId(active)
    if (!convId) return
    for (const file of files){
      try {
        await upload(convId, file)
      } catch (err) {
        console.warn('upload failed', file.name, err)
        showToast(`Tải ${file.name} thất bại`, 'error')
      }
    }
    if (e.target){
      e.target.value = ''
    }
  }

  async function onTyping(value){
    setText(value)
    if (active){
      const convId = getConversationId(active)
      if (convId){
        try {
          await connRef.current?.invoke('Typing', convId, true)
          setTimeout(() => connRef.current?.invoke('Typing', convId, false).catch(()=>{}), 1000)
        } catch {}
      }
    }
    const mentionMatch = value.match(/@([A-Za-z0-9_]*)$/)
    if (mentionMatch){
      const q = mentionMatch[1]?.toLowerCase() || ''
      const list = members.filter(u => ((u.username || u.Username || '') + '').toLowerCase().startsWith(q)).slice(0, 6)
      setMentionList(list)
      setMentionOpen(list.length > 0)
    } else {
      setMentionOpen(false)
    }
  }

  function getMemberLabel(userId){
    if (!userId) return 'Người dùng'
    if (userId === user?.id) return 'Bạn'
    const activeMember = members.find(m => (m.userId || m.UserId) === userId)
    if (activeMember){
      return activeMember.displayName || activeMember.DisplayName || activeMember.username || activeMember.Username || 'Người dùng'
    }
    const cacheEntry = membersCacheRef.current.get(activeIdRef.current?.toString() || '')
    if (cacheEntry){
      const cached = cacheEntry.find(m => (m.userId || m.UserId) === userId)
      if (cached){
        return cached.displayName || cached.DisplayName || cached.username || cached.Username || 'Người dùng'
      }
    }
    return 'Người dùng'
  }

  async function handleAcceptCall(){
    if (!incomingCall) return
    const convId = incomingCall.conversationId
    if (!convId) return
    const conv = convsRef.current.find(c => String(getConversationId(c)) === String(convId))
    if (conv && (!active || String(getConversationId(active)) !== String(convId))){
      await openConv(conv)
    }
    await joinCall(convId)
  }

  function handleDeclineCall(){
    setIncomingCall(null)
  }

  function callStatusLabel(){
    if (!callInfo.active) return 'Không hoạt động'
    if (callLoading) return 'Đang kết nối...'
    return 'Đang gọi'
  }
  function renderModal(){
    if (!modal) return null
    const close = () => setModal(null)

    if (modal.type === 'create-conversation'){
      const form = modal.form || { name: '', type: 1 }
      return (
        <Modal title="Tạo cuộc trò chuyện" onClose={close}>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-500 block mb-1">Tên cuộc trò chuyện</label>
              <input value={form.name} onChange={e=>setModal(m=>({...m, form:{...form, name:e.target.value}}))} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Nhập tên" />
            </div>
            <div>
              <label className="text-sm text-slate-500 block mb-1">Loại</label>
              <select value={form.type} onChange={e=>setModal(m=>({...m, form:{...form, type:Number(e.target.value)}}))} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value={1}>Nhóm</option>
                <option value={2}>Kênh</option>
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button className="px-4 py-2 rounded-lg border" onClick={close}>Hủy</button>
            <button className="px-4 py-2 rounded-lg bg-[#464eb8] text-white" onClick={async()=>{
              if (!form.name.trim()){
                showToast('Vui lòng nhập tên cuộc trò chuyện', 'error')
                return
              }
              try {
                const { data } = await createConversation({ name: form.name.trim(), type: form.type, members: [] })
                const list = await listConversations().then(r=>r.data)
                setConvs(list)
                setModal({ type: 'conversation-created', room: data })
              } catch (err) {
                console.warn('create conversation failed', err)
                showToast('Không tạo được cuộc trò chuyện', 'error')
              }
            }}>Tạo</button>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'conversation-created'){
      const room = modal.room || {}
      return (
        <Modal title="Tạo cuộc trò chuyện thành công" onClose={close}>
          <p className="text-sm text-slate-600 mb-4">Chia sẻ mã này để mọi người tham gia phòng.</p>
          <div className="text-lg font-semibold text-center bg-slate-100 rounded-lg py-3">{room.code || room.Code || '---'}</div>
          <div className="mt-6 flex justify-end">
            <button className="px-4 py-2 rounded-lg bg-[#464eb8] text-white" onClick={()=>{ navigator.clipboard?.writeText(room.code || room.Code || ''); showToast('Đã copy mã phòng', 'success'); close() }}>Copy mã</button>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'join-conversation'){
      const form = modal.form || { code: '' }
      return (
        <Modal title={`Tham gia ${modal.name || ''}`} onClose={close}>
          <div>
            <label className="text-sm text-slate-500 block mb-1">Nhập mã phòng</label>
            <input value={form.code} onChange={e=>setModal(m=>({...m, form:{...form, code:e.target.value}}))} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Mã..." />
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button className="px-4 py-2 rounded-lg border" onClick={close}>Hủy</button>
            <button className="px-4 py-2 rounded-lg bg-[#464eb8] text-white" onClick={async()=>{
              if (!form.code.trim()){
                showToast('Vui lòng nhập mã', 'error')
                return
              }
              try {
                await joinConversation(modal.conversationId, form.code.trim())
                const list = await listConversations().then(r=>r.data)
                setConvs(list)
                setDiscover(d=>d.filter(x => (x.id||x.Id)!==modal.conversationId))
                showToast('Đã tham gia phòng', 'success')
                close()
              } catch (err) {
                console.warn('join conversation failed', err)
                showToast('Không thể tham gia phòng', 'error')
              }
            }}>Tham gia</button>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'mentions'){
      const items = modal.items || []
      return (
        <Modal title="Thông báo nhắc đến" onClose={close}>
          <div className="max-h-80 overflow-y-auto space-y-3">
            {items.length===0 && <div className="text-sm text-slate-500">Không có nhắc đến mới.</div>}
            {items.map(item => (
              <div key={item.id || item.Id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div className="text-xs text-slate-400">{new Date(item.createdAt || item.CreatedAt).toLocaleString()}</div>
                <div className="font-medium">#{item.conversationId}</div>
                <div className="mt-1 whitespace-pre-wrap">{item.content}</div>
              </div>
            ))}
          </div>
        </Modal>
      )
    }

    if (modal.type === 'search-groups'){
      const results = modal.results || []
      return (
        <Modal title={`Tìm kiếm "${modal.query || ''}"`} onClose={close}>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {results.length===0 && <div className="text-sm text-slate-500">Không tìm thấy nhóm phù hợp.</div>}
            {results.map(item => {
              const id = item.id || item.Id
              const name = item.name || item.Name
              const type = item.type || item.Type
              const isMember = item.isMember || item.IsMember
              return (
                <div key={id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <div>
                    <div className="font-medium text-slate-800">{name}</div>
                    <div className="text-xs text-slate-500">{type===0?'Direct':type===1?'Group':'Channel'}</div>
                  </div>
                  {isMember ? (
                    <button className="text-sm text-[#2f2b6a] hover:underline" onClick={() => {
                      const conv = convsRef.current.find(c => String(getConversationId(c)) === String(id))
                      if (conv){
                        openConv(conv)
                        close()
                      } else {
                        showToast('Bạn đã là thành viên của phòng này', 'info')
                      }
                    }}>Mở</button>
                  ) : (
                    <button className="text-sm text-[#2f2b6a] hover:underline" onClick={() => setModal({ type: 'join-conversation', conversationId: id, name, form: { code: '' } })}>Tham gia</button>
                  )}
                </div>
              )
            })}
          </div>
        </Modal>
      )
    }

    if (modal.type === 'confirm-delete'){
      return (
        <Modal title="Xóa cuộc trò chuyện" onClose={close}>
          <p className="text-sm text-slate-600">Bạn có chắc muốn xóa cuộc trò chuyện này? Tất cả tin nhắn sẽ biến mất.</p>
          <div className="mt-6 flex justify-end gap-2">
            <button className="px-4 py-2 rounded-lg border" onClick={close}>Hủy</button>
            <button className="px-4 py-2 rounded-lg bg-red-600 text-white" onClick={async()=>{
              try {
                await deleteConversation(modal.conversationId)
                const list = await listConversations().then(r=>r.data)
                setConvs(list)
                setActive(null)
                setMessages([])
                showToast('Đã xóa cuộc trò chuyện', 'success')
              } catch (err) {
                console.warn('delete conversation failed', err)
                showToast('Không thể xóa', 'error')
              } finally {
                close()
              }
            }}>Xóa</button>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'profile'){
      const form = modal.form || { displayName: '', username: '', currentPassword: '', newPassword: '' }
      return (
        <Modal title="Chỉnh sửa hồ sơ" onClose={close}>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <AvatarPreview stream={null} src={user?.avatarUrl} size="large" />
              <label className="cursor-pointer px-4 py-2 rounded-lg bg-[#464eb8] text-white text-sm">
                Đổi ảnh đại diện
                <input type="file" accept="image/*" className="hidden" onChange={async e=>{
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const { data } = await uploadAvatarImage(file)
                    setUser(prev => prev ? ({ ...prev, avatarUrl: data.avatarUrl }) : prev)
                    showToast('Đã cập nhật ảnh đại diện', 'success')
                  } catch (err) {
                    console.warn('upload avatar failed', err)
                    showToast('Tải ảnh thất bại', 'error')
                  }
                }} />
              </label>
            </div>
            <div>
              <label className="text-sm text-slate-500 block mb-1">Tên hiển thị</label>
              <input value={form.displayName} onChange={e=>setModal(m=>({...m, form:{...form, displayName:e.target.value}}))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="text-sm text-slate-500 block mb-1">Tên đăng nhập</label>
              <input value={form.username} onChange={e=>setModal(m=>({...m, form:{...form, username:e.target.value}}))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-slate-500 block mb-1">Mật khẩu hiện tại</label>
                <input type="password" value={form.currentPassword} onChange={e=>setModal(m=>({...m, form:{...form, currentPassword:e.target.value}}))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
              <div>
                <label className="text-sm text-slate-500 block mb-1">Mật khẩu mới</label>
                <input type="password" value={form.newPassword} onChange={e=>setModal(m=>({...m, form:{...form, newPassword:e.target.value}}))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button className="px-4 py-2 rounded-lg border" onClick={close}>Hủy</button>
            <button className="px-4 py-2 rounded-lg bg-[#464eb8] text-white" onClick={async()=>{
              try {
                const res = await updateProfile({ displayName: form.displayName, username: form.username, currentPassword: form.currentPassword || null, newPassword: form.newPassword || null })
                setUser(prev => prev ? ({ ...prev, ...res.data }) : res.data)
                showToast('Đã cập nhật hồ sơ', 'success')
                close()
              } catch (err) {
                console.warn('update profile failed', err)
                const message = err?.response?.data?.message || 'Không thể cập nhật hồ sơ'
                showToast(message, 'error')
              }
            }}>Lưu</button>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'new-direct'){
      const users = modal.users || []
      return (
        <Modal title="Chọn người để nhắn tin" onClose={close}>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {users.map(u => (
              <button key={u.id || u.Id} className="w-full flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-100 text-left" onClick={async()=>{
                try {
                  const { data } = await directConversation(u.id || u.Id)
                  const list = await listConversations().then(r=>r.data)
                  setConvs(list)
                  const conv = list.find(x => (x.id||x.Id) === (data.id||data.Id))
                  close()
                  if (conv) openConv(conv)
                } catch (err) {
                  console.warn('direct conversation failed', err)
                  showToast('Không thể mở cuộc trò chuyện', 'error')
                }
              }}>
                <div className="relative">
                  <img src={u.avatarUrl || u.AvatarUrl || '/default-avatar.svg'} className="w-9 h-9 rounded-full" />
                  <span className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${u.isOnline || u.IsOnline ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                </div>
                <div>
                  <div className="font-medium">{u.displayName || u.DisplayName || u.username || u.Username}</div>
                  <div className="text-xs text-slate-500">@{u.username || u.Username}</div>
                </div>
              </button>
            ))}
            {users.length===0 && <div className="text-sm text-slate-500">Không có người dùng nào khác.</div>}
          </div>
        </Modal>
      )
    }

    return null
  }
  const localUserId = user?.id
  const activeMembers = members

  return (
    <div className="relative min-h-screen md:h-screen flex overflow-hidden bg-[#fdf2f8] dark:bg-[#15173a] text-gray-900 dark:text-gray-100">
      <nav className="hidden md:flex w-20 flex-col items-center gap-6 bg-[#e9d5ff] text-[#4c1d95] py-6 shadow-lg">
        <div className="text-xl font-semibold">RC</div>
        <button className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 transition flex items-center justify-center" title={dark ? 'Chế độ sáng' : 'Chế độ tối'} onClick={()=>setDark(d=>!d)}>{dark ? '☀️' : '🌙'}</button>
        <button className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 transition flex items-center justify-center" title="Tạo cuộc trò chuyện" onClick={()=>setModal({ type: 'create-conversation', form: { name: '', type: 1 } })}>＋</button>
        <button className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 transition flex items-center justify-center" title="Khám phá" onClick={async()=>{
          try {
            const { data } = await discoverConversations()
            setDiscover(data)
            showToast('Đã tải danh sách phòng công khai', 'info')
          } catch (err) {
            console.warn('discover failed', err)
            showToast('Không thể tải danh sách phòng', 'error')
          }
        }}>🔎</button>
        <button className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 transition flex items-center justify-center" title="Danh bạ" onClick={async()=>{
          try {
            const { data } = await listUsers()
            setModal({ type: 'new-direct', users: data || [] })
          } catch (err) {
            console.warn('list users failed', err)
            showToast('Không thể tải danh sách người dùng', 'error')
          }
        }}>👤</button>
        <button className="relative w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 transition flex items-center justify-center" title="Nhắc đến" onClick={async()=>{
          try {
            const { data } = await mentionFeed(true,1,50)
            setModal({ type: 'mentions', items: data || [] })
            setMentionCount(0)
          } catch (err) {
            console.warn('mention feed failed', err)
            showToast('Không thể tải nhắc đến', 'error')
          }
        }}>@
          {mentionCount>0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full px-1 text-[10px]">{mentionCount}</span>}
        </button>
      </nav>
      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/30 backdrop-blur-sm md:hidden" onClick={()=>setSidebarOpen(false)}></div>}
      <aside className={`flex flex-col fixed inset-y-0 left-0 z-30 w-full max-w-xs bg-white/90 dark:bg-white/10 backdrop-blur border-r border-white/40 dark:border-black/40 transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static md:z-auto md:w-80 md:max-w-sm md:flex`}>
        <div className="px-5 py-5 border-b border-slate-200/70 dark:border-slate-800/60 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Cuộc trò chuyện</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">Realtime Chat</div>
          </div>
          <button className="md:hidden text-slate-500" onClick={()=>setDark(d=>!d)}>{dark ? '☀️' : '🌙'}</button>
        </div>
        <div className="flex-1 overflow-auto px-3 py-4 space-y-2">
          {convs.length===0 && <div className="text-sm text-slate-500 dark:text-slate-400 px-2">Chưa có cuộc trò chuyện nào.</div>}
          {convs.map(c => {
            const id = getConversationId(c)
            const unread = unreadMap[id]
            const isActive = String(activeId) === String(id)
            const conversationName = c.name || c.Name
            return (
              <div key={id} onClick={()=>{ openConv(c); setSidebarOpen(false) }} className={`rounded-xl px-4 py-3 cursor-pointer transition ${isActive ? 'bg-[#e9d5ff] text-[#5b21b6] shadow-md' : 'hover:bg-white/70 dark:hover:bg-white/5'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{conversationName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{(c.type||c.Type)===0?'Direct':(c.type||c.Type)===1?'Group':'Channel'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {unread ? <span className="bg-red-600 text-white rounded-full px-2 text-xs">{unread}</span> : null}
                    {incomingCall && String(incomingCall.conversationId) === String(id) && <span className="text-xs text-emerald-600">📞</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {discover.length>0 && (
          <div className="border-t border-slate-200/70 dark:border-slate-800/60 px-5 py-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Khám phá</div>
            {discover.map(dc => (
              <div key={(dc.id||dc.Id)} className="flex items-center justify-between rounded-lg bg-white/70 dark:bg-white/5 px-3 py-2">
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">{dc.name || dc.Name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{(dc.type||dc.Type)===0?'Direct':(dc.type||dc.Type)===1?'Group':'Channel'}</div>
                </div>
                <button className="text-sm text-[#2f2b6a] hover:underline" onClick={()=>setModal({ type: 'join-conversation', conversationId: dc.id||dc.Id, name: dc.name || dc.Name, form: { code: '' } })}>Tham gia</button>
              </div>
            ))}
          </div>
        )}
      </aside>
      <main className="flex-1 flex flex-col bg-white/90 dark:bg-[#1f2145] backdrop-blur">
        <header className="px-4 py-4 md:px-8 border-b border-slate-200/70 dark:border-slate-800/60 flex flex-col gap-3 bg-white/80 dark:bg-[#24285c]/70 backdrop-blur z-10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button className="md:hidden rounded-full bg-white/80 border border-slate-200 px-3 py-2 text-[#4c1d95]" onClick={()=>setSidebarOpen(true)}>☰</button>
              <div>
                <div className="text-xl md:text-2xl font-semibold">{active ? (active.name || active.Name) : 'Realtime Chat'}</div>
                {active && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{members.length} thành viên · {(active.type||active.Type)===0?'Direct':(active.type||active.Type)===1?'Group':'Channel'}</div>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center gap-2 rounded-full bg-white/80 dark:bg-[#1f2145]/80 border border-slate-200 dark:border-slate-700 px-3 py-1.5 shadow-sm">
                <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter'){ e.preventDefault(); handleGroupSearch() } }} placeholder="Tìm nhóm..." className="bg-transparent outline-none text-sm" />
                <button className="text-xs px-3 py-1 rounded-full bg-[#a78bfa] text-white" onClick={handleGroupSearch}>Tìm</button>
              </div>
              {active && (
                <>
                  <button className="flex items-center gap-2 rounded-full bg-[#a78bfa]/20 text-[#5b21b6] px-3 py-1.5 hover:bg-[#a78bfa]/30 transition" onClick={()=>setShowMembers(true)} title="Xem thành viên">
                    <span className="text-lg">👥</span>
                    <span className="hidden md:inline font-medium">Thành viên</span>
                  </button>
                  <button className="flex items-center gap-2 rounded-full bg-[#a78bfa]/20 text-[#5b21b6] px-3 py-1.5 hover:bg-[#a78bfa]/30 transition disabled:opacity-50" disabled={callLoading} onClick={startCall} title="Gọi nhóm">
                    <span className="text-lg">📞</span>
                    <span className="hidden md:inline font-medium">Gọi</span>
                  </button>
                  {callInfo.active && String(callInfo.conversationId) === String(activeId) && (
                    <button className="flex items-center gap-2 rounded-full border border-red-300 text-red-600 px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/40 transition" onClick={()=>leaveCall(false)}>
                      <span className="text-lg">✖</span>
                      <span className="hidden md:inline font-medium">Rời</span>
                    </button>
                  )}
                  <button className="hidden md:inline px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition" onClick={async()=>{
                    const id = getConversationId(active)
                    try {
                      await navigator.clipboard?.writeText(id)
                      showToast('Đã copy ID phòng', 'success')
                    } catch {
                      showToast('Không copy được ID', 'error')
                    }
                  }}>Copy ID</button>
                  <button className="hidden md:inline px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition" onClick={async()=>{
                    const id = getConversationId(active)
                    try {
                      const { data } = await conversationCode(id)
                      await navigator.clipboard?.writeText(data.code || data.Code)
                      showToast('Đã copy mã phòng', 'success')
                    } catch {
                      showToast('Không lấy được mã phòng', 'error')
                    }
                  }}>Copy code</button>
                  <button className="hidden md:inline px-3 py-1.5 rounded-full border border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/40 transition" onClick={()=>setModal({ type: 'confirm-delete', conversationId: getConversationId(active) })}>Xóa</button>
                </>
              )}
              <div className="relative" ref={profileMenuRef}>
                <button className="flex items-center gap-3 px-3 py-1.5 rounded-full border border-transparent hover:border-slate-300 dark:hover:border-slate-600 transition" onClick={()=>setProfileMenuOpen(o=>!o)}>
                  <img src={user?.avatarUrl || '/default-avatar.svg'} className="w-8 h-8 rounded-full" />
                  <div className="hidden md:flex flex-col items-start">
                    <span className="text-sm font-semibold">{user?.displayName || user?.username}</span>
                    <span className="text-xs text-slate-500">{callStatusLabel()}</span>
                  </div>
                </button>
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-lg bg-white dark:bg-[#2b2f55] shadow-lg border border-slate-200 dark:border-slate-700 py-2 text-sm">
                    <button className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={()=>{ setModal({ type: 'profile', form: { displayName: user?.displayName || '', username: user?.username || '', currentPassword: '', newPassword: '' } }); setProfileMenuOpen(false) }}>Chỉnh sửa hồ sơ</button>
                    {callInfo.active && (
                      <button className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={()=>{ setCallPanelOpen(p=>!p); setProfileMenuOpen(false) }}>{callPanelOpen ? 'Thu gọn cuộc gọi' : 'Mở cuộc gọi'}</button>
                    )}
                    <button className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/40" onClick={()=>{ localStorage.removeItem('token'); window.location.reload() }}>Đăng xuất</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        {incomingCall && (
          <div className="mx-8 mt-4 rounded-xl border border-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-semibold text-emerald-700 dark:text-emerald-200">{incomingCall.callerDisplayName || 'Một thành viên'} đang gọi...</div>
              <div className="text-xs text-emerald-600 dark:text-emerald-300">{incomingCall.conversationName || 'Cuộc gọi nhóm'}</div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 rounded-full bg-emerald-600 text-white" onClick={handleAcceptCall}>Tham gia</button>
              <button className="px-3 py-1.5 rounded-full bg-red-500 text-white" onClick={handleDeclineCall}>Từ chối</button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-auto px-4 md:px-8 py-6 space-y-4" onDragOver={e=>{ e.preventDefault() }} onDrop={async e=>{ e.preventDefault(); await onUpload(e) }} onScroll={async e=>{
          const el = e.currentTarget
          if (el.scrollTop < 50 && hasMoreRef.current && active){
            const convId = getConversationId(active)
            pageRef.current += 1
            try {
              const res = await history(convId, pageRef.current)
              const items = res.data.items.reverse()
              if (items.length === 0){
                hasMoreRef.current = false
                return
              }
              setMessages(prev => [...items, ...prev])
            } catch (err) {
              console.warn('load older messages failed', err)
              hasMoreRef.current = false
            }
          }
        }}>
          {!active && <div className="text-center text-slate-400 text-lg mt-12">Chọn một cuộc trò chuyện để bắt đầu</div>}
          {messages.length===0 && active && <div className="text-center text-sm text-slate-400">Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!</div>}
          {messages.map(m => {
            const mine = (m.senderId || m.SenderId) === localUserId
            const name = m.senderDisplayName || m.senderUsername || 'Unknown'
            const avatar = m.senderAvatarUrl || '/default-avatar.svg'
            const messageId = m.id || m.Id
            const createdAt = new Date(m.createdAt || m.CreatedAt || m.created || m.Created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            return (
              <div key={messageId} className={`flex gap-3 ${mine ? 'justify-end' : ''}`}>
                {!mine && <img src={avatar} className="w-9 h-9 rounded-full self-end shadow-sm" />}
                <div className={`group max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${mine ? 'bg-white text-slate-900 dark:bg-slate-100 dark:text-slate-900 border border-slate-200 rounded-br-md' : 'bg-sky-100 text-slate-900 dark:bg-sky-300 dark:text-slate-900 border border-sky-200 rounded-bl-md'}`}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    {!mine && <div className="text-xs font-semibold text-[#5b21b6] dark:text-slate-200">{name}</div>}
                    <div className="text-[11px] text-slate-400 dark:text-slate-300">{createdAt}</div>
                  </div>
                  {m.parentMessageId && <div className="text-[11px] text-slate-400 dark:text-slate-300 mb-1">↪ Reply</div>}
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.type===1 ? (<img src={m.metadata} className="max-h-64 rounded-lg" />) : renderContent(m.content, { mine })}</div>
                  <MessageReactions messageId={messageId} reactions={reactions[messageId]||{}} onReact={async emoji=>{ try { await react(messageId, emoji) } catch (err) { console.warn('react failed', err) } }} onUnreact={async emoji=>{ try { await unreact(messageId, emoji) } catch (err) { console.warn('unreact failed', err) } }} />
                  <div className="mt-2 flex items-center gap-3 text-[12px] opacity-0 group-hover:opacity-100 transition">
                    <button onClick={()=>setReplyTo(m)} className="hover:underline">↩️ Trả lời</button>
                  </div>
                  {m.ephemeralExpiresAt && <div className="text-[10px] text-slate-400 mt-1">Tự hủy: {new Date(m.ephemeralExpiresAt).toLocaleTimeString()}</div>}
                </div>
                {mine && <img src={user?.avatarUrl || '/default-avatar.svg'} className="w-9 h-9 rounded-full self-end shadow-sm" />}
              </div>
            )
          })}
        </div>
        {active && (
          <div className="relative px-4 md:px-8 pb-6 pt-4 border-t border-slate-200/70 dark:border-slate-800/60 bg-white/90 dark:bg-[#24285c]/60">
            {replyTo && (
              <div className="absolute -top-12 left-8 right-8 text-xs bg-white/90 dark:bg-[#2b2f55] rounded-lg px-3 py-2 shadow flex justify-between items-center">
                <div>Trả lời: {(replyTo.content||'').slice(0,60)}</div>
                <button onClick={()=>setReplyTo(null)} title="Hủy" className="text-slate-500 hover:text-slate-800 dark:hover:text-white">✖</button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button className="w-10 h-10 rounded-full bg-[#a78bfa]/20 text-[#5b21b6] hover:bg-[#a78bfa]/30 transition flex items-center justify-center" onClick={()=>fileInputRef.current?.click()} title="Gửi ảnh">🖼️</button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onUpload} />
              <input value={text} onChange={e=>onTyping(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter'){ e.preventDefault(); onSend() } }} className="flex-1 min-w-[200px] px-4 py-2 rounded-full border border-slate-300 dark:border-slate-600 bg-white/80 dark:bg-[#1f2145] focus:outline-none focus:ring-2 focus:ring-[#c4b5fd]" placeholder="Nhập tin nhắn... @mention, /giphy ..." />
              <button onClick={onSend} className="px-5 py-2 rounded-full bg-[#a78bfa] text-[#4c1d95] font-medium hover:bg-[#c4b5fd] transition">Gửi</button>
            </div>
            {mentionOpen && (
              <div className="absolute bottom-20 left-32 bg-white dark:bg-[#1f2145] rounded-lg shadow-lg min-w-[240px] max-h-60 overflow-auto border border-slate-200 dark:border-slate-700">
                {mentionList.map(u => (
                  <div key={u.userId || u.UserId} className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer flex items-center gap-2" onClick={()=>{
                    const uname = u.username||u.Username
                    const replaced = text.replace(/@([A-Za-z0-9_]*)$/, '@'+uname+' ')
                    setText(replaced)
                    setMentionOpen(false)
                  }}>
                    <img src={u.avatarUrl || u.AvatarUrl || '/default-avatar.svg'} className="w-8 h-8 rounded-full" />
                    <div>
                      <div className="text-sm font-medium">{u.displayName || u.DisplayName || u.username || u.Username}</div>
                      <div className="text-xs text-slate-500">@{u.username||u.Username}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="px-4 md:px-8 pb-3 text-xs text-slate-500 h-6">{Object.values(typingUsers).some(v=>v) && 'Đang nhập...'}</div>
      </main>
      {showMembers && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm" onClick={()=>setShowMembers(false)}>
          <div className="w-full max-w-sm h-full bg-white dark:bg-[#1f2145] p-6 shadow-2xl flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-semibold">Thành viên cuộc trò chuyện</div>
              <button className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={()=>setShowMembers(false)}>✖</button>
            </div>
            <div className="space-y-4 overflow-y-auto pr-2">
              {activeMembers.map(m => {
                const id = m.userId || m.UserId
                const isSelf = user?.id && id ? String(id) === String(user.id) : false
                const online = isSelf ? true : Boolean(m.isOnline ?? m.IsOnline)
                const lastSeen = m.lastSeenAt || m.LastSeenAt
                const display = m.displayName || m.DisplayName || m.username || m.Username
                const username = m.username || m.Username
                const avatar = m.avatarUrl || m.AvatarUrl || '/default-avatar.svg'
                const statusText = online ? (isSelf ? 'Bạn đang hoạt động' : 'Đang hoạt động') : (lastSeen ? `Hoạt động ${formatLastSeen(lastSeen)}` : 'Ngoại tuyến')
                return (
                  <div key={id} className="flex items-center gap-3 rounded-xl bg-white/80 dark:bg-white/5 px-3 py-2 shadow-sm">
                    <div className="relative">
                      <img src={avatar} className="w-10 h-10 rounded-full" />
                      <span className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-[#1f2145] ${online ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{display}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">@{username}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{statusText}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
      {(callInfo.active || localStream || remoteStreams.length>0) && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 w-[min(90vw,900px)] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-[#1b1f3d]/95 transition ${callPanelOpen ? 'opacity-100 translate-y-0' : 'opacity-90 translate-y-6'}`}>
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-700">
            <div>
              <div className="text-sm font-semibold">Cuộc gọi nhóm</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{callParticipants.length} thành viên</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs px-3 py-1.5 rounded-full border" onClick={()=>setCallPanelOpen(p=>!p)}>{callPanelOpen ? 'Thu gọn' : 'Mở rộng'}</button>
              <button className="text-xs px-3 py-1.5 rounded-full border border-red-400 text-red-600" onClick={()=>leaveCall(false)}>Rời</button>
              <button className="text-xs px-3 py-1.5 rounded-full border border-red-500 text-white bg-red-500" onClick={()=>leaveCall(true)}>Kết thúc cuộc gọi</button>
            </div>
          </div>
          {callPanelOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 px-6 py-4">
              {localStream && <VideoTile key="local" stream={localStream} label="Bạn" muted />}
              {remoteStreams.map(s => (
                <VideoTile key={s.userId} stream={s.stream} label={getMemberLabel(s.userId)} />
              ))}
              {callParticipants.filter(id => !remoteStreamsRef.current.has(id) && id !== localUserId).map(id => (
                <div key={'placeholder-'+id} className="h-36 rounded-xl bg-slate-100 dark:bg-slate-700/40 flex items-center justify-center text-sm text-slate-500">Đang kết nối với {getMemberLabel(id)}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {renderModal()}
      <ToastContainer toasts={toasts} />
    </div>
  )
}
function Modal({ title, children, onClose }){
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[min(90vw,520px)] rounded-2xl bg-white dark:bg-[#1f2145] shadow-2xl border border-slate-200 dark:border-slate-700 p-6" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold">{title}</div>
          <button className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={onClose}>✖</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ToastContainer({ toasts }){
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
      {toasts.map(t => (
        <div key={t.id} className="min-w-[220px] rounded-lg px-4 py-3 text-sm shadow-lg border">
          {t.message}
        </div>
      ))}
    </div>
  )
}

function VideoTile({ stream, label, muted }){
  const videoRef = React.useRef(null)
  useEffect(()=>{
    if (videoRef.current && stream){
      videoRef.current.srcObject = stream
    }
  },[stream])
  return (
    <div className="rounded-xl overflow-hidden bg-black relative h-36">
      <video ref={videoRef} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />
      <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-white text-xs">{label}</div>
    </div>
  )
}

function AvatarPreview({ stream, src, size='md' }){
  const videoRef = React.useRef(null)
  useEffect(()=>{
    if (stream && videoRef.current){
      videoRef.current.srcObject = stream
    }
  },[stream])
  const classes = size==='large' ? 'w-16 h-16' : 'w-10 h-10'
  if (stream){
    return <video ref={videoRef} autoPlay muted playsInline className={classes + ' rounded-full object-cover'} />
  }
  return <img src={src || '/default-avatar.svg'} className={classes + ' rounded-full object-cover'} />
}

function formatLastSeen(value){
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'vừa xong'
  if (diff < 3_600_000){
    const minutes = Math.floor(diff / 60_000)
    return minutes + ' phút trước'
  }
  if (diff < 86_400_000){
    const hours = Math.floor(diff / 3_600_000)
    return hours + ' giờ trước'
  }
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function renderContent(text, options = {}){
  const { mine } = options
  const parts = String(text||'').split(/(@[A-Za-z0-9_]+)/g)
  return parts.map((p,i)=>{
    if (p.startsWith && p.startsWith('@') && p.length>1){
      const mentionClass = mine ? 'text-[#5b21b6] font-semibold' : 'text-[#0f172a] font-semibold bg-white/60 dark:bg-white/30 px-1 rounded'
      return <span key={i} className={mentionClass}>{p}</span>
    }
    return <span key={i}>{p}</span>
  })
}

function MessageReactions({ messageId, reactions, onReact, onUnreact }){
  const [open, setOpen] = React.useState(false)
  const emojis = ['👍','❤️','😂','🎉','😮','😢']
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex gap-1 flex-wrap">
        {Object.entries(reactions).map(([e,c]) => (
          c>0 && <button key={e} className="text-xs px-2 py-0.5 rounded-full bg-white/60 dark:bg-black/30 border" onClick={()=>onUnreact(e)}>{e} {c}</button>
        ))}
      </div>
      <div className="relative">
        <button className="text-xs px-2 py-0.5 rounded border" onClick={()=>setOpen(o=>!o)}>➕</button>
        {open && (
          <div className="absolute z-10 mt-1 p-2 bg-white dark:bg-gray-800 rounded shadow flex gap-1">
            {emojis.map(e => (
              <button key={e} className="text-lg" onClick={()=>{ setOpen(false); onReact(e) }}>{e}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}







