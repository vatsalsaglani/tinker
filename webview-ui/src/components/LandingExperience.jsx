// @ts-nocheck
import React from "react";
import TinkerIcon from "./TinkerIcon";
import {
  Zap,
  MessageSquare,
  Bug,
  FileCode,
  TestTube,
  Sparkles,
  Settings,
  ChevronRight,
  Moon,
  Sun,
  Clock,
} from "lucide-react";
import {
  OpenAIIcon,
  ClaudeIcon,
  GeminiIcon,
  AzureIcon,
  BedrockIcon,
} from "../icons";

/**
 * Get time-appropriate greeting and icon
 */
const getTimeGreeting = (hour) => {
  if (hour >= 6 && hour < 12) {
    return { text: "Good morning", emoji: "☀️", period: "morning" };
  } else if (hour >= 12 && hour < 17) {
    return { text: "Good afternoon", emoji: "👋", period: "afternoon" };
  } else if (hour >= 17 && hour < 21) {
    return { text: "Good evening", emoji: "🌆", period: "evening" };
  } else {
    return { text: "Working late?", emoji: "🌙", period: "night" };
  }
};

/**
 * Quick Start prompt suggestions
 */
const QUICK_STARTS = [
  {
    icon: MessageSquare,
    title: "Explain this code",
    description: "Select code and ask for clarification",
    prompt: "Explain this code to me",
    color: "spark",
  },
  {
    icon: Bug,
    title: "Debug an issue",
    description: "Paste an error or describe the problem",
    prompt: "Help me debug this issue: ",
    color: "forge",
  },
  {
    icon: Sparkles,
    title: "Add a feature",
    description: "Describe what you want to build",
    prompt: "Add a feature to ",
    color: "copper",
  },
  {
    icon: TestTube,
    title: "Write tests",
    description: "Generate tests for your code",
    prompt: "Write tests for ",
    color: "steel",
  },
];

/**
 * Provider icons map
 */
const PROVIDER_ICONS = {
  openai: OpenAIIcon,
  anthropic: ClaudeIcon,
  gemini: GeminiIcon,
  azure: AzureIcon,
  bedrock: BedrockIcon,
};

/**
 * Configuration Card - shown when no API keys are configured
 */
const ConfigurationCard = ({ onOpenSettings }) => (
  <div
    className="tinker-card p-6 text-center animate-fade-in"
    style={{
      borderColor: "var(--color-tinker-copper)",
      borderWidth: "1px",
    }}
  >
    <div
      className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
      style={{
        background:
          "linear-gradient(135deg, var(--color-tinker-copper), var(--color-tinker-forge))",
        boxShadow: "0 4px 20px rgba(217, 119, 6, 0.3)",
      }}
    >
      <Zap size={32} className="text-white" />
    </div>

    <h2 className="text-lg font-bold mb-2">Let's get you set up</h2>
    <p
      className="text-sm mb-6"
      style={{ color: "var(--vscode-descriptionForeground)" }}
    >
      Tinker works with your own API keys.
      <br />
      You stay in control of costs and data.
    </p>

    <div className="flex flex-wrap justify-center gap-3 mb-6">
      {["openai", "anthropic", "gemini", "azure", "bedrock"].map((provider) => {
        const Icon = PROVIDER_ICONS[provider];
        return (
          <div
            key={provider}
            className="w-10 h-10 rounded-lg flex items-center justify-center opacity-40"
            style={{ backgroundColor: "var(--vscode-editor-background)" }}
          >
            <Icon size={20} />
          </div>
        );
      })}
    </div>

    <button
      onClick={onOpenSettings}
      className="tinker-button-primary inline-flex items-center gap-2"
    >
      <Settings size={16} />
      Configure API Keys
      <ChevronRight size={16} />
    </button>

    <div
      className="mt-6 pt-4 border-t text-xs"
      style={{
        borderColor: "var(--vscode-panel-border)",
        color: "var(--vscode-descriptionForeground)",
      }}
    >
      <p className="mb-2 font-medium">Why Tinker?</p>
      <div className="flex flex-wrap justify-center gap-4">
        <span>✓ You own your API keys</span>
        <span>✓ Transparent pricing</span>
        <span>✓ Review every change</span>
      </div>
    </div>
  </div>
);

/**
 * Continue Card - shown when there's a recent conversation
 */
const ContinueCard = ({ conversation, pendingBlocks, onContinue }) => (
  <div className="tinker-card p-4 animate-fade-in border-l-4 border-l-tinker-spark">
    <div className="flex items-start justify-between mb-3">
      <div>
        <p
          className="text-xs font-semibold uppercase tracking-wide mb-1"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          📌 Pick up where you left off
        </p>
        <h3 className="font-bold text-sm truncate max-w-[200px]">
          {conversation.title || "Untitled Conversation"}
        </h3>
      </div>
      {pendingBlocks > 0 && (
        <span
          className="px-2 py-0.5 text-[10px] font-bold rounded"
          style={{
            backgroundColor: "rgba(234, 88, 12, 0.2)",
            color: "var(--color-tinker-forge)",
          }}
        >
          {pendingBlocks} pending
        </span>
      )}
    </div>
    <p
      className="text-xs mb-3"
      style={{ color: "var(--vscode-descriptionForeground)" }}
    >
      {conversation.messageCount} messages ·{" "}
      {formatTimeAgo(conversation.updatedAt)}
    </p>
    <button
      onClick={onContinue}
      className="w-full py-2 rounded-lg text-sm font-medium transition-all"
      style={{
        backgroundColor: "var(--color-tinker-spark)",
        color: "white",
      }}
    >
      Continue
    </button>
  </div>
);

