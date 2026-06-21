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

/** Marca `hasMd` no nó em `targetPath` imutavelmente (resultado da sondagem SFTP). */
export function setHasMdAt(nodes: FileNode[], targetPath: string, hasMd: boolean): FileNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return { ...n, hasMd }
    if (n.isDir && n.children && targetPath.startsWith(n.path + '/')) {
      return { ...n, children: setHasMdAt(n.children, targetPath, hasMd) }
    }
    return n
  })
}
