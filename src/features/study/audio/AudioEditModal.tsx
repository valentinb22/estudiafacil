import type { FormEvent } from 'react'
import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Field, Input, Textarea } from '../../../components/ui/Form'
import { Modal } from '../../../components/ui/Modal'
import { SubjectSelect } from '../../../components/ui/SubjectSelect'
import { update } from '../../../lib/db'
import type { AudioItem } from '../../../lib/types'

/** Edición de título, materia y guion. Se monta sólo mientras está abierto. */
export function AudioEditModal({ audio, onClose }: { audio: AudioItem; onClose: () => void }) {
  const [title, setTitle] = useState(audio.title)
  const [subjectId, setSubjectId] = useState(audio.subjectId)
  const [script, setScript] = useState(audio.script ?? '')

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!title.trim()) return
    await update('audios', audio.id, { title: title.trim(), subjectId, script: script.trim() || undefined })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar audio"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => save()} disabled={!title.trim()}>
            Guardar cambios
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Título">
          {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} required />}
        </Field>
        <Field label="Materia">
          {(id) => <SubjectSelect id={id} value={subjectId} onChange={setSubjectId} />}
        </Field>
        <Field label="Guion">
          {(id) => (
            <Textarea
              id={id}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Texto que acompaña al audio"
              className="min-h-40"
            />
          )}
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
