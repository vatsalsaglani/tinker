import React, { useState, useEffect } from "react";
import { Sparkles, Brain, Zap, Code, Search, Wrench } from "lucide-react";

const thinkingPhrases = [
  { text: "Analyzing request...", icon: Search },
  { text: "Thinking deeply...", icon: Brain },
  { text: "Crafting solution...", icon: Code },
  { text: "Processing context...", icon: Zap },
  { text: "Generating response...", icon: Sparkles },
  { text: "Working on it...", icon: Wrench },
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
      }, 300);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  const CurrentIcon = thinkingPhrases[currentIndex].icon;

  return (
    <div className="flex items-start gap-3 p-4 mb-4">
      {/* Animated Icon */}
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-tinker-copper/30 to-tinker-forge/20 flex items-center justify-center">
          <CurrentIcon size={16} className="text-tinker-copper animate-pulse" />
        </div>
        {/* Orbiting dot */}
        <div
          className="absolute inset-0 animate-spin"
          style={{ animationDuration: "3s" }}
        >
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-tinker-copper/60" />
        </div>
      </div>

      {/* Rolodex Container */}
      <div className="flex-1 overflow-hidden">
        {/* Rolodex Flip Animation */}
        <div
          className="h-6 perspective-1000 overflow-hidden"
          style={{ perspective: "200px" }}
        >
          <div
            className={`transition-transform duration-300 ease-in-out ${
              isFlipping ? "rolodex-flip" : ""
            }`}
            style={{
              transformStyle: "preserve-3d",
              transform: isFlipping ? "rotateX(-90deg)" : "rotateX(0deg)",
              transformOrigin: "center bottom",
            }}
          >
            <span className="text-sm font-medium text-white/80 block">
              {thinkingPhrases[currentIndex].text}
            </span>
          </div>
        </div>

        {/* Animated bars */}
        <div className="flex gap-1 mt-2">
          <div
            className="h-1 bg-tinker-copper/40 rounded-full animate-loading-bar-1"
            style={{ width: "40%" }}
          />
          <div
            className="h-1 bg-tinker-copper/30 rounded-full animate-loading-bar-2"
            style={{ width: "25%" }}
          />
          <div
            className="h-1 bg-tinker-copper/20 rounded-full animate-loading-bar-3"
            style={{ width: "20%" }}
          />
        </div>
      </div>
    </div>
  );
}

export default ThinkingIndicator;
