import { useEffect, useState } from 'react'
import { Cloud, CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/Confirm'
import { cn } from '@/lib/cn'
import { formatClock } from '@/lib/date'
import { useT } from '@/i18n/I18nProvider'
import { useSync } from '@/store/SyncProvider'

function AuthModal({
  open,
  onClose,
  initialMode,
}: {
  open: boolean
  onClose: () => void
  initialMode: 'signIn' | 'signUp'
}) {
  const { signIn, signUp } = useSync()
  const t = useT()
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setErrors({})
    setPassword('')
    setBusy(false)
  }, [open, initialMode])

  const submit = async () => {
    const found: typeof errors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) found.email = t('auth.errEmail')
    if (password.length < 8) found.password = t('auth.errPassword')
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }

    setBusy(true)
    const result = mode === 'signIn' ? await signIn(email.trim(), password) : await signUp(email.trim(), password)
    setBusy(false)
    if (!result.ok) {
      setErrors({ form: result.error })
      return
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={mode === 'signIn' ? t('auth.modalSignIn') : t('auth.modalSignUp')}
      description={mode === 'signIn' ? t('auth.modalSignInSub') : t('auth.modalSignUpSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label={t('auth.email')} htmlFor="auth-email" error={errors.email} required>
          <TextInput
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setErrors((x) => ({ ...x, email: undefined, form: undefined }))
            }}
            placeholder={t('auth.emailPlaceholder')}
            aria-invalid={Boolean(errors.email)}
          />
        </Field>

        <Field
          label={t('auth.password')}
          htmlFor="auth-password"
          error={errors.password}
          hint={t('auth.passwordHint')}
          required
        >
          <TextInput
            id="auth-password"
            type="password"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setErrors((x) => ({ ...x, password: undefined, form: undefined }))
            }}
            aria-invalid={Boolean(errors.password)}
          />
        </Field>

        {errors.form ? (
          <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm font-medium text-bad" role="alert">
            {errors.form}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'))
            setErrors({})
          }}
          className="text-sm font-medium text-brand-ink hover:underline"
        >
          {mode === 'signIn' ? t('auth.toSignUp') : t('auth.toSignIn')}
        </button>

        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          {t('auth.signIn')}
        </button>
      </form>
    </Modal>
  )
}

/** Status text for the current sync state, already translated. */
export function useSyncStatusLabel(): string {
  const { status, lastSyncedAt } = useSync()
  const t = useT()
  switch (status) {
    case 'syncing':
      return t('sync.statusSyncing')
    case 'synced':
      return lastSyncedAt
        ? t('sync.statusSynced', {
            time: formatClock(
              `${String(lastSyncedAt.getHours()).padStart(2, '0')}:${String(lastSyncedAt.getMinutes()).padStart(2, '0')}`,
            ),
          })
        : t('sync.statusIdle')
    case 'error':
      return t('sync.statusError')
    case 'offline':
      return t('sync.statusOffline')
    default:
      return t('sync.statusIdle')
  }
}

export function CloudCard() {
  const { available, email, status, syncNow, signOut } = useSync()
  const confirm = useConfirm()
  const t = useT()
  const [authOpen, setAuthOpen] = useState(false)
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const statusLabel = useSyncStatusLabel()

  if (!available) return null

  const open = (next: 'signIn' | 'signUp') => {
    setMode(next)
    setAuthOpen(true)
  }

  const confirmSignOut = async () => {
    const ok = await confirm({
      title: t('auth.signOutTitle'),
      message: t('auth.signOutBody'),
      confirmLabel: t('auth.signOut'),
    })
    if (ok) await signOut()
  }

  return (
    <>
      <Card>
        <CardHeader
          title={t('auth.cardTitle')}
          subtitle={email ? t('auth.signedInSub', { email }) : t('auth.signedOutSub')}
          icon={email ? <Cloud size={16} /> : <CloudOff size={16} />}
        />
        <div className="p-5 pt-3">
          {email ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3">
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    status === 'synced'
                      ? 'bg-good'
                      : status === 'error'
                        ? 'bg-bad'
                        : status === 'offline'
                          ? 'bg-warn'
                          : 'bg-ink-3',
                  )}
                  aria-hidden="true"
                />
                <span className="text-sm text-ink-2">{statusLabel}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void syncNow()} disabled={status === 'syncing'}>
                  <RefreshCw size={15} className={cn(status === 'syncing' && 'animate-spin')} />
                  {t('sync.syncNow')}
                </Button>
                <Button variant="secondary" onClick={confirmSignOut}>
                  <LogOut size={15} />
                  {t('auth.signOut')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => open('signIn')}>
                <Cloud size={15} />
                {t('auth.signIn')}
              </Button>
              <Button variant="secondary" onClick={() => open('signUp')}>
                {t('auth.signUp')}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={mode} />
    </>
  )
}
