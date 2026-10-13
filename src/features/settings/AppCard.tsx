import { useEffect, useState } from 'react'
import { BellRing, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Checkbox, Switch } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { useToast } from '@/components/ui/Toast'
import {
  LEAD_OPTIONS,
  notificationPermission,
  notificationsSupported,
  savePrefs,
  showNotice,
  useNotifyPrefs,
  type NotifyPrefs,
} from '@/lib/notify'
import { useInstall } from '@/lib/pwa'
import { useT } from '@/i18n/I18nProvider'
import { Row } from './Row'

type Kind = 'classes' | 'blocks' | 'tasks' | 'exams'

/** Instalar DayFlow como app, trabajar sin conexión y activar los avisos. */
export function AppCard() {
  const t = useT()
  const { toast } = useToast()
  const install = useInstall()
  const prefs = useNotifyPrefs()
  const [permission, setPermission] = useState(notificationPermission)

  // El permiso se cambia desde los ajustes del navegador: se relee al volver a la pestaña.
  useEffect(() => {
    const refresh = () => setPermission(notificationPermission())
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  const active = prefs.enabled && permission === 'granted'

  const toggle = async (on: boolean) => {
    if (!on) {
      savePrefs({ ...prefs, enabled: false })
      toast(t('notify.disabledToast'), { tone: 'info' })
      return
    }
    if (!notificationsSupported()) {
      toast(t('notify.unsupported'), { tone: 'error' })
      return
    }
    // El permiso solo se pide aquí, al pulsar: los navegadores ignoran peticiones sin gesto.
    const result = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    setPermission(result)
    if (result === 'granted') {
      savePrefs({ ...prefs, enabled: true })
      toast(t('notify.enabledToast'))
    } else if (result === 'denied') {
      toast(t('notify.denied'), { tone: 'error' })
    }
  }

  const setKind = (kind: Kind, value: boolean) => savePrefs({ ...prefs, [kind]: value } as NotifyPrefs)

  const sendTest = async () => {
    const ok = await showNotice({
      title: t('notify.testTitle'),
      body: t('notify.testBody'),
      url: '#/settings',
      tag: 'dayflow-test',
    })
    toast(ok ? t('notify.testSent') : t('notify.testFailed'), { tone: ok ? 'success' : 'error' })
  }

  const installHint = install.installed
    ? t('pwa.installed')
    : install.canInstall
      ? t('pwa.installHint')
      : install.ios
        ? t('pwa.installIos')
        : t('pwa.installManual')

  const offlineHint = install.offlineReady
    ? t('pwa.offlineReady')
    : install.offlineSupported
      ? t('pwa.offlinePending')
      : t('pwa.offlineDev')

  const noticeHint = !notificationsSupported()
    ? t('notify.unsupported')
    : permission === 'denied'
      ? t('notify.denied')
      : t('notify.desc')

  const kinds: Array<{ key: Kind; label: string }> = [
    { key: 'classes', label: t('notify.typeClasses') },
    { key: 'blocks', label: t('notify.typeBlocks') },
    { key: 'tasks', label: t('notify.typeTasks') },
    { key: 'exams', label: t('notify.typeExams') },
  ]

  return (
    <Card>
      <CardHeader title={t('pwa.title')} icon={<Download size={16} />} />
      <div className="mt-2">
        <Row title={t('pwa.installTitle')} description={installHint}>
          {!install.installed && install.canInstall ? (
            <Button
              variant="secondary"
              onClick={async () => {
                if ((await install.promptInstall()) === 'accepted') toast(t('pwa.installDone'))
              }}
            >
              <Download size={15} />
              {t('pwa.installButton')}
            </Button>
          ) : null}
        </Row>

        <Row title={t('pwa.offlineTitle')} description={offlineHint} />

        <Row title={t('notify.title')} description={noticeHint}>
          <Switch
            checked={active}
            onChange={toggle}
            label={t('notify.title')}
          />
        </Row>

        {active ? (
          <>
            <Row title={t('notify.what')}>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                {kinds.map((k) => (
                  <Checkbox key={k.key} checked={prefs[k.key]} onChange={(v) => setKind(k.key, v)} label={k.label} />
                ))}
              </div>
            </Row>
            <Row title={t('notify.lead')} description={t('notify.leadHint')}>
              <Segmented
                size="sm"
                ariaLabel={t('notify.lead')}
                value={String(prefs.leadMin)}
                onChange={(v) => savePrefs({ ...prefs, leadMin: Number(v) })}
                options={LEAD_OPTIONS.map((n) => ({ value: String(n), label: t('notify.leadOption', { n }) }))}
              />
            </Row>
            <Row title={t('notify.test')}>
              <Button variant="secondary" onClick={sendTest}>
                <BellRing size={15} />
                {t('notify.testButton')}
              </Button>
            </Row>
          </>
        ) : null}

        <p className="px-5 pb-4 pt-1 text-xs leading-relaxed text-ink-3">{t('notify.limits')}</p>
      </div>
    </Card>
  )
}
