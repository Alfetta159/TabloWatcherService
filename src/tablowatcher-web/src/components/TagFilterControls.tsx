import { MultiSelectDropdown } from '@/components/MultiSelectDropdown'
import type { TagFilters } from '@/hooks/useTagFilters'

// The "Include Tags"/"Exclude Tags" dropdown pair shared by TV Shows, Movies, Sports and
// Search - see useTagFilters for what each one does.
export function TagFilterControls({ allTags, availableTags, includeTags, excludedTags, toggleInclude, toggleExclude }: TagFilters) {
  return (
    <>
      <MultiSelectDropdown
        label="Include Tags"
        options={availableTags.map((tag) => ({ value: tag, label: tag }))}
        selected={includeTags}
        onToggle={(tag) => toggleInclude(tag)}
        placeholder="All tags"
      />
      <MultiSelectDropdown
        label="Exclude Tags"
        options={allTags.map((tag) => ({ value: tag, label: tag }))}
        selected={excludedTags}
        onToggle={toggleExclude}
        placeholder="None excluded"
        summarize={(count) => `${count} excluded`}
      />
    </>
  )
}
