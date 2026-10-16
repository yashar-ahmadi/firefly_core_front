import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

type Component = (props: Record<string, unknown>) => ReactNode | Promise<ReactNode>

function isAsyncComponent(type: unknown): type is Component {
  return typeof type === 'function' && type.constructor.name === 'AsyncFunction'
}

/**
 * Testing Library renders on the client, where an async Server Component cannot run. This
 * awaits every async component in `node`'s children (not in other props), the way the server
 * would, and returns a tree of plain elements to `render`.
 */
export async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node))
    return Promise.all(node.map((child: ReactNode) => resolveServerTree(child)))
  if (!isValidElement(node)) return node
  const element = node as ReactElement<{ children?: ReactNode }>
  if (isAsyncComponent(element.type)) {
    return resolveServerTree(await element.type(element.props as Record<string, unknown>))
  }
  const { children } = element.props
  if (children === undefined || typeof children === 'function') return element
  const resolved = await resolveServerTree(children)
  return cloneElement(element, undefined, resolved)
}
