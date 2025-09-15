import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createHubConnection } from '../lib/hub'
import { listConversations, history, me, sendMessage, upload, createConversation, discoverConversations, joinConversation, deleteConversation, directConversation, react, unreact, conversationMembers, conversationCode } from '../lib/api'

export default function App(){
  const token = localStorage.getItem('token')
  const [user, setUser] = useState(null)
  const [convs, setConvs] = useState([])
  const [discover, setDiscover] = useState([])
  const [showUsers, setShowUsers] = useState(false)
  const [users, setUsers] = useState([])
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [typingUsers, setTypingUsers] = useState({})
  const [reactions, setReactions] = useState({}) // messageId -> { emoji: count }
  const [members, setMembers] = useState([])
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionList, setMentionList] = useState([])
  const [dark, setDark] = useState(true)
  const [unreadMap, setUnreadMap] = useState({})
  const [mentionCount, setMentionCount] = useState(0)
  const [replyTo, setReplyTo] = useState(null)
  const [searchQ, setSearchQ] = useState('')
  const connRef = useRef(null)
  const activeIdRef = useRef(null)
  const activeId = useMemo(() => (active?.conversationId || active?.id || active?.ConversationId || active?.Id || null), [active])
  const pageRef = useRef(1)
  const hasMoreRef = useRef(true)

  useEffect(()=>{ activeIdRef.current = activeId }, [activeId])

  useEffect(()=>{ document.documentElement.classList.toggle('dark', dark) },[dark])

  useEffect(()=>{
    (async ()=>{
      const u = await me().then(r=>r.data)
      setUser(u)
      const cs = await listConversations().then(r=>r.data)
      setConvs(cs)
    })()
  },[])

  useEffect(()=>{
    const c = createHubConnection(token)
    connRef.current = c
    c.on('message', (msg)=>{
      if (msg.conversationId === activeIdRef.current){
        setMessages(m=>{
          const id = msg.id || msg.Id
          if (id && m.some(x => (x.id||x.Id) === id)) return m
          return [...m, msg]
        })
      } else {
        setUnreadMap(prev=>{
          const conv = msg.conversationId
          return { ...prev, [conv]: (prev[conv]||0) + 1 }
        })
      }
    })
    c.on('typing', ({conversationId, userId, isTyping})=>{
      const aid = activeIdRef.current
      if (!aid || conversationId!==aid) return
      setTypingUsers(t=> ({...t, [userId]: isTyping}))
    })
    c.on('reaction', ({messageId, emoji, userId, op})=>{
      setReactions(prev => {
        const next = { ...prev }
        const m = { ...(next[messageId]||{}) }
        const cur = m[emoji] || 0
        m[emoji] = Math.max(0, cur + (op==='add'?1:-1))
        next[messageId] = m
        return next
      })
    })
    c.on('mention', (msg)=>{
      setMentionCount(c=>c+1)
      const conv = msg.conversationId
      setUnreadMap(prev=>({ ...prev, [conv]: (prev[conv]||0) + 1 }))
    })
    c.start().catch(console.error)
    return ()=>{ c.stop().catch(()=>{}) }
  },[])

  async function openConv(c){
    const prev = active
    setActive(c)
    const convId = c.conversationId || c.ConversationId || c.id || c.Id || c
    const res = await history(convId)
    const items = res.data.items.reverse()
    setMessages(items)
    pageRef.current = 1
    hasMoreRef.current = true
    // Load members for mentions
    try { const mres = await conversationMembers(convId); setMembers(mres.data||[]) } catch {}
    // seed reaction counts from history
    const seed = {}
    for (const m of items){
      const map = {}
      if (m.reactions){
        for (const r of m.reactions){ map[r.emoji] = r.count }
      }
      if (Object.keys(map).length) seed[m.id||m.Id] = map
    }
    setReactions(seed)
    // clear unread and mark read
    setUnreadMap(prev=>{ const copy={...prev}; delete copy[convId]; return copy })
    try { await markRead(convId) } catch {}
    try {
      if (prev) {
        const prevId = prev.conversationId || prev.ConversationId || prev.id || prev.Id
        if (prevId && prevId !== convId) await connRef.current?.invoke('LeaveConversation', prevId)
      }
      await connRef.current?.invoke('JoinConversation', convId)
    } catch (e) {
      console.warn('JoinConversation failed, will retry after start', e)
      try { await connRef.current?.start(); await connRef.current?.invoke('JoinConversation', convId) } catch {}
    }
  }

  async function onSend(){
    if (!text.trim()) return
    const convId = active.conversationId || active.ConversationId || active.id || active.Id
    let payload = { ConversationId: convId, Content: text, Type: 0 }
    if (replyTo) {
      payload.ParentMessageId = replyTo.id || replyTo.Id || replyTo
    }
    // Slash command: /giphy query
    if (text.startsWith('/giphy ')) {
      const q = text.slice(7).trim()
      if (q) {
        try {
          const key = import.meta.env.VITE_GIPHY_KEY || 'dc6zaTOxFJmzC'
          const res = await fetch(`https://api.giphy.com/v1/gifs/translate?api_key=${encodeURIComponent(key)}&s=${encodeURIComponent(q)}&weirdness=0`)
          const data = await res.json()
          const gifUrl = data?.data?.images?.downsized_medium?.url || data?.data?.images?.original?.url
          if (gifUrl) {
            payload = { ConversationId: convId, Content: `giphy: ${q}`, Type: 1, Metadata: gifUrl }
          }
        } catch (e) { console.warn('giphy fetch failed', e) }
      }
    }
    try {
      await sendMessage(payload)
      setText('')
      setReplyTo(null)
    } catch (e) {
      console.error('send failed', e)
    }
  }

  async function onUpload(e){
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const convId = active.conversationId || active.ConversationId || active.id || active.Id
    for (const file of files){
      try { await upload(convId, file) } catch (err) { console.warn('upload failed', file.name, err) }
    }
  }

  async function onTyping(v){
    setText(v)
    if (active) {
      await connRef.current?.invoke('Typing', active.conversationId || active.ConversationId || active.id || active.Id, true)
      setTimeout(()=> connRef.current?.invoke('Typing', active.conversationId || active.ConversationId || active.id || active.Id, false), 1000)
    }
    // Mention autocomplete
    const m = v.match(/@([A-Za-z0-9_]*)$/)
    if (m){
      const q = m[1]?.toLowerCase()
      const list = members.filter(u => ((u.username||u.Username||'')+'').toLowerCase().startsWith(q)).slice(0,6)
      setMentionList(list)
      setMentionOpen(list.length>0)
    } else {
      setMentionOpen(false)
    }
  }

  async function newDirect(){
    const name = prompt('Tên cuộc trò chuyện:')
    if (!name) return
    const { data } = await createConversation({ name, type: 1, members: [] })
    if (data?.code) {
      alert(`Mã phòng: ${data.code}\nHãy chia sẻ mã này để người khác tham gia.`)
    }
    const list = await listConversations().then(r=>r.data)
    setConvs(list)
  }

  return (
    <div className="h-screen grid grid-cols-12">
      <aside className="col-span-3 border-r bg-white dark:bg-gray-800 flex flex-col">
        <div className="p-3 border-b flex justify-between items-center">
          <div className="font-semibold text-gray-800 dark:text-gray-100">Realtime Chat</div>
          <div className="space-x-2">
            <button className="text-sm" onClick={()=>setDark(d=>!d)}>{dark?'☀️':'🌙'}</button>
            <button className="text-sm" title="Create conversation" onClick={newDirect}>＋</button>
            <button className="text-sm" title="Discover" onClick={async()=>{ const {data}=await discoverConversations(); setDiscover(data) }}>🔎</button>
            <button className="text-sm" title="Users" onClick={async()=>{ const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users`, { headers: { Authorization: `Bearer ${token}` } }); const data = await res.json(); setUsers(data); setShowUsers(true) }}>👥</button>
            <button className="text-sm relative" title="Mentions" onClick={async()=>{ const {data}=await mentionFeed(true,1,50); alert((data||[]).map(m=>`[${new Date(m.createdAt).toLocaleString()}] #${m.conversationId}: ${m.content}`).join('\n')||'No mentions'); setMentionCount(0) }}>@{mentionCount>0&&<span className="ml-1 bg-red-600 text-white rounded-full px-1 text-[10px]">{mentionCount}</span>}</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {convs.map(c => (
            <div key={(c.conversationId||c.ConversationId||c.id||c.Id)} onClick={()=>openConv(c)} className={`p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${active && (active.conversationId||active.ConversationId||active.id||active.Id)===(c.conversationId||c.ConversationId||c.id||c.Id) ? 'bg-gray-100 dark:bg-gray-700':''}`}>
              <div className="text-gray-800 dark:text-gray-100">{c.name || c.Name}</div>
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span>{(c.type||c.Type)===0?'Direct':(c.type||c.Type)===1?'Group':'Channel'}</span>
                {!!unreadMap[(c.conversationId||c.ConversationId||c.id||c.Id)] && <span className="bg-red-600 text-white rounded-full px-2">{unreadMap[(c.conversationId||c.ConversationId||c.id||c.Id)]}</span>}
              </div>
            </div>
          ))}
          {discover.length>0 && (
            <div className="mt-3 border-t">
              <div className="px-3 pt-2 text-xs uppercase text-gray-500">Discover</div>
              {discover.map(dc => (
                <div key={(dc.id||dc.Id)} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="text-gray-800 dark:text-gray-100">{dc.name || dc.Name}</div>
                    <div className="text-xs text-gray-500">{(dc.type||dc.Type)===0?'Direct':(dc.type||dc.Type)===1?'Group':'Channel'}</div>
                  </div>
                  <button className="text-sm text-blue-600" onClick={async()=>{ const code = prompt('Nhập mã phòng'); if(!code) return; await joinConversation(dc.id||dc.Id, code); const cs = await listConversations().then(r=>r.data); setConvs(cs); setDiscover(d=>d.filter(x=>(x.id||x.Id)!==(dc.id||dc.Id))); }}>Join</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
      <main className="col-span-9 flex flex-col">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">Chọn một cuộc trò chuyện</div>
        ) : (
          <>
            <div className="border-b p-3 text-gray-700 dark:text-gray-100 flex items-center justify-between">
              <div>{active.name || active.Name}</div>
              <div className="space-x-2 text-xs">
                <button className="px-2 py-1 border rounded" onClick={async()=>{ const id = active.conversationId||active.ConversationId||active.id||active.Id; navigator.clipboard?.writeText(id); alert('Đã copy ID phòng') }}>Copy ID</button>
                <button className="px-2 py-1 border rounded" onClick={async()=>{ const id = active.conversationId||active.ConversationId||active.id||active.Id; try{ const {data} = await conversationCode(id); await navigator.clipboard?.writeText(data.code||data.Code); alert('Đã copy mã phòng') } catch { alert('Không lấy được mã phòng') } }}>Copy Code</button>
                <button className="px-2 py-1 border rounded text-red-600" onClick={async()=>{ const id = active.conversationId||active.ConversationId||active.id||active.Id; if(confirm('Xóa cuộc trò chuyện?')){ await deleteConversation(id); const cs = await listConversations().then(r=>r.data); setConvs(cs); setActive(null); setMessages([]) } }}>Xóa</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-3" onDragOver={e=>{ e.preventDefault() }} onDrop={async e=>{ e.preventDefault(); if (!active) return; const convId = active.conversationId || active.ConversationId || active.id || active.Id; const files = Array.from(e.dataTransfer.files||[]); for (const f of files){ try{ await upload(convId, f) } catch(err){ console.warn('upload failed', f.name, err) } } }} onScroll={async e=>{ const el=e.currentTarget; if (el.scrollTop < 50 && hasMoreRef.current){ const convId = active.conversationId || active.ConversationId || active.id || active.Id; pageRef.current += 1; const res = await history(convId, pageRef.current); const items = res.data.items.reverse(); if (items.length===0){ hasMoreRef.current=false; return } setMessages(m=>[...items, ...m]) } }}>
              {messages.map(m => {
                const mine = m.senderId===user?.id
                const name = m.senderDisplayName || m.senderUsername || 'Unknown'
                const avatar = m.senderAvatarUrl || '/default-avatar.svg'
                return (
                  <div key={m.id || m.Id} className={`flex gap-2 ${mine?'justify-end':''}`}>
                    {!mine && <img src={avatar} className="w-8 h-8 rounded-full self-end" />}
                    <div className={`max-w-[70%] ${mine ? 'bg-blue-600 text-white':'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'} rounded p-2`}>
                      {!mine && <div className="text-xs opacity-80 mb-1">{name}</div>}
                      {m.parentMessageId && <div className="text-[11px] opacity-70 mb-1">↪ Reply</div>}
                      <div className="text-sm whitespace-pre-wrap">{m.type===1? (<img src={m.metadata} className="max-h-64 rounded" />) : renderContent(m.content)}</div>
                      <MessageReactions messageId={m.id||m.Id} reactions={reactions[m.id||m.Id]||{}} onReact={async(emoji)=>{ try{ await react(m.id||m.Id, emoji) }catch(e){ console.warn(e) } }} onUnreact={async(emoji)=>{ try{ await unreact(m.id||m.Id, emoji) }catch(e){ console.warn(e) } }} />
                      <div className="mt-1 text-[12px] opacity-80 flex gap-2">
                        <button onClick={()=>setReplyTo(m)} title="Trả lời">↩️ Reply</button>
                      </div>
                      {m.ephemeralExpiresAt && <div className="text-[10px] opacity-70">Tự hủy: {new Date(m.ephemeralExpiresAt).toLocaleTimeString()}</div>}
                    </div>
                    {mine && <img src={user?.avatarUrl || '/default-avatar.svg'} className="w-8 h-8 rounded-full self-end" />}
                  </div>
                )
              })}
            </div>
            <div className="p-3 border-t flex items-center gap-2 relative">
              {replyTo && (
                <div className="absolute -top-10 left-3 right-3 text-xs bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 flex justify-between items-center">
                  <div>Trả lời: {(replyTo.content||'').slice(0,60)}</div>
                  <button onClick={()=>setReplyTo(null)} title="Hủy">✖</button>
                </div>
              )}
              <input type="file" multiple onChange={onUpload} />
              <input value={text} onChange={e=>onTyping(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onSend()} className="flex-1 p-2 rounded border dark:bg-gray-800 dark:border-gray-700" placeholder="Nhập tin nhắn... @mention, /giphy ..." />
              <button onClick={onSend} className="px-3 py-2 rounded bg-blue-600 text-white">Gửi</button>
              <div className="absolute right-3 -top-9 flex items-center gap-2">
                <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Tìm..." className="text-sm p-1 rounded border dark:bg-gray-800 dark:border-gray-700" />
                <button className="text-sm px-2 py-1 border rounded" onClick={async()=>{ const convId = active.conversationId || active.ConversationId || active.id || active.Id; const {data} = await searchMessages(convId, searchQ); alert((data||[]).map(m=>`[${new Date(m.createdAt).toLocaleString()}] ${m.senderDisplayName||m.senderUsername}: ${m.content}`).join('\n')||'Không có kết quả') }}>Tìm</button>
              </div>
              {mentionOpen && (
                <div className="absolute bottom-14 left-24 bg-white dark:bg-gray-800 rounded shadow min-w-[200px] max-h-60 overflow-auto">
                  {mentionList.map(u => (
                    <div key={u.userId} className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2" onClick={()=>{
                      const uname = u.username||u.Username
                      const replaced = text.replace(/@([A-Za-z0-9_]*)$/, '@'+uname+' ')
                      setText(replaced)
                      setMentionOpen(false)
                    }}>
                      <img src={u.avatarUrl || u.AvatarUrl || '/default-avatar.svg'} className="w-6 h-6 rounded-full"/>
                      <div>
                        <div className="text-sm">{u.displayName || u.DisplayName || u.username || u.Username}</div>
                        <div className="text-xs text-gray-500">@{u.username||u.Username}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-3 text-xs text-gray-500 h-5">{Object.entries(typingUsers).some(([_,v])=>v) && 'Đang nhập...'}</div>
          </>
        )}
      </main>
    </div>
  )
    {showUsers && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={()=>setShowUsers(false)}>
        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow w-96" onClick={e=>e.stopPropagation()}>
          <div className="font-semibold mb-2">Chọn người để nhắn tin</div>
          <div className="max-h-80 overflow-auto divide-y divide-gray-200 dark:divide-gray-700">
            {users.map(u => (
              <div key={u.id||u.Id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <img src={u.avatarUrl || u.AvatarUrl || '/default-avatar.svg'} className="w-8 h-8 rounded-full" />
                  <div>
                    <div className="text-gray-800 dark:text-gray-100">{u.displayName || u.DisplayName || u.username || u.Username}</div>
                    <div className="text-xs text-gray-500">@{u.username || u.Username}</div>
                  </div>
                </div>
                <button className="text-sm text-blue-600" onClick={async()=>{ const {data} = await directConversation(u.id||u.Id); const cs = await listConversations().then(r=>r.data); setConvs(cs); const conv = cs.find(x => (x.id||x.Id) === (data.id||data.Id)); setShowUsers(false); if (conv) openConv(conv); }}>Nhắn</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
}

function renderContent(text){
  const parts = String(text||'').split(/(@[A-Za-z0-9_]+)/g)
  return parts.map((p,i)=>{
    if (p.startsWith && p.startsWith('@') && p.length>1){
      return <span key={i} className="text-blue-600">{p}</span>
    }
    return <span key={i}>{p}</span>
  })
}

function MessageReactions({ messageId, reactions, onReact, onUnreact }){
  const [open, setOpen] = React.useState(false)
  const emojis = ['👍','❤️','😂','🎉','😮','😢']
  return (
    <div className="mt-1 flex items-center gap-2">
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
