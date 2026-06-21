import type { FileNode } from '../types'

/**
 * Define imutavelmente os filhos do nó em `targetPath` (árvore lazy SFTP).
 * Desce apenas pelos diretórios cujo caminho é prefixo do alvo.
 */
export function setChildrenAt(
  nodes: FileNode[],
  targetPath: string,
  children: FileNode[]
): FileNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return { ...n, children }
    if (n.isDir && n.children && targetPath.startsWith(n.path + '/')) {
      return { ...n, children: setChildrenAt(n.children, targetPath, children) }
    }
    return n
  })
}