/**
 * Quick Start Grid
 */
const QuickStartGrid = ({ onSelect, contextFiles = [] }) => (
  <div className="grid grid-cols-2 gap-3">
    {QUICK_STARTS.map((item, idx) => {
      const colorVar = `var(--color-tinker-${item.color})`;
      return (
        <button
          key={idx}
          onClick={() => onSelect(item.prompt)}
          className="tinker-card p-4 text-left group transition-all hover:scale-[1.02]"
          style={{
            animationDelay: `${idx * 75}ms`,
            animationFillMode: "backwards",
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center mb-3 transition-transform group-hover:scale-110"
            style={{ backgroundColor: `${colorVar}20` }}
          >
            <item.icon size={16} style={{ color: colorVar }} />
          </div>
          <h4 className="font-semibold text-sm mb-1">{item.title}</h4>
          <p
            className="text-xs"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            {item.description}
          </p>
        </button>
      );
    })}
  </div>
);

/**
 * Session Stats Footer
 */
const SessionStats = ({ usageState, onOpenAnalytics }) => {
  if (!usageState?.totalConversations) return null;

  return (
    <div
      className="flex items-center justify-between text-xs py-3 px-4 mt-4 rounded-lg"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.2)",
        color: "var(--vscode-descriptionForeground)",
      }}
    >
      <span>
        {usageState.totalConversations} conversations ·{" "}
        {usageState.totalMessages || 0} messages
      </span>
      <button
        onClick={onOpenAnalytics}
        className="hover:underline"
        style={{ color: "var(--color-tinker-spark)" }}
      >
        View Analytics →
      </button>
    </div>
  );
};

/**
 * Format time ago helper
 */
const formatTimeAgo = (dateStr) => {
  if (!dateStr) return "recently";

  try {
    const date = new Date(dateStr);
    const now = new Date();

    // Check for invalid date
    if (isNaN(date.getTime())) {
      return "recently";
    }

    const diffMs = now.getTime() - date.getTime();

    // Handle future dates or very recent (< 1 min)
    if (diffMs < 0 || diffMs < 60000) {
      return "just now";
    }

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "1d ago";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch (e) {
    return "recently";
  }
};

/**
 * Main Landing Experience Component
 */
const LandingExperience = ({
  landingState,
  onQuickStart,
  onOpenSettings,
  onOpenAnalytics,
  onContinueConversation,
}) => {
  if (!landingState) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 rounded-full border-4 border-tinker-copper/30 border-t-tinker-copper animate-spin" />
      </div>
    );
  }

  const { configState, usageState, sessionState, workState, workspaceContext } =
    landingState;
  const greeting = getTimeGreeting(
    sessionState?.currentHour || new Date().getHours()
  );

  // Priority 1: No API keys configured
  if (!configState?.hasAnyApiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="mb-6 animate-fade-in">
          <TinkerIcon size={64} className="mx-auto" />
        </div>
        <h1 className="text-xl font-bold mb-2 animate-fade-in">
          Welcome to Tinker
        </h1>
        <p
          className="text-sm mb-6 text-center animate-fade-in"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          Your AI coding partner that keeps you in control
        </p>
        <ConfigurationCard onOpenSettings={onOpenSettings} />
      </div>
    );
  }

  // Regular landing experience
  return (
    <div className="flex flex-col h-full p-4 overflow-y-auto">
      {/* Greeting Header */}
      <div className="flex items-center gap-3 mb-6 animate-fade-in">
        <TinkerIcon size={40} />
        <div>
          <h1 className="text-lg font-bold">
            {greeting.text} {greeting.emoji}
          </h1>
          {workspaceContext?.workspaceName && (
            <p
              className="text-xs"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              Working on{" "}
              <span className="font-medium">
                {workspaceContext.workspaceName}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Priority Card: Continue or Pending */}
      {workState?.lastConversation && sessionState?.hoursSinceLastUse < 24 && (
        <div className="mb-6">
          <ContinueCard
            conversation={workState.lastConversation}
            pendingBlocks={workState.pendingBlocks || 0}
            onContinue={() =>
              onContinueConversation?.(workState.lastConversation.id)
            }
          />
        </div>
      )}

      {/* Quick Start Section */}
      <div className="mb-4">
        <p
          className="text-xs font-semibold uppercase tracking-wide mb-3"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          Quick Starts
        </p>
        <QuickStartGrid
          onSelect={onQuickStart}
          contextFiles={workspaceContext?.openFiles || []}
        />
      </div>

      {/* Tips */}
      <div
        className="text-xs p-3 rounded-lg mt-auto mb-2"
        style={{
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
        }}
      >
        <p
          className="font-medium mb-1"
          style={{ color: "var(--color-tinker-spark)" }}
        >
          ⌨️ Pro Tips
        </p>
        <p style={{ color: "var(--vscode-descriptionForeground)" }}>
          Type <code className="px-1 bg-white/10 rounded">#</code> for files,{" "}
          <code className="px-1 bg-white/10 rounded">@</code> for symbols,{" "}
          <span className="opacity-70">⌘L</span> to add selection
        </p>
      </div>

      {/* Session Stats */}
      <SessionStats usageState={usageState} onOpenAnalytics={onOpenAnalytics} />
    </div>
  );
};

export default LandingExperience;
