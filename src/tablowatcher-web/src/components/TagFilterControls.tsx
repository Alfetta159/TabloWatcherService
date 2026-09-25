import { ChevronDown } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import type { TagFilters } from '@/hooks/useTagFilters'

// The "Include Tags"/"Exclude Tags" dropdown pair shared by TV Shows, Movies, Sports and
// Search - see useTagFilters for what each one does.
export function TagFilterControls({ allTags, availableTags, includeTags, excludedTags, toggleInclude, toggleExclude }: TagFilters) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Include Tags</Label>
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonVariants({ variant: 'outline', className: 'min-w-40 justify-between' })}>
            {includeTags.size > 0 ? `${includeTags.size} selected` : 'All tags'}
            <ChevronDown className="size-4 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 overflow-y-auto">
            {availableTags.length === 0 ? (
              <DropdownMenuLabel>No tags yet</DropdownMenuLabel>
            ) : (
              availableTags.map((tag) => (
                <DropdownMenuCheckboxItem key={tag} checked={includeTags.has(tag)} onCheckedChange={() => toggleInclude(tag)}>
                  {tag}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-1.5">
        <Label>Exclude Tags</Label>
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonVariants({ variant: 'outline', className: 'min-w-40 justify-between' })}>
            {excludedTags.size > 0 ? `${excludedTags.size} excluded` : 'None excluded'}
            <ChevronDown className="size-4 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 overflow-y-auto">
            {allTags.length === 0 ? (
              <DropdownMenuLabel>No tags yet</DropdownMenuLabel>
            ) : (
              allTags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={excludedTags.has(tag)}
                  onCheckedChange={(checked) => toggleExclude(tag, checked)}
                >
                  {tag}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}
