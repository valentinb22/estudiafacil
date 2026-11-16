import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui/Display'
import { SegmentedControl } from '../../components/ui/Form'
import { AudiosPanel } from './audio/AudiosPanel'
import { FilesPanel } from './files/FilesPanel'
import { ResourcesPanel } from './resources/ResourcesPanel'

type Tab = 'audios' | 'archivos' | 'recursos'
const TABS: { value: Tab; label: string }[] = [
  { value: 'audios', label: 'Audios' },
  { value: 'archivos', label: 'Archivos y apuntes' },
  { value: 'recursos', label: 'Recursos' },
]
const isTab = (v: string | null): v is Tab => v === 'audios' || v === 'archivos' || v === 'recursos'

export function StudyPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  // ?record=1 siempre abre la pestaña de audios (la grabadora vive ahí)
  const tab: Tab = params.get('record') === '1' ? 'audios' : isTab(raw) ? raw : 'audios'

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Espacio de Estudio"
        description="Audios para repasar en cualquier lugar, tus apuntes y los recursos de cada materia."
      />
      <div className="mb-6">
        <SegmentedControl label="Sección del espacio de estudio" value={tab} onChange={setTab} options={TABS} />
      </div>
      <div role="region" aria-label={TABS.find((t) => t.value === tab)?.label}>
        {tab === 'audios' && <AudiosPanel />}
        {tab === 'archivos' && <FilesPanel />}
        {tab === 'recursos' && <ResourcesPanel />}
      </div>
    </div>
  )
}
