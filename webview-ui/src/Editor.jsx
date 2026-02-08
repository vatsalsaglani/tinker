import React from "react";
import { createRoot } from "react-dom/client";
import { Code2 } from "lucide-react";
import { createUILogger, installGlobalErrorHandlers } from "./utils/ui-logger";

const uiLogger = createUILogger("Editor");
installGlobalErrorHandlers(uiLogger);

function Editor() {
  return (
    <div className="flex flex-col items-center justify-center h-screen p-6 bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]">
      <Code2 size={64} className="text-tinker-copper mb-4" />
      <h1 className="text-3xl font-bold mb-2">Tinker Editor</h1>
      <p className="text-lg opacity-70 text-center max-w-md">
        Additional editor view coming soon. For now, use the sidebar to interact
        with Tinker.
      </p>
    </div>
  );
}

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<Editor />);
