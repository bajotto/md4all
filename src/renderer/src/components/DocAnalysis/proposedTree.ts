import type { ProposedFile, ProposedStatus } from '../../types'

export interface ProposedTreeNode {
  name: string
  path: string
  isDir: boolean
  status?: ProposedStatus // só para arquivos
  children: ProposedTreeNode[]
}

/** Constrói uma árvore aninhada a partir da lista plana de arquivos propostos. */
export function buildProposedTree(files: ProposedFile[]): ProposedTreeNode[] {
  const root: ProposedTreeNode = { name: '', path: '', isDir: true, children: [] }

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean)
    let cur = root
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1
      const partPath = parts.slice(0, i + 1).join('/')
      let next = cur.children.find((c) => c.name === parts[i] && c.isDir !== isLast)
      if (!next) {
        next = {
          name: parts[i],
          path: partPath,
          isDir: !isLast,
          status: isLast ? file.status : undefined,
          children: []
        }
        cur.children.push(next)
      }
      cur = next
    }
  }

  sortTree(root.children)
  return root.children
}

function sortTree(nodes: ProposedTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const n of nodes) if (n.isDir) sortTree(n.children)
}

export function statusBadge(status?: ProposedStatus): { label: string; cls: string } | null {
  switch (status) {
    case 'created':
      return { label: 'novo', cls: 'created' }
    case 'updated':
      return { label: 'editado', cls: 'updated' }
    case 'removed':
      return { label: 'removido', cls: 'removed' }
    case 'unchanged':
      return { label: '·', cls: 'unchanged' }
    default:
      return null
  }
}
