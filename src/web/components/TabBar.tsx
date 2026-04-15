import { type ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  testId?: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  testId?: string;
  children?: ReactNode;
}

export function TabBar({ tabs, activeTab, onTabChange, testId = 'tab-bar' }: TabBarProps) {
  return (
    <div data-testid={testId} className="flex border-b border-[#30363d] mb-6">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            data-testid={tab.testId ?? `tab-bar-tab-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors duration-150 ${
              isActive
                ? 'text-[#1f6feb] border-[#1f6feb]'
                : 'text-[#8b949e] border-transparent hover:text-[#e6edf3]'
            }`}
          >
            {tab.label}
            {isActive && <span data-testid="tab-bar-active-indicator" className="sr-only">(active)</span>}
          </button>
        );
      })}
    </div>
  );
}
