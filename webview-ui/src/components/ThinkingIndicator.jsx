import React, { useState, useEffect } from "react";
import { Sparkles, Brain, Zap, Code, Search, BookOpen } from "lucide-react";
import TinkerIcon from "./TinkerIcon";

const thinkingPhrases = [
  { text: "Analyzing...", icon: Search },
  { text: "Thinking...", icon: Brain },
  { text: "Processing...", icon: Zap },
  { text: "Crafting...", icon: Code },
  { text: "Generating...", icon: Sparkles },
];

function ThinkingIndicator() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % thinkingPhrases.length);
        setIsFlipping(false);
      }, 400);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  const CurrentIcon = thinkingPhrases[currentIndex].icon;

  return (
    <div className="flex items-center gap-2 mb-2">
      {/* Tinker icon */}
      <div className="w-6 h-6 rounded-lg bg-tinker-copper/20 flex items-center justify-center">
        <TinkerIcon size={16} className="text-tinker-copper" />
      </div>

      {/* Tinker name */}
      <span
        className="text-xs font-semibold"
        style={{ color: "var(--vscode-descriptionForeground)" }}
      >
        Tinker
      </span>

      {/* Separator dot */}
      <span className="text-white/30 text-xs">•</span>

      {/* Book/Rolodex animation */}
      <div className="flex items-center gap-1.5">
        <BookOpen size={12} className="text-tinker-copper/40" />

        <div
          className="h-4 overflow-hidden"
          style={{ perspective: "120px", minWidth: "75px" }}
        >
          <div
            className="transition-all duration-400 ease-in-out"
            style={{
              transformStyle: "preserve-3d",
              transform: isFlipping ? "rotateX(-90deg)" : "rotateX(0deg)",
              transformOrigin: "center bottom",
            }}
          >
            <div className="flex items-center gap-1">
              <CurrentIcon size={10} className="text-tinker-copper/60" />
              <span className="text-xs text-white/50">
                {thinkingPhrases[currentIndex].text}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThinkingIndicator;
