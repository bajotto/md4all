import type { FileNode } from '../types'

/**
 * Immutably sets the children of the node at `targetPath` (lazy SFTP tree).
 * Descends only through directories whose path is a prefix of the target.
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

/** Immutably marks `hasMd` on the node at `targetPath` (result of SFTP probing). */
export function setHasMdAt(nodes: FileNode[], targetPath: string, hasMd: boolean): FileNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return { ...n, hasMd }
    if (n.isDir && n.children && targetPath.startsWith(n.path + '/')) {
      return { ...n, children: setHasMdAt(n.children, targetPath, hasMd) }
    }
    return n
  })
}
