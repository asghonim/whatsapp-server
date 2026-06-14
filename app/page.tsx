'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type AppStatus = 'connected' | 'disconnected' | 'awaiting_scan'
type EvType = 'in' | 'out' | 'sys'
type AppEvent = { id: string; ts: number; type: EvType; from?: string; body: string }
type Webhook = { id: string; url: string; events: string[]; secret: string; last: string; ok: boolean }
type WsApp = {
  id: string; name: string; slug: string; status: AppStatus
  phone: string | null; key: string
  sent: number; recv: number
  webhooks: Webhook[]
  events: AppEvent[]
  connectedAt?: number
}
type Route = 'landing' | 'auth' | 'console'
type View = 'dashboard' | 'app' | 'docs'
type Tab = 'overview' | 'initialize' | 'playground' | 'webhooks' | 'listen'
type AuthMode = 'signin' | 'signup'
type Pairing = 'scanning' | 'syncing' | null
type StatusMeta = { label: string; dot: string; bg: string; fg: string; pulse: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seedApps(): WsApp[] {
  const t = Date.now()
  return [
    {
      id: 'a1', name: 'Acme Notify', slug: 'acme-notify', status: 'connected',
      phone: '+1 415 555 0132', key: 'ws_live_k2j9x7m4q8w1e5r3t6y0u2i8',
      sent: 12482, recv: 3911, connectedAt: t - 51480000,
      webhooks: [{ id: 'wh1', url: 'https://api.acme.dev/hooks/wa', events: ['message.received', 'session.disconnected'], secret: 'whsec_p2m8…', last: '200 · 2m ago', ok: true }],
      events: [
        { id: 'e1', ts: t - 7200000, type: 'sys', body: 'session.connected — device linked (+1 415 555 0132)' },
        { id: 'e2', ts: t - 312000, type: 'in', from: '+1 628 555 0199', body: 'Hi! Did my order ship yet?' },
        { id: 'e3', ts: t - 298000, type: 'out', from: '+1 628 555 0199', body: 'Your order #1042 shipped this morning.' },
        { id: 'e4', ts: t - 121000, type: 'in', from: '+44 7700 900123', body: 'Can I change my delivery address?' },
      ]
    },
    {
      id: 'a2', name: 'Support Bot', slug: 'support-bot', status: 'disconnected',
      phone: null, key: 'ws_live_b7n3v9c1z5x8a4s6d2f0g7h3',
      sent: 0, recv: 0, webhooks: [],
      events: [{ id: 'e0', ts: t - 86400000, type: 'sys', body: 'App created — session not initialized' }]
    },
    {
      id: 'a3', name: 'OTP Relay', slug: 'otp-relay', status: 'connected',
      phone: '+44 7700 900123', key: 'ws_live_m4k8j2h6g0f3d7s1a5q9w3e7',
      sent: 48109, recv: 1204, connectedAt: t - 432000000,
      webhooks: [{ id: 'wh2', url: 'https://otp.internal.acme.dev/wa', events: ['message.sent'], secret: 'whsec_x9k2…', last: '200 · 41s ago', ok: true }],
      events: [
        { id: 'e5', ts: t - 60000, type: 'out', from: '+1 305 555 0144', body: 'Your verification code is 482913' },
        { id: 'e6', ts: t - 44000, type: 'in', from: '+1 305 555 0144', body: 'Thanks, that worked.' },
      ]
    },
  ]
}

function statusMeta(s: AppStatus): StatusMeta {
  if (s === 'connected') return { label: 'Connected', dot: 'oklch(0.62 0.15 155)', bg: 'oklch(0.96 0.03 155)', fg: 'oklch(0.42 0.12 155)', pulse: 'none' }
  if (s === 'awaiting_scan') return { label: 'Awaiting scan', dot: 'oklch(0.75 0.14 80)', bg: 'oklch(0.97 0.035 85)', fg: 'oklch(0.5 0.11 75)', pulse: 'pulse 1.4s ease infinite' }
  return { label: 'Disconnected', dot: '#b9b9c0', bg: '#f1f1f3', fg: '#6b6b74', pulse: 'none' }
}

function slugify(n: string): string {
  return (n || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function makeKey(): string {
  let k = 'ws_live_'
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 24; i++) k += c[Math.floor(Math.random() * c.length)]
  return k
}

function fmtT(ts: number): string {
  return new Date(ts).toTimeString().slice(0, 8)
}

function QrGrid({ seed }: { seed: number }) {
  const n = 25
  let s = (seed >>> 0) || 7
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  const g: boolean[][] = []
  for (let y = 0; y < n; y++) { const row: boolean[] = []; for (let x = 0; x < n; x++) row.push(rnd() > 0.5); g.push(row) }
  const finder = (fx: number, fy: number) => {
    for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) {
      const gy = fy + y, gx = fx + x
      if (gy < 0 || gx < 0 || gy >= n || gx >= n) continue
      if (y < 0 || x < 0 || y > 6 || x > 6) { g[gy][gx] = false; continue }
      g[gy][gx] = (x === 0 || x === 6 || y === 0 || y === 6) || (x >= 2 && x <= 4 && y >= 2 && y <= 4)
    }
  }
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7)
  const cells = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    cells.push(<div key={y * n + x} style={{ background: g[y][x] ? '#131316' : 'transparent' }} />)
  }
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, width: 200, height: 200 }}>{cells}</div>
}

type PgDef = { id: string; m: string; path: string; target?: boolean; body?: boolean; def?: string }

const pgDefs: PgDef[] = [
  { id: 'send', m: 'POST', path: '/send/', target: true, body: true, def: '{\n  "message": "Your order #1042 has shipped."\n}' },
  { id: 'status', m: 'GET', path: '/status' },
  { id: 'init', m: 'POST', path: '/init' },
  { id: 'listen', m: 'GET', path: '/listen' },
  { id: 'wh', m: 'POST', path: '/webhooks/register', body: true, def: '{\n  "url": "https://api.yourapp.com/hooks/wa",\n  "events": ["message.received"]\n}' },
  { id: 'logout', m: 'DELETE', path: '/session' },
]

const INCOMING_POOL: [string, string][] = [
  ['+1 628 555 0199', 'Hello? Anyone there?'],
  ['+44 7700 900123', 'What are your support hours?'],
  ['+1 305 555 0144', 'Got it, thanks!'],
  ['+49 1573 5550172', 'Order 2231 arrived damaged, what now?'],
  ['+1 917 555 0186', 'STOP'],
  ['+34 612 555 089', 'Is this number monitored?'],
  ['+1 628 555 0199', 'Can you resend the tracking link?'],
]

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo({ size = 26 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.31), background: 'oklch(0.58 0.14 155)', display: 'flex', flexDirection: 'column', gap: Math.round(size * 0.115), alignItems: 'flex-start', justifyContent: 'center', paddingLeft: Math.round(size * 0.23) }}>
      <div style={{ width: Math.round(size * 0.46), height: Math.round(size * 0.115), borderRadius: 2, background: '#fff' }} />
      <div style={{ width: Math.round(size * 0.31), height: Math.round(size * 0.115), borderRadius: 2, background: 'rgba(255,255,255,0.72)' }} />
    </div>
  )
}

function Wordmark({ size = 15 }: { size?: number }) {
  return (
    <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: size, fontWeight: 600, letterSpacing: '-0.02em' }}>
      whatsapp-server<span style={{ color: 'oklch(0.55 0.14 155)' }}>.io</span>
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ m }: { m: StatusMeta }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: m.bg, color: m.fg, borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 500 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot, animation: m.pulse, flexShrink: 0 }} />
      {m.label}
    </span>
  )
}

// ─── Method Chip ─────────────────────────────────────────────────────────────

