"use client";

import {
  Children,
  isValidElement,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useState,
} from "react";

interface ModeTabsProps {
  ariaLabel: string;
  children: ReactNode;
  defaultValue?: string;
}

interface ModeTabsPanelProps {
  children: ReactNode;
  label: string;
  value: string;
}

function ModeTabsPanel({ children }: ModeTabsPanelProps) {
  return <>{children}</>;
}

function isModeTabsPanelElement(
  child: ReactNode
): child is ReactElement<ModeTabsPanelProps> {
  return (
    isValidElement<ModeTabsPanelProps>(child) &&
    typeof child.props.label === "string" &&
    typeof child.props.value === "string"
  );
}

function ModeTabsRoot({ ariaLabel, children, defaultValue }: ModeTabsProps) {
  const tabGroupId = useId();
  const panels = Children.toArray(children).filter(isModeTabsPanelElement);
  const tabValues = panels.map((panel) => panel.props.value);
  const firstValue = tabValues[0] ?? "";
  const [activeTab, setActiveTab] = useState(defaultValue ?? firstValue);
  const resolvedActiveTab = tabValues.includes(activeTab)
    ? activeTab
    : firstValue;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (tabValues.length === 0) {
      return;
    }

    const currentIndex = Math.max(tabValues.indexOf(resolvedActiveTab), 0);
    let nextTabValue: string | undefined;

    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        nextTabValue = tabValues[(currentIndex + 1) % tabValues.length];
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextTabValue =
          tabValues[(currentIndex - 1 + tabValues.length) % tabValues.length];
        break;
      case "End":
        nextTabValue = tabValues.at(-1);
        break;
      case "Home":
        nextTabValue = tabValues[0];
        break;
      default:
        return;
    }

    event.preventDefault();
    if (!nextTabValue) {
      return;
    }

    setActiveTab(nextTabValue);
    document.getElementById(`${tabGroupId}-${nextTabValue}-tab`)?.focus();
  };

  return (
    <div className="space-y-4">
      <div
        aria-label={ariaLabel}
        className="flex items-center justify-center gap-2"
        onKeyDown={handleKeyDown}
        role="tablist"
      >
        {panels.map((panel) => {
          const selected = panel.props.value === resolvedActiveTab;
          const panelId = `${tabGroupId}-${panel.props.value}-panel`;
          const tabId = `${tabGroupId}-${panel.props.value}-tab`;

          return (
            <button
              aria-controls={panelId}
              aria-selected={selected}
              className={`rounded-full border px-3 py-1 font-mono text-xs transition ${
                selected
                  ? "border-foreground/22 bg-foreground text-background"
                  : "border-foreground/10 text-foreground/68 hover:border-foreground/22"
              }`}
              id={tabId}
              key={panel.props.value}
              onClick={() => setActiveTab(panel.props.value)}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {panel.props.label}
            </button>
          );
        })}
      </div>

      {panels.map((panel) => {
        const panelId = `${tabGroupId}-${panel.props.value}-panel`;
        const tabId = `${tabGroupId}-${panel.props.value}-tab`;

        return (
          <div
            aria-labelledby={tabId}
            hidden={panel.props.value !== resolvedActiveTab}
            id={panelId}
            key={panel.props.value}
            role="tabpanel"
          >
            {panel.props.children}
          </div>
        );
      })}
    </div>
  );
}

export const ModeTabs = Object.assign(ModeTabsRoot, {
  Panel: ModeTabsPanel,
});
