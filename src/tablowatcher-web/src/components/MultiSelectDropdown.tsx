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

export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectDropdownProps {
  label: string
  options: MultiSelectOption[]
  selected: Set<string>
  onToggle: (value: string, checked: boolean) => void
  // The trigger's text with nothing selected, e.g. "All ratings".
  placeholder: string
  // The trigger's text for more than one selection; defaults to "N selected".
  summarize?: (count: number) => string
}

// A labelled dropdown of checkboxes - the filter control used for tags, ratings and stars.
export function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
  placeholder,
  summarize = (count) => `${count} selected`,
}: MultiSelectDropdownProps) {
  const triggerText =
    selected.size === 0
      ? placeholder
      : selected.size === 1
        ? (options.find((o) => selected.has(o.value))?.label ?? summarize(1))
        : summarize(selected.size)

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <DropdownMenu>
        <DropdownMenuTrigger className={buttonVariants({ variant: 'outline', className: 'min-w-40 justify-between' })}>
          {triggerText}
          <ChevronDown className="size-4 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-72 overflow-y-auto">
          {options.length === 0 ? (
            <DropdownMenuLabel>Nothing to choose yet</DropdownMenuLabel>
          ) : (
            options.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={selected.has(option.value)}
                onCheckedChange={(checked) => onToggle(option.value, checked)}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
