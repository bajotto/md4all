import { useState } from 'react'
import { useStore } from '../../store/useStore'
import InputModal from '../InputModal'
import type { FileNode, Vault } from '../../types'

type ModalState = { title: string; placeholder: string; defaultValue: string; onConfirm: (v: string) => void } | null

function parentDir(relPath: string): string {
  const idx = relPath.lastIndexOf('/')
  return idx === -1 ? '' : relPath.slice(0, idx)
}
function join(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

const MD_RE = /\.(md|markdown|mdown|mkd)$/i

/**
 * Uma pasta deve ficar azul se houver markdown em qualquer descendente. Combina
 * a sondagem assíncrona (`hasMd`, usada p/ subárvores ainda não carregadas no
 * vault SFTP) com uma checagem síncrona dos filhos já carregados — assim a
 * cadeia pasta→arquivo acende na hora, sem depender do término da sondagem.
 */
function subtreeHasMd(node: FileNode): boolean {
  if (node.hasMd) return true
  if (!node.children) return false
  return node.children.some((c) => (c.isDir ? subtreeHasMd(c) : MD_RE.test(c.name)))
}

/** Ícone discreto de documento (estilo Lettera) antes do nome do arquivo. */
function FileIcon(): JSX.Element {
  return (
    <svg className="tree-file-icon" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 1.75h4.5L13 6.25v7A1.25 1.25 0 0 1 11.75 14.5h-7.5A1.25 1.25 0 0 1 3 13.25V3A1.25 1.25 0 0 1 4 1.75z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8.5 1.9v3.6h3.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5.4 8.4h5.2M5.4 10.6h5.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

function TreeNode({ vaultId, node, depth, openModal }: {
  vaultId: string
  node: FileNode
  depth: number
  openModal: (s: NonNullable<ModalState>) => void
}): JSX.Element {
  const active = useStore((s) => s.active)
  const openFile = useStore((s) => s.openFile)
  const renamePath = useStore((s) => s.renamePath)
  const deletePath = useStore((s) => s.deletePath)
  const createFile = useStore((s) => s.createFile)
  const createFolder = useStore((s) => s.createFolder)
  const loadDir = useStore((s) => s.loadDir)
  const loadingChildren = useStore((s) => s.loadingDir[`${vaultId}::${node.path}`] ?? false)

  const [open, setOpen] = useState(false)

  // expande/recolhe; carrega filhos sob demanda (árvore SFTP preguiçosa)
  const toggleOpen = (): void => {
    const next = !open
    setOpen(next)
    if (next && node.isDir && node.children === undefined) void loadDir(vaultId, node.path)
  }

  const askRename = (): void => openModal({
    title: `Renomear "${node.name}"`,
    placeholder: 'Novo nome',
    defaultValue: node.name,
    onConfirm: (next) => void renamePath(vaultId, node.path, join(parentDir(node.path), next))
  })
  const askDelete = async (): Promise<void> => {
    const ok = await window.api.confirm(`Apagar "${node.name}"? Esta ação não pode ser desfeita.`)
    if (ok) void deletePath(vaultId, node.path)
  }
  const askNewFile = (): void => openModal({
    title: 'Novo arquivo',
    placeholder: 'nome.md',
    defaultValue: '',
    onConfirm: (name) => void createFile(vaultId, join(node.path, name))
  })
  const askNewFolder = (): void => openModal({
    title: 'Nova pasta',
    placeholder: 'nome-da-pasta',
    defaultValue: '',
    onConfirm: (name) => void createFolder(vaultId, join(node.path, name))
  })

  if (node.isDir) {
    const hasMd = subtreeHasMd(node)
    return (
      <div className="tree-folder">
        <div className="tree-row" style={{ paddingLeft: depth * 12 + 8 }} onClick={toggleOpen}>
          <span className="tree-caret">{open ? '▾' : '▸'}</span>
          <span className={`tree-label ${hasMd ? 'has-md' : ''}`} title={hasMd ? 'Contém markdown' : undefined}>
            {node.name}
          </span>
          <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
            <button title="Novo arquivo" onClick={askNewFile}>+</button>
            <button title="Nova pasta" onClick={askNewFolder}>⊞</button>
            <button title="Renomear" onClick={askRename}>✎</button>
            <button title="Apagar" onClick={() => void askDelete()}>🗑</button>
          </span>
        </div>
        {open ? (
          node.children === undefined ? (
            loadingChildren ? (
              <p className="tree-empty" style={{ paddingLeft: depth * 12 + 22 }}>Carregando…</p>
            ) : null
          ) : (
            node.children.map((c) => (
              <TreeNode key={c.path} vaultId={vaultId} node={c} depth={depth + 1} openModal={openModal} />
            ))
          )
        ) : null}
      </div>
    )
  }

  const isActive = active?.vaultId === vaultId && active?.path === node.path
  const isMd = MD_RE.test(node.name)
  return (
    <div
      className={`tree-row file ${isActive ? 'active' : ''} ${isMd ? 'md' : ''}`}
      style={{ paddingLeft: depth * 12 + 8 }}
      onClick={() => void openFile(vaultId, node.path)}
    >
      <FileIcon />
      <span className={`tree-label ${isMd ? 'is-md' : ''}`}>{node.name}</span>
      <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
        <button title="Renomear" onClick={askRename}>✎</button>
        <button title="Apagar" onClick={() => void askDelete()}>🗑</button>
      </span>
    </div>
  )
}

/** Uma raiz de vault na sidebar multi-raiz: cabeçalho + árvore. */
export default function VaultRoot({ vault }: { vault: Vault }): JSX.Element {
  const expanded = useStore((s) => s.expanded[vault.id] ?? false)
  const loading = useStore((s) => s.loadingTree[vault.id] ?? false)
  const tree = useStore((s) => s.trees[vault.id])
  const toggle = useStore((s) => s.toggleVaultExpanded)
  const createFile = useStore((s) => s.createFile)
  const createFolder = useStore((s) => s.createFolder)
  const removeVault = useStore((s) => s.removeVault)

  const [modal, setModal] = useState<ModalState>(null)
  const openModal = (s: NonNullable<ModalState>): void => setModal(s)

  const askNewFile = (): void => openModal({
    title: `Novo arquivo em ${vault.name}`,
    placeholder: 'nome.md',
    defaultValue: '',
    onConfirm: (name) => void createFile(vault.id, name)
  })
  const askNewFolder = (): void => openModal({
    title: `Nova pasta em ${vault.name}`,
    placeholder: 'nome-da-pasta',
    defaultValue: '',
    onConfirm: (name) => void createFolder(vault.id, name)
  })
  const askRemove = async (): Promise<void> => {
    const ok = await window.api.confirm(
      `Remover o vault "${vault.name}" da lista? (os arquivos não serão apagados)`
    )
    if (ok) void removeVault(vault.id)
  }

  return (
    <div className="vault-root">
      {modal ? (
        <InputModal
          title={modal.title}
          placeholder={modal.placeholder}
          defaultValue={modal.defaultValue}
          onConfirm={(v) => { modal.onConfirm(v); setModal(null) }}
          onCancel={() => setModal(null)}
        />
      ) : null}
      <div className="vault-root-header" onClick={() => void toggle(vault.id)} title={vault.path}>
        <span className="tree-caret">{expanded ? '▾' : '▸'}</span>
        <span className="vault-root-icon">{vault.kind === 'sftp' ? '🌐' : '📁'}</span>
        <span className="vault-root-name">{vault.name}</span>
        <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
          <button title="Novo arquivo" onClick={askNewFile}>+</button>
          <button title="Nova pasta" onClick={askNewFolder}>⊞</button>
          <button title="Remover vault" onClick={() => void askRemove()}>✕</button>
        </span>
      </div>
      {expanded ? (
        <div className="vault-root-body">
          {loading ? (
            <p className="tree-empty">Carregando…</p>
          ) : !tree || tree.length === 0 ? (
            <p className="tree-empty">Vazio.</p>
          ) : (
            tree.map((n) => (
              <TreeNode key={n.path} vaultId={vault.id} node={n} depth={0} openModal={openModal} />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
