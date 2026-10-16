import { notFound } from 'next/navigation'

/** The guard of every development-only page under `/dev/`: a 404 in production builds. */
export function assertDevOnly(): void {
  if (process.env.NODE_ENV === 'production') notFound()
}
