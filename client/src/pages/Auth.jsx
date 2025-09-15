import React, { useState } from 'react'
import { login, register } from '../lib/api'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    try {
      const res = mode === 'login'
        ? await login(username, password)
        : await register(username, password, displayName)
      localStorage.setItem('token', res.data.token)
      location.href = '/'
    } catch (err) {
      setError('Failed: ' + (err.response?.data?.message || err.message))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <form onSubmit={submit} className="bg-white dark:bg-gray-800 p-6 rounded shadow w-80 space-y-3">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</h1>
        {error && <div className="text-red-500 text-sm">{error}</div>}
        <input className="w-full p-2 rounded border dark:bg-gray-700 dark:border-gray-600" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} />
        {mode==='register' && (
          <input className="w-full p-2 rounded border dark:bg-gray-700 dark:border-gray-600" placeholder="Display name" value={displayName} onChange={e=>setDisplayName(e.target.value)} />
        )}
        <input type="password" className="w-full p-2 rounded border dark:bg-gray-700 dark:border-gray-600" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="w-full p-2 rounded bg-blue-600 text-white">{mode === 'login' ? 'Login' : 'Register'}</button>
        <button type="button" onClick={()=>setMode(mode==='login'?'register':'login')} className="text-sm text-blue-600">
          {mode==='login'?'Chưa có tài khoản? Đăng ký':'Đã có tài khoản? Đăng nhập'}
        </button>
      </form>
    </div>
  )
}