function methodChip(m: string) {
  if (m === 'GET') return { fg: 'oklch(0.45 0.1 250)', bg: 'oklch(0.95 0.03 250)' }
  if (m === 'DELETE') return { fg: 'oklch(0.48 0.14 25)', bg: 'oklch(0.96 0.025 25)' }
  return { fg: 'oklch(0.45 0.12 155)', bg: 'oklch(0.95 0.04 155)' }
}

// ─── Landing ─────────────────────────────────────────────────────────────────

function Landing({ goSignin, goSignup, openDocs }: { goSignin: () => void; goSignup: () => void; openDocs: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 1120, width: '100%', margin: '0 auto', padding: '0 32px' }}>
        {/* Nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 76 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo />
            <Wordmark />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Btn ghost onClick={openDocs}>Docs</Btn>
            <Btn ghost onClick={goSignin}>Sign in</Btn>
            <Btn dark onClick={goSignup}>Get started</Btn>
          </div>
        </div>

        {/* Hero */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 64, alignItems: 'center', padding: '72px 0 88px' }}>
          <div style={{ animation: 'fadeUp 0.5s ease both' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #e3e3e8', background: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: '#5d5d66', fontWeight: 500, marginBottom: 24 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.62 0.15 155)' }} />
              Developer preview — bring your own number
            </div>
            <h1 style={{ fontSize: 52, lineHeight: 1.06, letterSpacing: '-0.035em', fontWeight: 700, margin: '0 0 20px', textWrap: 'balance' } as React.CSSProperties}>
              Cloud WhatsApp instances, behind a REST API.
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: '#5d5d66', margin: '0 0 32px', maxWidth: '46ch', textWrap: 'pretty' } as React.CSSProperties}>
              Create an app, pair your own number by scanning a QR code, and start sending and receiving messages over HTTP — webhooks included. Powered internally by whatsapp-web.js.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Btn dark onClick={goSignup} style={{ fontSize: 15, padding: '12px 22px', borderRadius: 9 }}>Create your first app</Btn>
              <Btn outline onClick={openDocs} style={{ fontSize: 15, padding: '12px 22px', borderRadius: 9 }}>Read the docs</Btn>
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 36, fontSize: 13, color: '#8c8c95', fontFamily: "'Geist Mono',monospace" }}>
              <span>REST + SSE</span><span>·</span><span>Webhooks</span><span>·</span><span>QR pairing</span>
            </div>
          </div>

          {/* Terminal demo */}
          <div style={{ background: '#101013', borderRadius: 14, border: '1px solid #232329', boxShadow: '0 24px 60px -24px rgba(16,16,19,0.4)', overflow: 'hidden', animation: 'fadeUp 0.5s 0.08s ease both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '13px 16px', borderBottom: '1px solid #232329' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a3a42' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a3a42' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a3a42' }} />
              <span style={{ marginLeft: 8, fontFamily: "'Geist Mono',monospace", fontSize: 12, color: '#6e6e78' }}>terminal</span>
            </div>
            <div style={{ padding: '20px 22px', fontFamily: "'Geist Mono',monospace", fontSize: 12.5, lineHeight: 1.75 }}>
              <div style={{ color: '#8c8c95' }}><span style={{ color: '#55555e' }}>$</span> curl -X POST https://whatsapp-server.io/api/<span style={{ color: 'oklch(0.78 0.13 155)' }}>acme-notify</span>/send/+14155550144 \</div>
              <div style={{ color: '#8c8c95', paddingLeft: 18 }}>-H &quot;Authorization: Bearer ws_live_k2...&quot; \</div>
              <div style={{ color: '#8c8c95', paddingLeft: 18 }}>-d &apos;&#123;&quot;message&quot;: &quot;Your order has shipped.&quot;&#125;&apos;</div>
              <div style={{ height: 12 }} />
              <div style={{ color: '#55555e' }}>{'// 200 OK · 184ms'}</div>
              <div style={{ color: '#c9c9d1' }}>{'{'}</div>
              <div style={{ color: '#c9c9d1', paddingLeft: 18 }}>&quot;id&quot;: <span style={{ color: 'oklch(0.78 0.13 155)' }}>&quot;msg_8fj2kq&quot;</span>,</div>
              <div style={{ color: '#c9c9d1', paddingLeft: 18 }}>&quot;to&quot;: &quot;+14155550144&quot;,</div>
              <div style={{ color: '#c9c9d1', paddingLeft: 18 }}>&quot;status&quot;: <span style={{ color: 'oklch(0.78 0.13 155)' }}>&quot;queued&quot;</span></div>
              <div style={{ color: '#c9c9d1' }}>{'}'}</div>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div style={{ borderTop: '1px solid #ececef', padding: '56px 0 72px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 40 }}>
            {[
              ['01', 'Create an app', 'Each app lives in your organization and gets its own API namespace and key.'],
              ['02', 'Pair your number', 'Scan a QR code from the phone that owns the number. The session stays warm in the cloud.'],
              ['03', 'Call the API', 'Send messages, stream inbound events over SSE, or register webhooks for delivery.'],
            ].map(([n, title, desc]) => (
              <div key={n}>
                <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: '#8c8c95', marginBottom: 10 }}>{n}</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 14, lineHeight: 1.55, color: '#5d5d66', textWrap: 'pretty' } as React.CSSProperties}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* API surface */}
        <div style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 14, padding: '28px 32px', marginBottom: 88 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8c8c95', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 18 }}>The API surface</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px 40px', fontFamily: "'Geist Mono',monospace", fontSize: 13.5 }}>
            {[
              ['POST', '/api/[app]/init', 'oklch(0.5 0.13 155)'],
              ['GET', '/api/[app]/status', 'oklch(0.52 0.12 250)'],
              ['POST', '/api/[app]/send/[target]', 'oklch(0.5 0.13 155)'],
              ['GET', '/api/[app]/listen', 'oklch(0.52 0.12 250)'],
              ['POST', '/api/[app]/webhooks/register', 'oklch(0.5 0.13 155)'],
              ['DEL', '/api/[app]/session', 'oklch(0.55 0.16 25)'],
            ].map(([m, path, fg]) => (
              <div key={path} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ color: fg, fontWeight: 600, width: 52 }}>{m}</span>
                <span style={{ color: '#3f3f46' }}>{path}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto', borderTop: '1px solid #ececef', background: '#fff' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#8c8c95' }}>
          <span style={{ fontFamily: "'Geist Mono',monospace" }}>whatsapp-server.io</span>
          <span>Not affiliated with WhatsApp Inc. — prototype</span>
        </div>
      </div>
    </div>
  )
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function Auth({ mode, setMode, onSubmit, goLanding }: { mode: AuthMode; setMode: (m: AuthMode) => void; onSubmit: () => void; goLanding: () => void }) {
  const isSignin = mode === 'signin'
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ width: 380, animation: 'fadeUp 0.4s ease both' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={goLanding}>
            <Logo />
            <Wordmark />
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 14, padding: 32, boxShadow: '0 10px 30px -18px rgba(16,16,19,0.12)' }}>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>
            {isSignin ? 'Welcome back' : 'Create your account'}
          </div>
          <div style={{ fontSize: 14, color: '#5d5d66', marginBottom: 24 }}>
            {isSignin ? 'Sign in to your developer console.' : 'Free while in developer preview.'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="email" placeholder="you@company.com" style={inputStyle} />
            <input type="password" placeholder="Password" style={inputStyle} />
            <button onClick={onSubmit} style={{ ...darkBtnStyle, marginTop: 4 }}>
              {isSignin ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 14, color: '#5d5d66' }}>
          {isSignin ? 'New here?' : 'Already registered?'}{' '}
          <button onClick={() => setMode(isSignin ? 'signup' : 'signin')} style={{ background: 'none', border: 'none', color: '#131316', fontWeight: 600, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {isSignin ? 'Create an account' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shared button styles ─────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '11px 13px', border: '1px solid #e3e3e8', borderRadius: 9,
  fontSize: 14, fontFamily: 'inherit', background: '#fff', outline: 'none', width: '100%',
}

const darkBtnStyle: React.CSSProperties = {
  background: '#16161a', color: '#fff', border: 'none', borderRadius: 9,
  padding: '12px 22px', fontSize: 14.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
}

function Btn({ children, onClick, dark, ghost, outline, style }: {
  children: React.ReactNode; onClick?: () => void; dark?: boolean; ghost?: boolean; outline?: boolean; style?: React.CSSProperties
}) {
  if (dark) return (
    <button onClick={onClick} style={{ background: '#16161a', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', ...style }}>
      {children}
    </button>
  )
  if (ghost) return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: '#5d5d66', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', padding: '8px 12px', borderRadius: 8, ...style }}>
      {children}
    </button>
  )
  if (outline) return (
    <button onClick={onClick} style={{ background: '#fff', color: '#131316', border: '1px solid #e3e3e8', borderRadius: 8, padding: '9px 16px', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', ...style }}>
      {children}
    </button>
  )
  return <button onClick={onClick} style={{ fontFamily: 'inherit', cursor: 'pointer', ...style }}>{children}</button>
}

// ─── Console Nav ─────────────────────────────────────────────────────────────

function ConsoleNav({ orgName, openDashboard, openDocs, signOut, docsActive }: {
  orgName: string; openDashboard: () => void; openDocs: () => void; signOut: () => void; docsActive: boolean
}) {
  return (
    <div style={{ background: '#fff', borderBottom: '1px solid #e7e7ea', position: 'sticky', top: 0, zIndex: 20 }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 32px', height: 58, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }} onClick={openDashboard}>
          <Logo size={22} />
          <Wordmark size={13.5} />
        </div>
        <div style={{ width: 1, height: 20, background: '#e7e7ea' }} />
        <div style={{ fontSize: 13.5, color: '#5d5d66', fontWeight: 500 }}>{orgName}</div>
        <div style={{ flex: 1 }} />
        <button onClick={openDocs} style={{ background: 'none', border: 'none', color: docsActive ? '#131316' : '#5d5d66', fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', padding: '7px 11px', borderRadius: 7 }}>Docs</button>
        <button onClick={signOut} style={{ background: 'none', border: 'none', color: '#5d5d66', fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', padding: '7px 11px', borderRadius: 7 }}>Sign out</button>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'oklch(0.93 0.03 155)', color: 'oklch(0.42 0.11 155)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>JD</div>
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ apps, orgName, openNewApp, openApp }: {
  apps: WsApp[]; orgName: string; openNewApp: () => void; openApp: (id: string) => void
}) {
  return (
    <div style={{ maxWidth: 1120, width: '100%', margin: '0 auto', padding: '40px 32px', animation: 'fadeUp 0.35s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Apps</h1>
          <div style={{ fontSize: 14, color: '#5d5d66' }}>WhatsApp instances in {orgName}</div>
        </div>
        <button onClick={openNewApp} style={{ background: '#16161a', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>+ New app</button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.7fr 24px', gap: 16, padding: '11px 20px', borderBottom: '1px solid #ececef', fontSize: 12, fontWeight: 600, color: '#8c8c95', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>App</span><span>Status</span><span>Number</span><span style={{ textAlign: 'right' }}>Sent</span><span />
        </div>
        {apps.map(a => {
          const m = statusMeta(a.status)
          return (
            <div key={a.id} onClick={() => openApp(a.id)} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.7fr 24px', gap: 16, padding: '16px 20px', borderBottom: '1px solid #f2f2f4', cursor: 'pointer', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: '#8c8c95', marginTop: 2 }}>/api/{a.slug}</div>
              </div>
              <div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: m.bg, color: m.fg, borderRadius: 999, padding: '4px 11px', fontSize: 12.5, fontWeight: 500 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot, animation: m.pulse }} />{m.label}
                </span>
              </div>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: '#3f3f46' }}>{a.phone || '—'}</div>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: '#3f3f46', textAlign: 'right' }}>{a.sent.toLocaleString('en-US')}</div>
              <div style={{ color: '#c9c9d1', fontSize: 16 }}>›</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── App Detail ───────────────────────────────────────────────────────────────

function AppDetail({ app, tab, setTab, keyRevealed, setKeyRevealed, qrActive, qrLeft, qrSeed, pairing, pgState, pgHandlers, whState, whHandlers, listenState, listenHandlers, onDisconnect, onGoInit, onGenerateQr, onSimulateScan, onCopy, onToast, openDashboard }: {
  app: WsApp; tab: Tab; setTab: (t: Tab) => void;
  keyRevealed: boolean; setKeyRevealed: (v: boolean) => void;
  qrActive: boolean; qrLeft: number; qrSeed: number; pairing: Pairing;
  pgState: PgState; pgHandlers: PgHandlers;
  whState: WhState; whHandlers: WhHandlers;
  listenState: ListenState; listenHandlers: ListenHandlers;
  onDisconnect: () => void; onGoInit: () => void; onGenerateQr: () => void; onSimulateScan: () => void;
  onCopy: (text: string, msg?: string) => void; onToast: (msg: string) => void;
  openDashboard: () => void;
}) {
  const m = statusMeta(app.status)
  const conn = app.status === 'connected'
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'initialize', label: 'Initialize' },
    { id: 'playground', label: 'Playground' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'listen', label: 'Listen' },
  ]
  const epDefs: [string, string][] = [
    ['POST', `/api/${app.slug}/init`],
    ['GET', `/api/${app.slug}/status`],
    ['POST', `/api/${app.slug}/send/[target]`],
    ['GET', `/api/${app.slug}/listen`],
    ['POST', `/api/${app.slug}/webhooks/register`],
    ['DELETE', `/api/${app.slug}/session`],
  ]

  return (
    <div style={{ maxWidth: 1120, width: '100%', margin: '0 auto', padding: '32px 32px 64px', animation: 'fadeUp 0.35s ease both' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: '#8c8c95', marginBottom: 14 }}>
        <span onClick={openDashboard} style={{ cursor: 'pointer', color: '#5d5d66' }}>Apps</span>
        <span style={{ margin: '0 4px' }}>/</span>
        <span style={{ color: '#131316', fontWeight: 500 }}>{app.name}</span>
      </div>

      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>{app.name}</h1>
        <StatusBadge m={m} />
      </div>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: '#8c8c95', marginBottom: 24 }}>
        https://whatsapp-server.io/api/{app.slug} · {app.phone || 'No number paired'}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e7e7ea', marginBottom: 28 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid #131316' : '2px solid transparent', color: tab === t.id ? '#131316' : '#6b6b74', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', padding: '10px 14px', marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Session card */}
            <div style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 12, padding: '22px 24px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8c8c95', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>Session</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: m.fg }}>{m.label}</div>
                  <div style={{ fontSize: 13.5, color: '#5d5d66', marginTop: 3 }}>
                    {conn ? `Paired with ${app.phone} — instance warm` : app.status === 'awaiting_scan' ? 'Waiting for a phone to scan the QR code' : 'No active session. Initialize to pair a number.'}
                  </div>
                </div>
                {conn
                  ? <button onClick={onDisconnect} style={{ background: '#fff', color: 'oklch(0.5 0.15 25)', border: '1px solid #ecdcda', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>Disconnect</button>
                  : <button onClick={onGoInit} style={{ background: '#16161a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>Initialize →</button>
                }
              </div>
            </div>
            {/* Usage */}
            <div style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 12, padding: '22px 24px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8c8c95', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Usage — last 30 days</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                {[
                  [app.sent.toLocaleString('en-US'), 'Messages sent'],
                  [app.recv.toLocaleString('en-US'), 'Received'],
                  [String(app.webhooks.length), 'Webhooks'],
                ].map(([val, label]) => (
                  <div key={label}>
                    <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', fontFamily: "'Geist Mono',monospace" }}>{val}</div>
                    <div style={{ fontSize: 12.5, color: '#8c8c95', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* API key */}
            <div style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 12, padding: '22px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#8c8c95', textTransform: 'uppercase', letterSpacing: '0.05em' }}>API key</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <SmallBtn onClick={() => setKeyRevealed(!keyRevealed)}>{keyRevealed ? 'Hide' : 'Reveal'}</SmallBtn>
                  <SmallBtn onClick={() => onCopy(app.key, 'API key copied')}>Copy</SmallBtn>
                </div>
              </div>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, background: '#f6f6f8', border: '1px solid #ececef', borderRadius: 8, padding: '11px 13px', color: '#3f3f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {keyRevealed ? app.key : 'ws_live_••••••••••••••••••••••••'}
              </div>
              <div style={{ fontSize: 12.5, color: '#8c8c95', marginTop: 10 }}>
                Pass as <span style={{ fontFamily: "'Geist Mono',monospace" }}>Authorization: Bearer</span> on every request.
              </div>
            </div>
          </div>
          {/* Endpoints */}
          <div style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 12, padding: '22px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#8c8c95', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Endpoints</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {epDefs.map(([method, path]) => {
                const chip = methodChip(method)
                const label = method === 'DELETE' ? 'DEL' : method
                return (
                  <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #ececef', borderRadius: 9, padding: '10px 13px' }}>
                    <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11.5, fontWeight: 600, color: chip.fg, background: chip.bg, borderRadius: 5, padding: '3px 7px', width: 48, textAlign: 'center' }}>{label}</span>
                    <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12.5, color: '#3f3f46', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
                    <button onClick={() => onCopy('https://whatsapp-server.io' + path, 'Endpoint copied')} style={{ background: 'none', border: 'none', color: '#8c8c95', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', padding: '3px 7px', borderRadius: 6 }}>Copy</button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Initialize */}
      {tab === 'initialize' && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
          <div style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 14, padding: 36, width: 560, textAlign: 'center' }}>
            {conn && (
              <>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'oklch(0.95 0.04 155)', color: 'oklch(0.45 0.13 155)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 16px' }}>✓</div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Session active</div>
                <div style={{ fontSize: 14, color: '#5d5d66', marginBottom: 6 }}>Linked to <span style={{ fontFamily: "'Geist Mono',monospace", color: '#131316' }}>{app.phone}</span></div>
                <div style={{ fontSize: 13, color: '#8c8c95', marginBottom: 24 }}>The instance stays warm — no need to keep your phone online.</div>
                <button onClick={onDisconnect} style={{ background: '#fff', color: 'oklch(0.5 0.15 25)', border: '1px solid #ecdcda', borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>Disconnect session</button>
              </>
            )}
            {!conn && !qrActive && !pairing && (
              <>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Initialize this instance</div>
                <div style={{ fontSize: 14, color: '#5d5d66', lineHeight: 1.6, maxWidth: '40ch', margin: '0 auto 24px', textWrap: 'pretty' } as React.CSSProperties}>Generate a QR code, then scan it from the phone that owns the number you want to connect.</div>
                <button onClick={onGenerateQr} style={{ background: '#16161a', color: '#fff', border: 'none', borderRadius: 9, padding: '12px 22px', fontSize: 14.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>Generate QR code</button>
                <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: '#8c8c95', marginTop: 20 }}>POST https://whatsapp-server.io/api/{app.slug}/init</div>
              </>
            )}
            {!conn && qrActive && !pairing && (
              <>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 18 }}>Scan with your phone</div>
                <div style={{ display: 'inline-block', border: '1px solid #e7e7ea', borderRadius: 12, padding: 14, background: '#fff' }}>
                  <QrGrid seed={qrSeed} />
                </div>
                <div style={{ fontSize: 13, color: '#8c8c95', marginTop: 14 }}>QR refreshes in <span style={{ fontFamily: "'Geist Mono',monospace", color: '#131316', fontWeight: 600 }}>{qrLeft}s</span></div>
                <div style={{ fontSize: 13.5, color: '#5d5d66', lineHeight: 1.7, margin: '18px auto 22px', maxWidth: '42ch', textAlign: 'left' }}>
                  <div>1. Open WhatsApp on the phone with your number</div>
                  <div>2. Go to Settings → Linked devices</div>
                  <div>3. Tap &ldquo;Link a device&rdquo; and scan this code</div>
                </div>
                <button onClick={onSimulateScan} style={{ background: '#fff', color: '#131316', border: '1px dashed #c9c9d1', borderRadius: 9, padding: '10px 18px', fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>Simulate phone scan (demo)</button>
              </>
            )}
            {pairing && (
              <>
                <div style={{ width: 40, height: 40, border: '3px solid #ececef', borderTop: '3px solid oklch(0.58 0.14 155)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '14px auto 20px' }} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{pairing === 'scanning' ? 'QR code scanned' : 'Syncing session…'}</div>
                <div style={{ fontSize: 13.5, color: '#8c8c95' }}>{pairing === 'scanning' ? 'Authenticating device with WhatsApp servers' : 'Encrypting and warming the cloud instance'}</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Playground */}
      {tab === 'playground' && (
        <PlaygroundTab app={app} state={pgState} handlers={pgHandlers} />
      )}

      {/* Webhooks */}
      {tab === 'webhooks' && (
        <WebhooksTab app={app} state={whState} handlers={whHandlers} onToast={onToast} />
      )}

      {/* Listen */}
      {tab === 'listen' && (
        <ListenTab app={app} state={listenState} handlers={listenHandlers} />
      )}
    </div>
  )
}

// ─── Playground Tab ───────────────────────────────────────────────────────────

type PgState = { pgId: string; pgTarget: string; pgBody: string; pgSending: boolean; pgResp: { code: number; ms: number; body: string } | null }
type PgHandlers = {
  setPgId: (id: string) => void
  setPgTarget: (v: string) => void
  setPgBody: (v: string) => void
  run: () => void
}

function PlaygroundTab({ app, state, handlers }: { app: WsApp; state: PgState; handlers: PgHandlers }) {
  const { pgId, pgTarget, pgBody, pgSending, pgResp } = state
  const def = pgDefs.find(d => d.id === pgId)!
  const hasResp = !!pgResp
  const codeFg = pgResp && pgResp.code < 400 ? 'oklch(0.78 0.13 155)' : 'oklch(0.72 0.16 25)'
  const codeBg = pgResp && pgResp.code < 400 ? 'rgba(34,160,94,0.14)' : 'rgba(220,80,60,0.14)'
  const codeLabel = pgResp ? `${pgResp.code}${pgResp.code === 200 ? ' OK' : pgResp.code === 201 ? ' Created' : ' Conflict'}` : ''
  const urlPreview = `${def.m === 'DELETE' ? 'DELETE' : def.m} https://whatsapp-server.io/api/${app.slug}${def.path}${def.target ? pgTarget.replace(/\s/g, '') : ''}`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 20, alignItems: 'start' }}>
      <div style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 12, padding: '22px 24px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#8c8c95', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Request</div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#5d5d66', marginBottom: 6 }}>Endpoint</label>
        <select value={pgId} onChange={e => { const d = pgDefs.find(x => x.id === e.target.value)!; handlers.setPgId(d.id); handlers.setPgBody('def' in d && d.def ? d.def : '') }} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e3e3e8', borderRadius: 9, fontSize: 13.5, fontFamily: "'Geist Mono',monospace", background: '#fff', outline: 'none', cursor: 'pointer', marginBottom: 16 }}>
          <option value="send">POST /send/[target]</option>
          <option value="status">GET /status</option>
          <option value="init">POST /init</option>
          <option value="listen">GET /listen</option>
          <option value="wh">POST /webhooks/register</option>
          <option value="logout">DELETE /session</option>
        </select>
        {def.target && (
          <>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#5d5d66', marginBottom: 6 }}>Target number</label>
            <input value={pgTarget} onChange={e => handlers.setPgTarget(e.target.value)} style={{ ...inputStyle, fontFamily: "'Geist Mono',monospace", marginBottom: 16 }} />
          </>
        )}
        {def.body && (
          <>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#5d5d66', marginBottom: 6 }}>Body</label>
            <textarea value={pgBody} onChange={e => handlers.setPgBody(e.target.value)} rows={5} style={{ width: '100%', padding: '11px 13px', border: '1px solid #e3e3e8', borderRadius: 9, fontSize: 13, fontFamily: "'Geist Mono',monospace", background: '#f8f8fa', outline: 'none', resize: 'vertical', lineHeight: 1.6, marginBottom: 16, color: '#3f3f46' }} />
          </>
        )}
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11.5, color: '#8c8c95', background: '#f6f6f8', borderRadius: 7, padding: '9px 11px', marginBottom: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{urlPreview}</div>
        <button onClick={handlers.run} style={{ background: '#16161a', color: '#fff', border: 'none', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', width: '100%' }}>
          {pgSending ? 'Sending…' : 'Send request'}
        </button>
      </div>
      <div style={{ background: '#101013', border: '1px solid #232329', borderRadius: 12, overflow: 'hidden', minHeight: 320, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: '1px solid #232329' }}>
          <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: '#6e6e78', flex: 1 }}>Response</span>
          {hasResp && (
            <>
              <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11.5, fontWeight: 600, color: codeFg, background: codeBg, borderRadius: 5, padding: '3px 8px' }}>{codeLabel}</span>
              <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11.5, color: '#6e6e78' }}>{pgResp!.ms}ms</span>
            </>
          )}
        </div>
        <div style={{ padding: '18px 20px', flex: 1 }}>
          {pgSending && <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6e6e78', fontFamily: "'Geist Mono',monospace", fontSize: 12.5 }}><span style={{ width: 14, height: 14, border: '2px solid #2c2c33', borderTop: '2px solid oklch(0.7 0.13 155)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />sending…</div>}
          {hasResp && !pgSending && <pre style={{ margin: 0, fontFamily: "'Geist Mono',monospace", fontSize: 12.5, lineHeight: 1.7, color: '#c9c9d1', whiteSpace: 'pre-wrap', wordBreak: 'break-word', animation: 'fadeUp 0.25s ease both' }}>{pgResp!.body}</pre>}
          {!hasResp && !pgSending && <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12.5, color: '#55555e' }}>{'// send a request to see the response'}</div>}
        </div>
      </div>
    </div>
  )
}

// ─── Webhooks Tab ─────────────────────────────────────────────────────────────

type WhState = { whUrl: string; whEvents: Record<string, boolean> }
type WhHandlers = {
  setWhUrl: (v: string) => void
  toggleEvent: (k: string) => void
  register: () => void
  remove: (id: string) => void
  test: (id: string) => void
}

function WebhooksTab({ app, state, handlers, onToast }: { app: WsApp; state: WhState; handlers: WhHandlers; onToast: (m: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {app.webhooks.length === 0 && (
          <div style={{ background: '#fff', border: '1px dashed #dcdce1', borderRadius: 12, padding: 36, textAlign: 'center', color: '#8c8c95', fontSize: 14 }}>No webhooks registered yet.</div>
        )}
        {app.webhooks.map(w => (
          <div key={w.id} style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 500, color: '#131316', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url}</span>
              <SmallBtn onClick={() => handlers.test(w.id)}>Send test</SmallBtn>
              <button onClick={() => handlers.remove(w.id)} style={{ background: 'none', border: 'none', color: '#a4a4ad', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', padding: '5px 7px', borderRadius: 6 }}>Remove</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {w.events.map(ev => (
                <span key={ev} style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: '#5d5d66', background: '#f0f0f2', borderRadius: 5, padding: '3px 8px' }}>{ev}</span>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#8c8c95' }}>
              <span>Secret <span style={{ fontFamily: "'Geist Mono',monospace" }}>{w.secret}</span></span>
              <span>·</span>
              <span>Last delivery: <span style={{ color: w.ok ? 'oklch(0.5 0.13 155)' : '#8c8c95', fontWeight: 500 }}>{w.last}</span></span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 12, padding: '22px 24px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#8c8c95', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Register webhook</div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#5d5d66', marginBottom: 6 }}>Endpoint URL</label>
        <input value={state.whUrl} onChange={e => handlers.setWhUrl(e.target.value)} placeholder="https://api.yourapp.com/hooks/wa" style={{ ...inputStyle, fontFamily: "'Geist Mono',monospace", marginBottom: 16 }} />
        <div style={{ fontSize: 13, fontWeight: 500, color: '#5d5d66', marginBottom: 8 }}>Events</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 20 }}>
          {Object.keys(state.whEvents).map(k => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: '#3f3f46', cursor: 'pointer' }}>
              <input type="checkbox" checked={state.whEvents[k]} onChange={() => handlers.toggleEvent(k)} style={{ width: 15, height: 15, accentColor: 'oklch(0.5 0.13 155)', cursor: 'pointer' }} />
              <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12.5 }}>{k}</span>
            </label>
          ))}
        </div>
        <button onClick={handlers.register} style={{ background: '#16161a', color: '#fff', border: 'none', borderRadius: 9, padding: 11, fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', width: '100%' }}>Register webhook</button>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11.5, color: '#8c8c95', marginTop: 14 }}>POST https://whatsapp-server.io/api/{app.slug}/webhooks/register</div>
      </div>
    </div>
  )
}

// ─── Listen Tab ───────────────────────────────────────────────────────────────

type ListenState = { streaming: boolean; simBody: string }
type ListenHandlers = {
  toggleStream: () => void
  clearEvents: () => void
  setSimBody: (v: string) => void
  inject: () => void
}

function ListenTab({ app, state, handlers }: { app: WsApp; state: ListenState; handlers: ListenHandlers }) {
  const listenRef = useRef<HTMLDivElement>(null)
  const conn = app.status === 'connected'
  const streamDot = state.streaming && conn ? 'oklch(0.7 0.15 155)' : '#55555e'
  const streamPulse = state.streaming && conn ? 'pulse 1.4s ease infinite' : 'none'

  useEffect(() => {
    if (listenRef.current) listenRef.current.scrollTop = listenRef.current.scrollHeight
  }, [app.events])

  return (
    <>
      <div style={{ background: '#101013', border: '1px solid #232329', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: '1px solid #232329' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: streamDot, animation: streamPulse }} />
          <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12.5, color: '#c9c9d1', flex: 1 }}>GET https://whatsapp-server.io/api/{app.slug}/listen</span>
          <button onClick={handlers.clearEvents} style={{ background: 'none', border: '1px solid #2c2c33', borderRadius: 7, color: '#8c8c95', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', padding: '5px 11px' }}>Clear</button>
          <button onClick={handlers.toggleStream} style={{ background: '#1c1c21', border: '1px solid #2c2c33', borderRadius: 7, color: '#c9c9d1', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', padding: '5px 11px' }}>{state.streaming ? 'Pause' : 'Resume'}</button>
        </div>
        <div ref={listenRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {app.events.length === 0 && <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12.5, color: '#55555e' }}>{'// waiting for events…'}</div>}
          {app.events.map(e => {
            const badge = e.type === 'in' ? 'IN' : e.type === 'out' ? 'OUT' : 'SYS'
            const badgeFg = e.type === 'in' ? 'oklch(0.78 0.13 155)' : e.type === 'out' ? 'oklch(0.72 0.1 250)' : 'oklch(0.78 0.12 80)'
            const badgeBg = e.type === 'in' ? 'rgba(34,160,94,0.14)' : e.type === 'out' ? 'rgba(80,120,220,0.14)' : 'rgba(200,150,40,0.14)'
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'baseline', gap: 11, fontFamily: "'Geist Mono',monospace", fontSize: 12.5, lineHeight: 1.5, animation: 'fadeUp 0.2s ease both' }}>
                <span style={{ color: '#55555e', flexShrink: 0 }}>{fmtT(e.ts)}</span>
                <span style={{ color: badgeFg, background: badgeBg, borderRadius: 4, padding: '1px 6px', fontSize: 10.5, fontWeight: 600, flexShrink: 0 }}>{badge}</span>
                <span style={{ color: '#8c8c95', flexShrink: 0 }}>{e.from || 'system'}</span>
                <span style={{ color: '#e2e2e8', wordBreak: 'break-word' }}>{e.body}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '13px 18px', borderTop: '1px solid #232329' }}>
          <input value={state.simBody} onChange={e => handlers.setSimBody(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlers.inject()} placeholder="Simulate an inbound message…" style={{ flex: 1, padding: '9px 13px', border: '1px solid #2c2c33', borderRadius: 8, fontSize: 12.5, fontFamily: "'Geist Mono',monospace", background: '#1c1c21', color: '#e2e2e8', outline: 'none' }} />
          <button onClick={handlers.inject} style={{ background: 'oklch(0.58 0.14 155)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>Inject</button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: '#8c8c95', marginTop: 12 }}>Server-sent events stream. Each connected instance also fans out to registered webhooks.</div>
    </>
  )
}

// ─── Docs ─────────────────────────────────────────────────────────────────────

function Docs() {
  return (
    <div style={{ maxWidth: 1120, width: '100%', margin: '0 auto', padding: '40px 32px 80px', display: 'grid', gridTemplateColumns: '200px 1fr', gap: 48, animation: 'fadeUp 0.35s ease both' }}>
      <div style={{ position: 'sticky', top: 90, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13.5 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#8c8c95', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>API Reference</div>
        {[['#docs-auth', 'Authentication'], ['#docs-init', 'Initialize'], ['#docs-send', 'Send'], ['#docs-listen', 'Listen'], ['#docs-webhooks', 'Webhooks'], ['#docs-errors', 'Errors']].map(([href, label]) => (
          <a key={href} href={href} style={{ color: '#5d5d66', textDecoration: 'none', padding: '6px 10px', borderRadius: 7, display: 'block' }}>{label}</a>
        ))}
      </div>
      <div style={{ maxWidth: 680 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 8px' }}>API Reference</h1>
        <p style={{ fontSize: 15, color: '#5d5d66', lineHeight: 1.65, margin: '0 0 36px', textWrap: 'pretty' } as React.CSSProperties}>
          Every app you create exposes a namespaced REST API at <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13.5, background: '#f0f0f2', padding: '2px 6px', borderRadius: 5 }}>https://whatsapp-server.io/api/[app]</span>. Instances are powered internally by whatsapp-web.js and stay warm in the cloud once paired.
        </p>

        <DocSection id="docs-auth" title="Authentication">
          <p style={docP}>Pass your app&apos;s API key as a bearer token. Keys are scoped per app and can be rotated from the console.</p>
          <CodeBlock>{'Authorization: Bearer ws_live_k2j9x7m4q8w1e5r3t6y0u2i8'}</CodeBlock>
        </DocSection>

        <DocSection id="docs-init" title="/api/[app]/init" method="POST">
          <p style={docP}>Boots the instance and returns a pairing QR code. Scan it from the phone that owns the number. The QR rotates every 45 seconds until scanned.</p>
          <CodeBlock>{`curl -X POST https://whatsapp-server.io/api/acme-notify/init \\
  -H "Authorization: Bearer $WS_KEY"

// 200 OK
{
  "status": "awaiting_scan",
  "qr": "data:image/png;base64,iVBORw0K… (truncated)",
  "expires_in": 45
}`}</CodeBlock>
        </DocSection>

        <DocSection id="docs-send" title="/api/[app]/send/[target]" method="POST">
          <p style={docP}>Sends a message to a target number in E.164 format. Returns immediately with a queued message id; delivery status arrives via webhook or the listen stream.</p>
          <CodeBlock>{`curl -X POST https://whatsapp-server.io/api/acme-notify/send/+14155550144 \\
  -H "Authorization: Bearer $WS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Your order #1042 has shipped."}'

// 200 OK
{ "id": "msg_8fj2kq", "to": "+14155550144", "status": "queued" }`}</CodeBlock>
        </DocSection>

        <DocSection id="docs-listen" title="/api/[app]/listen" method="GET">
          <p style={docP}>Long-lived server-sent events stream of everything the instance sees: inbound messages, delivery receipts, and session lifecycle events.</p>
          <CodeBlock>{`curl -N https://whatsapp-server.io/api/acme-notify/listen \\
  -H "Authorization: Bearer $WS_KEY"

event: message.received
data: {"from": "+16285550199", "body": "Hi, did my order ship?"}

event: message.sent
data: {"id": "msg_8fj2kq", "status": "delivered"}`}</CodeBlock>
        </DocSection>

        <DocSection id="docs-webhooks" title="/api/[app]/webhooks/register" method="POST">
          <p style={docP}>Registers an HTTPS endpoint to receive events as signed POST requests. Verify the <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, background: '#f0f0f2', padding: '2px 6px', borderRadius: 5 }}>X-WS-Signature</span> header with your webhook secret.</p>
          <CodeBlock>{`curl -X POST https://whatsapp-server.io/api/acme-notify/webhooks/register \\
  -H "Authorization: Bearer $WS_KEY" \\
  -d '{"url": "https://api.acme.dev/hooks/wa", "events": ["message.received"]}'

// 201 Created
{ "id": "wh_3kd9", "secret": "whsec_p2m8x6k4j9q1w7e5" }`}</CodeBlock>
        </DocSection>

        <DocSection id="docs-errors" title="Errors">
          <p style={docP}>Errors use conventional HTTP status codes with a machine-readable body. Calling a messaging endpoint before pairing returns 409.</p>
          <CodeBlock>{`// 409 Conflict
{
  "error": "session_not_initialized",
  "hint": "POST /api/acme-notify/init and scan the QR code"
}`}</CodeBlock>
        </DocSection>
      </div>
    </div>
  )
}

const docP: React.CSSProperties = { fontSize: 14.5, color: '#5d5d66', lineHeight: 1.65, margin: '0 0 14px', textWrap: 'pretty' }

function DocSection({ id, title, method, children }: { id: string; title: string; method?: string; children: React.ReactNode }) {
  const chip = method ? methodChip(method) : null
  return (
    <div id={id} style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {chip && <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11.5, fontWeight: 600, color: chip.fg, background: chip.bg, borderRadius: 5, padding: '3px 8px' }}>{method}</span>}
        <h2 style={{ fontSize: 19, fontWeight: 600, margin: 0, fontFamily: chip ? "'Geist Mono',monospace" : 'inherit', letterSpacing: chip ? 0 : '-0.01em' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function CodeBlock({ children }: { children: string }) {
  return <pre style={{ margin: 0, background: '#101013', borderRadius: 10, padding: '16px 18px', fontFamily: "'Geist Mono',monospace", fontSize: 12.5, lineHeight: 1.7, color: '#c9c9d1', overflowX: 'auto' }}>{children}</pre>
}

// ─── Small Button ─────────────────────────────────────────────────────────────

function SmallBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ background: '#fff', border: '1px solid #e3e3e8', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', color: '#5d5d66', flexShrink: 0 }}>
      {children}
    </button>
  )
}

// ─── New App Modal ────────────────────────────────────────────────────────────

function NewAppModal({ orgName, name, setName, onCreate, onClose }: {
  orgName: string; name: string; setName: (v: string) => void; onCreate: () => void; onClose: () => void
}) {
  const slug = slugify(name) || 'your-app'
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,16,19,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 30px 80px -20px rgba(16,16,19,0.35)', animation: 'fadeUp 0.25s ease both' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>New app</div>
        <div style={{ fontSize: 13.5, color: '#5d5d66', marginBottom: 20 }}>Created in {orgName}. You will pair a number after.</div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#5d5d66', marginBottom: 6 }}>App name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onCreate()}
          placeholder="e.g. Order Notifications"
          style={{ ...inputStyle, marginBottom: 12 }}
          autoFocus
        />
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: '#8c8c95', background: '#f6f6f8', borderRadius: 7, padding: '9px 12px', marginBottom: 20 }}>/api/{slug}/…</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#fff', color: '#5d5d66', border: '1px solid #e3e3e8', borderRadius: 9, padding: '10px 16px', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>Cancel</button>
          <button onClick={onCreate} style={{ background: '#16161a', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>Create app</button>
        </div>
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg }: { msg: string }) {
  return (
    <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16161a', color: '#fff', borderRadius: 10, padding: '11px 20px', fontSize: 13.5, fontWeight: 500, zIndex: 100, boxShadow: '0 12px 32px -8px rgba(16,16,19,0.4)', animation: 'fadeUp 0.25s ease both', whiteSpace: 'nowrap' }}>
      {msg}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const ORG = 'Acme Labs'

  // Route state
  const [route, setRoute] = useState<Route>('landing')
  const [view, setView] = useState<View>('dashboard')
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')

  // App data
  const [apps, setApps] = useState<WsApp[]>(seedApps)

  // UI state
  const [showNewApp, setShowNewApp] = useState(false)
  const [newAppName, setNewAppName] = useState('')
  const [keyRevealed, setKeyRevealed] = useState(false)

  // QR / pairing
  const [qrActive, setQrActive] = useState(false)
  const [qrSeed, setQrSeed] = useState(7)
  const [qrLeft, setQrLeft] = useState(45)
  const [pairing, setPairing] = useState<Pairing>(null)

  // Playground
  const [pgId, setPgId] = useState('send')
  const [pgTarget, setPgTarget] = useState('+1 555 010 4477')
  const [pgBody, setPgBody] = useState('{\n  "message": "Your order #1042 has shipped."\n}')
  const [pgSending, setPgSending] = useState(false)
  const [pgResp, setPgResp] = useState<{ code: number; ms: number; body: string } | null>(null)

  // Listen
  const [streaming, setStreaming] = useState(true)
  const [simBody, setSimBody] = useState('Where is my package?')

  // Webhooks
  const [whUrl, setWhUrl] = useState('')
  const [whEvents, setWhEvents] = useState<Record<string, boolean>>({
    'message.received': true, 'message.sent': false, 'session.connected': false, 'session.disconnected': true
  })

  // Toast
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs
  const routeRef = useRef(route)
  const viewRef = useRef(view)
  const appsRef = useRef(apps)
  const selectedIdRef = useRef(selectedId)
  const streamingRef = useRef(streaming)
  const qrActiveRef = useRef(qrActive)
  const pairingRef = useRef(pairing)
  const qrLeftRef = useRef(qrLeft)

  useEffect(() => { routeRef.current = route }, [route])
  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => { appsRef.current = apps }, [apps])
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { streamingRef.current = streaming }, [streaming])
  useEffect(() => { qrActiveRef.current = qrActive }, [qrActive])
  useEffect(() => { pairingRef.current = pairing }, [pairing])
  useEffect(() => { qrLeftRef.current = qrLeft }, [qrLeft])

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('wsio_proto_v1', JSON.stringify({ apps, route, view, selectedId, tab }))
    } catch (e) {}
  }, [apps, route, view, selectedId, tab])

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const persisted = JSON.parse(localStorage.getItem('wsio_proto_v1') || 'null')
      if (persisted) {
        if (persisted.apps) setApps(persisted.apps)
        if (persisted.route) setRoute(persisted.route)
        if (persisted.view) setView(persisted.view)
        if (persisted.selectedId !== undefined) setSelectedId(persisted.selectedId)
        if (persisted.tab) setTab(persisted.tab)
      }
    } catch (e) {}
  }, [])

  // Helpers
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 1900)
  }, [])

  const copyText = useCallback((text: string, msg?: string) => {
    try { navigator.clipboard.writeText(text) } catch (e) {}
    showToast(msg || 'Copied to clipboard')
  }, [showToast])

  const updateApp = useCallback((id: string, patch: Partial<WsApp> | ((a: WsApp) => Partial<WsApp>)) => {
    setApps(prev => prev.map(a => a.id === id ? { ...a, ...(typeof patch === 'function' ? patch(a) : patch) } : a))
  }, [])

  const pushEvent = useCallback((id: string, ev: Omit<AppEvent, 'id' | 'ts'>) => {
    const e: AppEvent = { id: 'e' + Date.now() + Math.random().toString(36).slice(2, 6), ts: Date.now(), ...ev }
    setApps(prev => prev.map(a => a.id === id ? { ...a, events: [...a.events, e].slice(-120) } : a))
  }, [])

  const getApp = useCallback(() => appsRef.current.find(a => a.id === selectedIdRef.current) || null, [])

  // Tick
  useEffect(() => {
    const tick = () => {
      if (qrActiveRef.current && !pairingRef.current && routeRef.current === 'console') {
        if (qrLeftRef.current <= 1) {
          setQrSeed(Math.floor(Math.random() * 1e9))
          setQrLeft(45)
        } else {
          setQrLeft(l => l - 1)
        }
      }
      const app = appsRef.current.find(a => a.id === selectedIdRef.current) || null
      if (routeRef.current === 'console' && viewRef.current === 'app' && app && app.status === 'connected' && streamingRef.current && Math.random() < 0.13) {
        const pool = INCOMING_POOL
        const p = pool[Math.floor(Math.random() * pool.length)]
        const e: AppEvent = { id: 'e' + Date.now() + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'in', from: p[0], body: p[1] }
        setApps(prev => prev.map(a => a.id === app.id ? { ...a, events: [...a.events, e].slice(-120), recv: a.recv + 1 } : a))
      }
    }
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])

  // Actions
  const openApp = (id: string) => {
    setSelectedId(id); setView('app'); setTab('overview')
    setKeyRevealed(false); setQrActive(false); setPairing(null); setPgResp(null)
  }

  const createApp = () => {
    const name = newAppName.trim()
    if (!name) { showToast('Give your app a name'); return }
    const slug = slugify(name) || 'app-' + Date.now()
    const a: WsApp = {
      id: 'a' + Date.now(), name, slug, status: 'disconnected',
      phone: null, key: makeKey(), sent: 0, recv: 0, webhooks: [],
      events: [{ id: 'e' + Date.now(), ts: Date.now(), type: 'sys', body: 'App created — session not initialized' }]
    }
    setApps(prev => [...prev, a])
    setShowNewApp(false)
    setSelectedId(a.id); setView('app'); setTab('initialize')
    setKeyRevealed(false); setQrActive(false); setPairing(null); setPgResp(null)
    showToast('App created')
  }

  const disconnect = () => {
    const app = getApp(); if (!app) return
    updateApp(app.id, { status: 'disconnected' })
    pushEvent(app.id, { type: 'sys', body: 'session.disconnected — terminated from console' })
    setQrActive(false); setPairing(null)
    showToast('Session disconnected')
  }

  const generateQr = () => {
    const app = getApp(); if (!app) return
    setQrActive(true); setQrSeed(Math.floor(Math.random() * 1e9)); setQrLeft(45); setPairing(null)
    updateApp(app.id, { status: 'awaiting_scan' })
  }

  const simulateScan = () => {
    const app = getApp(); if (!app) return
    const id = app.id
    setPairing('scanning')
    setTimeout(() => setPairing('syncing'), 1300)
    setTimeout(() => {
      const currentApp = appsRef.current.find(a => a.id === id)
      const phone = (currentApp && currentApp.phone) || ('+1 415 555 0' + (100 + Math.floor(Math.random() * 899)))
      updateApp(id, { status: 'connected', phone, connectedAt: Date.now() })
      pushEvent(id, { type: 'sys', body: `session.connected — device linked (${phone})` })
      setPairing(null); setQrActive(false)
      showToast('Device linked — session active')
    }, 2900)
  }

  // Playground
  const pgRun = () => {
    if (pgSending) return
    const app = getApp(); if (!app) return
    const def = pgDefs.find(d => d.id === pgId)!
    const ms = 140 + Math.floor(Math.random() * 380)
    setPgSending(true); setPgResp(null)
    setTimeout(() => {
      const conn = app.status === 'connected'
      const target = pgTarget.replace(/\s/g, '')
      let code = 200, body = ''
      if (!conn && def.id !== 'init' && def.id !== 'status') {
        code = 409
        body = JSON.stringify({ error: 'session_not_initialized', hint: `POST /api/${app.slug}/init and scan the QR code` }, null, 2)
      } else if (def.id === 'send') {
        body = JSON.stringify({ id: 'msg_' + Math.random().toString(36).slice(2, 8), to: target, status: 'queued', queued_at: new Date().toISOString() }, null, 2)
        let msg = '(empty message)'
        try { msg = JSON.parse(pgBody).message || '(empty message)' } catch (e) { msg = '(raw body)' }
        pushEvent(app.id, { type: 'out', from: target, body: msg })
        updateApp(app.id, a => ({ sent: a.sent + 1 }))
      } else if (def.id === 'status') {
        body = JSON.stringify(conn
          ? { app: app.slug, session: 'connected', phone: app.phone, device: 'Android 14', battery: 81 }
          : { app: app.slug, session: 'disconnected' }, null, 2)
      } else if (def.id === 'init') {
        body = JSON.stringify({ status: 'awaiting_scan', qr: 'data:image/png;base64,iVBORw0K… (truncated)', expires_in: 45 }, null, 2)
      } else if (def.id === 'listen') {
        body = 'event: message.received\ndata: {"from": "+16285550199", "body": "Hi, did my order ship?"}\n\nevent: message.sent\ndata: {"id": "msg_8fj2kq", "status": "delivered"}'
      } else if (def.id === 'wh') {
        code = 201
        body = JSON.stringify({ id: 'wh_' + Math.random().toString(36).slice(2, 6), secret: 'whsec_' + Math.random().toString(36).slice(2, 18) }, null, 2)
      } else {
        body = JSON.stringify({ ok: true, session: 'terminated' }, null, 2)
        updateApp(app.id, { status: 'disconnected' })
        pushEvent(app.id, { type: 'sys', body: 'session.disconnected — terminated via API' })
      }
      setPgSending(false); setPgResp({ code, ms, body })
    }, ms + 260)
  }

  // Webhooks
  const registerWebhook = () => {
    const app = getApp(); if (!app) return
    const url = whUrl.trim()
    if (!url || !/^https:\/\//.test(url)) { showToast('Enter an https:// endpoint URL'); return }
    const events = Object.keys(whEvents).filter(k => whEvents[k])
    if (!events.length) { showToast('Pick at least one event'); return }
    const w: Webhook = { id: 'wh' + Date.now(), url, events, secret: 'whsec_' + Math.random().toString(36).slice(2, 6) + '…', last: '—', ok: false }
    updateApp(app.id, a => ({ webhooks: [...a.webhooks, w] }))
    setWhUrl('')
    showToast('Webhook registered')
  }

  const removeWebhook = (whId: string) => {
    const app = getApp(); if (!app) return
    updateApp(app.id, a => ({ webhooks: a.webhooks.filter(w => w.id !== whId) }))
    showToast('Webhook removed')
  }

  const testWebhook = (whId: string) => {
    const app = getApp(); if (!app) return
    showToast('Delivering test event…')
    setTimeout(() => {
      updateApp(app.id, a => ({ webhooks: a.webhooks.map(w => w.id === whId ? { ...w, last: '200 · just now', ok: true } : w) }))
      showToast('Test event delivered — 200 OK')
    }, 700)
  }

  // Inject message
  const inject = () => {
    const app = getApp(); if (!app) return
    if (app.status !== 'connected') { showToast('Session not connected — initialize first'); return }
    const body = simBody.trim() || 'Test message'
    pushEvent(app.id, { type: 'in', from: '+1 628 555 0199', body })
    updateApp(app.id, a => ({ recv: a.recv + 1 }))
  }

  const app = apps.find(a => a.id === selectedId) || null

  const pgState: PgState = { pgId, pgTarget, pgBody, pgSending, pgResp }
  const pgHandlers: PgHandlers = {
    setPgId, setPgTarget, setPgBody, run: pgRun
  }
  const whState: WhState = { whUrl, whEvents }
  const whHandlers: WhHandlers = {
    setWhUrl, toggleEvent: (k) => setWhEvents(e => ({ ...e, [k]: !e[k] })),
    register: registerWebhook, remove: removeWebhook, test: testWebhook
  }
  const listenState: ListenState = { streaming, simBody }
  const listenHandlers: ListenHandlers = {
    toggleStream: () => setStreaming(s => !s),
    clearEvents: () => app && updateApp(app.id, { events: [] }),
    setSimBody, inject
  }

  return (
    <div style={{ fontFamily: "'Geist',-apple-system,'Helvetica Neue',sans-serif", color: '#131316', minHeight: '100vh', background: '#fafafa' }}>
      {route === 'landing' && (
        <Landing
          goSignin={() => { setRoute('auth'); setAuthMode('signin') }}
          goSignup={() => { setRoute('auth'); setAuthMode('signup') }}
          openDocs={() => { setRoute('console'); setView('docs') }}
        />
      )}

      {route === 'auth' && (
        <Auth
          mode={authMode}
          setMode={setAuthMode}
          onSubmit={() => { setRoute('console'); setView('dashboard') }}
          goLanding={() => setRoute('landing')}
        />
      )}

      {route === 'console' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <ConsoleNav
            orgName={ORG}
            openDashboard={() => setView('dashboard')}
            openDocs={() => setView('docs')}
            signOut={() => setRoute('landing')}
            docsActive={view === 'docs'}
          />

          {view === 'dashboard' && (
            <Dashboard
              apps={apps}
              orgName={ORG}
              openNewApp={() => { setShowNewApp(true); setNewAppName('') }}
              openApp={openApp}
            />
          )}

          {view === 'app' && app && (
            <AppDetail
              app={app}
              tab={tab}
              setTab={setTab}
              keyRevealed={keyRevealed}
              setKeyRevealed={setKeyRevealed}
              qrActive={qrActive}
              qrLeft={qrLeft}
              qrSeed={qrSeed}
              pairing={pairing}
              pgState={pgState}
              pgHandlers={pgHandlers}
              whState={whState}
              whHandlers={whHandlers}
              listenState={listenState}
              listenHandlers={listenHandlers}
              onDisconnect={disconnect}
              onGoInit={() => setTab('initialize')}
              onGenerateQr={generateQr}
              onSimulateScan={simulateScan}
              onCopy={copyText}
              onToast={showToast}
              openDashboard={() => setView('dashboard')}
            />
          )}

          {view === 'docs' && <Docs />}
        </div>
      )}

      {showNewApp && (
        <NewAppModal
          orgName={ORG}
          name={newAppName}
          setName={setNewAppName}
          onCreate={createApp}
          onClose={() => setShowNewApp(false)}
        />
      )}

      {toast && <Toast msg={toast} />}
    </div>
  )
}
