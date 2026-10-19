import { FileSearch } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

/** A blog listing without posts (a category with none yet): «مطلبی پیدا نشد». */
export function NoPosts() {
  return <EmptyState icon={<FileSearch />} title="مطلبی پیدا نشد" />
}
