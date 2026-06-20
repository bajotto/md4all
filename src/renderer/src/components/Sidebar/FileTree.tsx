import { useState } from 'react'
import { useStore } from '../../store/useStore'
import type { FileNode } from '../../types'

function parentDir(relPath: string): string {
  const idx = relPath.lastIndexOf('/')
  return idx === -1 ? '' : relPath.slice(0, idx)
}

function join(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

function TreeNode({ node, depth }: { node: FileNode; depth: number }): JSX.Element {
  const activePath = useStore((s) => s.activePath)
  const openFile = useStore((s) => s.openFile)
  const renamePath = useStore((s) => s.renamePath)
  const deletePath = useStore((s) => s.deletePath)
  const createFile = useStore((s) => s.createFile)
  const createFolder = useStore((s) => s.createFolder)

  const [open, setOpen] = useState(depth === 0)

  const handleRename = (): void => {
    const next = window.prompt('Novo nome:', node.name)
    if (!next || next === node.name) return
    void renamePath(node.path, join(parentDir(node.path), next))
  }

  const handleDelete = (): void => {
    if (window.confirm(`Apagar "${node.name}"?`)) void deletePath(node.path)
  }

  const handleNewFile = (): void => {
    const name = window.prompt('Nome do novo arquivo:')
    if (name) void createFile(join(node.path, name))
  }

  const handleNewFolder = (): void => {
    const name = window.prompt('Nome da nova pasta:')
    if (name) void createFolder(join(node.path, name))
  }

  if (node.isDir) {
    return (
      <div className="tree-folder">
        <div
          className="tree-row"
          style={{ paddingLeft: depth * 12 + 8 }}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="tree-caret">{open ? '▾' : '▸'}</span>
          <span className="tree-label">{node.name}</span>
          <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
            <button title="Novo arquivo" onClick={handleNewFile}>
              +
            </button>
            <button title="Nova pasta" onClick={handleNewFolder}>
              ⊞
            </button>
            <button title="Renomear" onClick={handleRename}>
              ✎
            </button>
            <button title="Apagar" onClick={handleDelete}>
              🗑
            </button>
          </span>
        </div>
        {open
          ? (node.children ?? []).map((c) => (
              <TreeNode key={c.path} node={c} depth={depth + 1} />
            ))
          : null}
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
        <button title="Renomear" onClick={handleRename}>
          ✎
        </button>
        <button title="Apagar" onClick={handleDelete}>
          🗑
        </button>
      </span>
    </div>
  )
}

export default function FileTree(): JSX.Element {
  const tree = useStore((s) => s.tree)
  const createFile = useStore((s) => s.createFile)
  const createFolder = useStore((s) => s.createFolder)

  const handleNewFile = (): void => {
    const name = window.prompt('Nome do novo arquivo:')
    if (name) void createFile(name)
  }
  const handleNewFolder = (): void => {
    const name = window.prompt('Nome da nova pasta:')
    if (name) void createFolder(name)
  }

  return (
    <div className="file-tree">
      <div className="tree-toolbar">
        <span className="tree-toolbar-title">Arquivos</span>
        <button title="Novo arquivo na raiz" onClick={handleNewFile}>
          + arquivo
        </button>
        <button title="Nova pasta na raiz" onClick={handleNewFolder}>
          + pasta
        </button>
      </div>
      {tree.length === 0 ? (
        <p className="tree-empty">Vault vazio. Crie um arquivo.</p>
      ) : (
        tree.map((n) => <TreeNode key={n.path} node={n} depth={0} />)
      )}
    </div>
  )
}
