// @ts-nocheck
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart2,
  Coins,
  Zap,
  Globe,
  Monitor,
  Cpu,
  RefreshCcw,
  TrendingUp,
  Clock,
  ArrowUpRight,
  MessageSquare,
  Wrench,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { createUILogger, installGlobalErrorHandlers } from "./utils/ui-logger";

// Acquire VS Code API once at module level
const vscode =
  typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;
if (typeof window !== "undefined" && vscode) {
  window.__tinkerVsCodeApi = vscode;
}
const uiLogger = createUILogger("UsageDashboard");
installGlobalErrorHandlers(uiLogger);

// Branding colors from input.css
const COLORS = {
  copper: "#d97706",
  copperLight: "#f59e0b",
  spark: "#3b82f6",
  sparkLight: "#60a5fa",
  forge: "#ea580c",
  forgeLight: "#fb923c",
  steel: "#64748b",
};

const CHART_COLORS = [
  COLORS.copper,
  COLORS.spark,
  COLORS.forge,
  COLORS.copperLight,
  COLORS.sparkLight,
  COLORS.forgeLight,
  COLORS.steel,
];

const UsageDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleMessage = (event) => {
      const message = event.data;
      if (message.type === "usageDataLoaded") {
        setStats(message.stats);
        setLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);

    // Request data on mount
    vscode?.postMessage({ type: "loadUsageData" });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const refreshData = () => {
    setLoading(true);
    vscode?.postMessage({ type: "loadUsageData" });
  };

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-[var(--vscode-editor-background)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-tinker-copper/30 border-t-tinker-copper animate-spin"></div>
          <p
            className="animate-pulse"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            Loading usage analytics...
          </p>
        </div>
      </div>
    );
  }

  const global = stats?.global || {};
  const workspace = stats?.workspace || {};

  const formatTokens = (tokens) => {
    if (!tokens) return "0";
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(2)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return tokens.toString();
  };

  const formatCost = (cost) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(cost || 0);
  };

  // Prepare chart data
  const modelChartData = global.modelBreakdown
    ? Object.entries(global.modelBreakdown)
        .sort(([, a], [, b]) => b.tokens - a.tokens)
        .slice(0, 7)
        .map(([model, data]) => ({
          name: model.length > 20 ? model.substring(0, 18) + "..." : model,
          fullName: model,
          tokens: data.tokens,
          cost: data.cost,
          count: data.count,
        }))
    : [];

  const tokenBreakdownData = [
    {
      name: "Input",
      value: global.totalInputTokens || 0,
      color: COLORS.spark,
    },
    {
      name: "Output",
      value: global.totalOutputTokens || 0,
      color: COLORS.copper,
    },
    {
      name: "Reasoning",
      value: global.totalReasoningTokens || 0,
      fill: COLORS.forge,
    },
  ].filter((item) => item.value > 0);

  // Custom tooltip for bar chart
  const CustomBarTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div
          className="px-3 py-2 rounded-lg shadow-lg border text-xs"
          style={{
            backgroundColor: "var(--vscode-editor-background)",
            borderColor: "var(--vscode-panel-border)",
            color: "var(--vscode-foreground)",
          }}
        >
          <p className="font-semibold mb-1">{data.fullName || label}</p>
          <p>
            Tokens:{" "}
            <span className="font-mono">{formatTokens(data.tokens)}</span>
          </p>
          <p>
            Cost:{" "}
            <span className="font-mono text-tinker-spark">
              {formatCost(data.cost)}
            </span>
          </p>
          <p>
            Messages: <span className="font-mono">{data.count}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="min-h-screen p-6 overflow-y-auto"
      style={{
        backgroundColor: "var(--vscode-editor-background)",
        color: "var(--vscode-foreground)",
      }}
    >
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${COLORS.copper}, ${COLORS.forge})`,
              boxShadow: `0 4px 14px ${COLORS.copper}33`,
            }}
          >
            <BarChart2 size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Usage Analytics
            </h1>
            <p
              style={{ color: "var(--vscode-descriptionForeground)" }}
              className="text-sm"
            >
              Track your token consumption and estimated costs
            </p>
          </div>
        </div>
        <button
          onClick={refreshData}
          className="px-4 py-2 rounded-lg transition-all flex items-center gap-2 font-medium text-sm"
          style={{
            backgroundColor: `${COLORS.copper}20`,
            color: COLORS.copper,
            border: `1px solid ${COLORS.copper}40`,
          }}
        >
          <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Global Tokens */}
        <div
          className="p-5 rounded-xl border relative overflow-hidden group"
          style={{
            backgroundColor: "var(--vscode-editor-background)",
            borderColor: "var(--vscode-panel-border)",
          }}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Zap size={48} style={{ color: COLORS.copper }} />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${COLORS.copper}15` }}
            >
              <Globe size={20} style={{ color: COLORS.copper }} />
            </div>
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              Total Tokens
            </span>
          </div>
          <div className="text-3xl font-bold">
            {formatTokens(global.totalTokens)}
          </div>
          <div
            className="text-xs mt-1 flex items-center gap-1"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            <TrendingUp size={12} className="text-green-500" />
            Across all workspaces
          </div>
        </div>

        {/* Total Cost */}
        <div
          className="p-5 rounded-xl border relative overflow-hidden group"
          style={{
            backgroundColor: "var(--vscode-editor-background)",
            borderColor: "var(--vscode-panel-border)",
          }}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Coins size={48} style={{ color: COLORS.spark }} />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${COLORS.spark}15` }}
            >
              <Coins size={20} style={{ color: COLORS.spark }} />
            </div>
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              Total Spend
            </span>
          </div>
          <div className="text-3xl font-bold">
            {formatCost(global.totalCost)}
          </div>
          <div
            className="text-xs mt-1"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            Estimated cumulative cost
          </div>
        </div>

        {/* Messages */}
        <div
          className="p-5 rounded-xl border relative overflow-hidden group"
          style={{
            backgroundColor: "var(--vscode-editor-background)",
            borderColor: "var(--vscode-panel-border)",
          }}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <MessageSquare size={48} style={{ color: COLORS.forge }} />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${COLORS.forge}15` }}
            >
              <MessageSquare size={20} style={{ color: COLORS.forge }} />
            </div>
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              Messages
            </span>
          </div>
          <div className="text-3xl font-bold">{global.messageCount || 0}</div>
          <div
            className="text-xs mt-1"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            Total conversations
          </div>
        </div>

        {/* Tool Calls */}
        <div
          className="p-5 rounded-xl border relative overflow-hidden group"
          style={{
            backgroundColor: "var(--vscode-editor-background)",
            borderColor: "var(--vscode-panel-border)",
          }}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wrench size={48} style={{ color: COLORS.steel }} />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${COLORS.steel}15` }}
            >
              <Wrench size={20} style={{ color: COLORS.steel }} />
            </div>
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              Tool Calls
            </span>
          </div>
          <div className="text-3xl font-bold">{global.toolCallCount || 0}</div>
          <div
            className="text-xs mt-1"
            style={{ color: "var(--vscode-descriptionForeground)" }}
          >
            Automated actions
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Model Usage Bar Chart */}
        <div
          className="p-5 rounded-xl border"
          style={{
            backgroundColor: "var(--vscode-editor-background)",
            borderColor: "var(--vscode-panel-border)",
          }}
        >
          <div
            className="flex items-center gap-2 mb-4 pb-3 border-b"
            style={{ borderColor: "var(--vscode-panel-border)" }}
          >
            <Cpu size={18} style={{ color: COLORS.copper }} />
            <h2 className="font-bold text-lg">Token Usage by Model</h2>
          </div>

          {modelChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={modelChartData}
                layout="vertical"
                margin={{ left: 10, right: 30 }}
              >
                <XAxis
                  type="number"
                  tickFormatter={formatTokens}
                  tick={{ fill: "var(--vscode-foreground)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--vscode-panel-border)" }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: "var(--vscode-foreground)", fontSize: 11 }}
                  width={100}
                  axisLine={{ stroke: "var(--vscode-panel-border)" }}
                />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar
                  dataKey="tokens"
                  fill={COLORS.copper}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center">
              <div className="text-center">
                <BarChart2
                  size={48}
                  style={{ color: "var(--vscode-descriptionForeground)" }}
                  className="mx-auto opacity-20 mb-3"
                />
                <p
                  style={{ color: "var(--vscode-descriptionForeground)" }}
                  className="text-sm"
                >
                  No model usage data yet
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Token Breakdown Pie Chart */}
        <div
          className="p-5 rounded-xl border"
          style={{
            backgroundColor: "var(--vscode-editor-background)",
            borderColor: "var(--vscode-panel-border)",
          }}
        >
          <div
            className="flex items-center gap-2 mb-4 pb-3 border-b"
            style={{ borderColor: "var(--vscode-panel-border)" }}
          >
            <TrendingUp size={18} style={{ color: COLORS.spark }} />
            <h2 className="font-bold text-lg">Token Breakdown</h2>
          </div>

          {tokenBreakdownData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={tokenBreakdownData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {tokenBreakdownData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatTokens(value)}
                  contentStyle={{
                    backgroundColor: "var(--vscode-editor-background)",
                    border: "1px solid var(--vscode-panel-border)",
                    borderRadius: "8px",
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: "var(--vscode-foreground)" }}>
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center">
              <div className="text-center">
                <BarChart2
                  size={48}
                  style={{ color: "var(--vscode-descriptionForeground)" }}
                  className="mx-auto opacity-20 mb-3"
                />
                <p
                  style={{ color: "var(--vscode-descriptionForeground)" }}
                  className="text-sm"
                >
                  No token data yet
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Workspace Section */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Current Workspace Stats */}
        <div
          className="p-5 rounded-xl border"
          style={{
            backgroundColor: "var(--vscode-editor-background)",
            borderColor: `${COLORS.spark}40`,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${COLORS.spark}15` }}
              >
                <Monitor size={20} style={{ color: COLORS.spark }} />
              </div>
              <span
                className="text-sm font-semibold uppercase tracking-wide"
                style={{ color: "var(--vscode-descriptionForeground)" }}
              >
                Current Workspace
              </span>
            </div>
            <div
              className="px-2 py-0.5 rounded text-[10px] font-bold"
              style={{
                backgroundColor: `${COLORS.spark}20`,
                color: COLORS.spark,
                border: `1px solid ${COLORS.spark}30`,
              }}
            >
              ACTIVE
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold">
                {formatTokens(workspace?.totalTokens || 0)}
              </div>
              <div
                className="text-xs"
                style={{ color: "var(--vscode-descriptionForeground)" }}
              >
                Tokens
              </div>
            </div>
            <div>
              <div
                className="text-2xl font-bold"
                style={{ color: COLORS.spark }}
              >
                {formatCost(workspace?.totalCost || 0)}
              </div>
              <div
                className="text-xs"
                style={{ color: "var(--vscode-descriptionForeground)" }}
              >
                Cost
              </div>
            </div>
          </div>
        </div>

        {/* Cross-Workspace Activity */}
        {global.workspaceBreakdown &&
          Object.keys(global.workspaceBreakdown).length > 0 && (
            <div
              className="lg:col-span-2 p-5 rounded-xl border"
              style={{
                backgroundColor: "var(--vscode-editor-background)",
                borderColor: "var(--vscode-panel-border)",
              }}
            >
              <div
                className="flex items-center gap-2 mb-4 pb-3 border-b"
                style={{ borderColor: "var(--vscode-panel-border)" }}
              >
                <Globe size={18} style={{ color: COLORS.spark }} />
                <h2 className="font-bold text-lg">Cross-Workspace Activity</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(global.workspaceBreakdown)
                  .sort(([, a], [, b]) => b.tokens - a.tokens)
                  .slice(0, 6)
                  .map(([id, data]) => (
                    <div
                      key={id}
                      className="p-3 rounded-lg border"
                      style={{
                        backgroundColor: "rgba(0,0,0,0.1)",
                        borderColor: "var(--vscode-panel-border)",
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium text-sm truncate pr-2 max-w-[140px]">
                          {data.name || "Untitled"}
                        </div>
                        <ArrowUpRight
                          size={12}
                          style={{
                            color: "var(--vscode-descriptionForeground)",
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="font-mono">
                          {formatTokens(data.tokens)}
                        </span>
                        <span
                          className="font-mono"
                          style={{ color: COLORS.spark }}
                        >
                          {formatCost(data.cost)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
      </div>

      {/* Footer */}
      <div
        className="max-w-6xl mx-auto pt-6 border-t flex flex-col sm:flex-row justify-between items-center gap-4 text-xs"
        style={{
          borderColor: "var(--vscode-panel-border)",
          color: "var(--vscode-descriptionForeground)",
        }}
      >
        <div className="flex items-center gap-2">
          <Clock size={12} />
          <span>
            Last updated:{" "}
            {global.lastUpdated || global.updatedAt
              ? new Date(
                  global.lastUpdated || global.updatedAt
                ).toLocaleString()
              : "Never"}
          </span>
        </div>
        <div>
          Estimates based on current model pricing. Syncing to{" "}
          <code
            className="px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            ~/.tinker/usage.json
          </code>
        </div>
      </div>
    </div>
  );
};

// Mount React app
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<UsageDashboard />);
}

export default UsageDashboard;
