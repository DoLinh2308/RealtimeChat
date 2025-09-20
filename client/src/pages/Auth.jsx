import React, { useState } from 'react'
import { login, register } from '../lib/api'

const gradients = [
  'from-[#4f46e5] via-[#7c3aed] to-[#f472b6]',
  'from-[#0ea5e9] via-[#6366f1] to-[#a855f7]',
  'from-[#14b8a6] via-[#22d3ee] to-[#818cf8]'
]

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', password: '', displayName: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const gradient = gradients[new Date().getDay() % gradients.length]
  const isLogin = mode === 'login'

  const handleChange = (field) => (event) => {
    setForm(prev => ({ ...prev, [field]: event.target.value }))
  }

  const toggleMode = () => {
    setMode(isLogin ? 'register' : 'login')
    setError('')
    setSuccess('')
    setForm({ username: '', password: '', displayName: '' })
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!form.username.trim() || !form.password.trim()){
      setError('Vui lòng nhập đủ thông tin đăng nhập')
      return
    }
    if (!isLogin && !form.displayName.trim()){
      setError('Vui lòng nhập tên hiển thị')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = isLogin
        ? await login(form.username.trim(), form.password)
        : await register(form.username.trim(), form.password, form.displayName.trim())
      localStorage.setItem('token', res.data.token)
      setSuccess(isLogin ? 'Đăng nhập thành công!' : 'Tạo tài khoản thành công!')
      setTimeout(() => { location.href = '/' }, 600)
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Đã xảy ra lỗi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br ${gradient} px-4 py-6`}>

      <div className="max-w-5xl w-full grid md:grid-cols-2 gap-8 items-center">
        <div className="hidden md:flex flex-col gap-4 text-white">
          <h1 className="text-4xl font-extrabold drop-shadow-sm">Realtime Chat</h1>
          <p className="text-lg opacity-90">Trò chuyện, gọi nhóm và cộng tác theo thời gian thực với giao diện lấy cảm hứng từ Microsoft Teams.</p>
          <div className="space-y-2 text-sm opacity-80">
            <p>• Nhận thông báo cuộc gọi kể cả khi đang ở phòng khác.</p>
            <p>• Hỗ trợ gửi ảnh, phản ứng nhanh và nhắc đến bạn bè.</p>
            <p>• Chỉnh sửa hồ sơ, tìm kiếm nhóm và tham gia chỉ với vài bước.</p>
          </div>
        </div>
        <div className="bg-white/90 backdrop-blur rounded-3xl shadow-xl p-8 md:p-10 space-y-6">
          <div>
            <div className="text-sm font-medium text-indigo-500 uppercase tracking-wide">{isLogin ? 'Chào mừng trở lại' : 'Tạo tài khoản mới'}</div>
            <h2 className="text-2xl font-semibold text-slate-800 mt-1">{isLogin ? 'Đăng nhập để tiếp tục' : 'Tham gia cộng đồng của chúng tôi'}</h2>
          </div>
          <form className="space-y-5" onSubmit={submit}>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tên đăng nhập</label>
              <input value={form.username} onChange={handleChange('username')} placeholder="yourname" className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            {!isLogin && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tên hiển thị</label>
                <input value={form.displayName} onChange={handleChange('displayName')} placeholder="Tên bạn bè nhìn thấy" className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mật khẩu</label>
              <input type="password" value={form.password} onChange={handleChange('password')} placeholder="•••••••" className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</div>}
            {success && <div className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">{success}</div>}
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 transition disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Đang xử lý...' : isLogin ? 'Đăng nhập' : 'Đăng ký'}
            </button>
          </form>
          <button type="button" onClick={toggleMode} className="w-full text-sm text-indigo-600 hover:text-indigo-500">
            {isLogin ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
          </button>
        </div>
      </div>
    </div>
  )
}


