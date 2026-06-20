import { useState } from 'react'
import { useStore } from '../../store/useStore'
import InputModal from '../InputModal'
import type { FileNode } from '../../types'

type ModalState = { title: string; placeholder: string; defaultValue: string; onConfirm: (v: string) => void } | null

function parentDir(relPath: string): string {
  const idx = relPath.lastIndexOf('/')
  return idx === -1 ? '' : relPath.slice(0, idx)
}

function join(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

function TreeNode({ node, depth, openModal }: {
  node: FileNode
  depth: number
  openModal: (s: NonNullable<ModalState>) => void
}): JSX.Element {
  const activePath = useStore((s) => s.activePath)
  const openFile = useStore((s) => s.openFile)
  const renamePath = useStore((s) => s.renamePath)
  const deletePath = useStore((s) => s.deletePath)
  const createFile = useStore((s) => s.createFile)
  const createFolder = useStore((s) => s.createFolder)

  const [open, setOpen] = useState(depth === 0)

  const askRename = (): void => openModal({
    title: `Renomear "${node.name}"`,
    placeholder: 'Novo nome',
    defaultValue: node.name,
    onConfirm: (next) => void renamePath(node.path, join(parentDir(node.path), next))
  })

  const askDelete = async (): Promise<void> => {
    const ok = await window.api.confirm(`Apagar "${node.name}"? Esta ação não pode ser desfeita.`)
    if (ok) void deletePath(node.path)
  }

  const askNewFile = (): void => openModal({
    title: 'Novo arquivo',
    placeholder: 'nome.md',
    defaultValue: '',
    onConfirm: (name) => void createFile(join(node.path, name))
  })

  const askNewFolder = (): void => openModal({
    title: 'Nova pasta',
    placeholder: 'nome-da-pasta',
    defaultValue: '',
    onConfirm: (name) => void createFolder(join(node.path, name))
  })

  if (node.isDir) {
    return (
      <div className="tree-folder">
        <div className="tree-row" style={{ paddingLeft: depth * 12 + 8 }} onClick={() => setOpen((o) => !o)}>
          <span className="tree-caret">{open ? '▾' : '▸'}</span>
          <span className="tree-label">{node.name}</span>
          <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
            <button title="Novo arquivo" onClick={askNewFile}>+</button>
            <button title="Nova pasta" onClick={askNewFolder}>⊞</button>
            <button title="Renomear" onClick={askRename}>✎</button>
            <button title="Apagar" onClick={() => void askDelete()}>🗑</button>
          </span>
        </div>
        {open ? (node.children ?? []).map((c) => (
          <TreeNode key={c.path} node={c} depth={depth + 1} openModal={openModal} />
        )) : null}
      </div>
    )
  }

  return (
    <div
      className={`tree-row file ${node.path === activePath ? 'active' : ''}`}
      style={{ paddingLeft: depth * 12 + 22 }}
      onClick={() => void openFile(node.path)}
    >
      <span className="tree-label">{node.name}</span>
      <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
        <button title="Renomear" onClick={askRename}>✎</button>
        <button title="Apagar" onClick={() => void askDelete()}>🗑</button>
      </span>
    </div>
  )
}

export default function FileTree(): JSX.Element {
  const tree = useStore((s) => s.tree)
  const createFile = useStore((s) => s.createFile)
  const createFolder = useStore((s) => s.createFolder)

  const [modal, setModal] = useState<ModalState>(null)
  const openModal = (s: NonNullable<ModalState>): void => setModal(s)
  const closeModal = (): void => setModal(null)

  const askNewFile = (): void => openModal({
    title: 'Novo arquivo na raiz',
    placeholder: 'nome.md',
    defaultValue: '',
    onConfirm: (name) => void createFile(name)
  })

  const askNewFolder = (): void => openModal({
    title: 'Nova pasta na raiz',
    placeholder: 'nome-da-pasta',
    defaultValue: '',
    onConfirm: (name) => void createFolder(name)
  })

  return (
    <div className="file-tree">
      {modal ? (
        <InputModal
          title={modal.title}
          placeholder={modal.placeholder}
          defaultValue={modal.defaultValue}
          onConfirm={(v) => { modal.onConfirm(v); closeModal() }}
          onCancel={closeModal}
        />
      ) : null}
      <div className="tree-toolbar">
        <span className="tree-toolbar-title">Arquivos</span>
        <button title="Novo arquivo na raiz" onClick={askNewFile}>+ arquivo</button>
        <button title="Nova pasta na raiz" onClick={askNewFolder}>+ pasta</button>
      </div>
      {tree.length === 0 ? (
        <p className="tree-empty">Vault vazio. Crie um arquivo.</p>
      ) : (
        tree.map((n) => <TreeNode key={n.path} node={n} depth={0} openModal={openModal} />)
      )}
    </div>
  )
}
