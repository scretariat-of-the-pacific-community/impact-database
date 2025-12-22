import { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

/**
 * TabButton Component
 * 
 * A reusable, accessible tab button component that follows WAI-ARIA authoring practices.
 * 
 * Features:
 * - Full ARIA attributes for screen reader support
 * - Keyboard navigation compatible (Arrow keys, Home, End)
 * - Animated active indicator with gradient
 * - Focus visible styles for accessibility
 * - Loading/disabled states
 * - Data-testid support for E2E testing
 * 
 * @example
 * ```tsx
 * <TabButton
 *   id="settings"
 *   label="Settings"
 *   icon={Settings}
 *   isActive={activeTab === 'settings'}
 *   onClick={() => setActiveTab('settings')}
 *   onKeyDown={(e) => handleArrowNavigation(e)}
 * />
 * ```
 */
interface TabButtonProps {
  id: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  isDisabled?: boolean;
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  'data-testid'?: string;
}

export default function TabButton({
  id,
  label,
  icon: Icon,
  isActive,
  isDisabled = false,
  onClick,
  onKeyDown,
  'data-testid': dataTestId,
}: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={onKeyDown}
      id={`tab-${id}`}
      role="tab"
      aria-selected={isActive}
      aria-controls={`panel-${id}`}
      disabled={isDisabled}
      data-testid={dataTestId || `profile-tab-${id}`}
      className={clsx(
        'relative flex flex-1 items-center justify-center gap-2 px-4 py-3',
        'text-sm font-semibold transition-all duration-200 min-h-[44px]',
        'outline-none focus-visible:ring-2 focus-visible:ring-pacific-400',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-deep-900',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isActive 
          ? 'bg-white/15 text-white' 
          : 'text-white/70 hover:text-white hover:bg-white/5'
      )}
      aria-label={`${label} section${isActive ? ', currently active' : ''}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
      {isActive && (
        <span 
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-pacific-400 to-palm-400 animate-in slide-in-from-bottom-2 duration-300"
          aria-hidden="true"
          data-testid="active-tab-indicator"
        />
      )}
    </button>
  );
}
