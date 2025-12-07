import { useState, useCallback } from "react";
import { useVSCodeMessage } from "./useVSCodeMessage";

/**
 * Hook to manage autocomplete state (# for files, @ for symbols)
 */
export function useAutocomplete() {
  const [contextChips, setContextChips] = useState([]);
  const [autocompleteItems, setAutocompleteItems] = useState([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteType, setAutocompleteType] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [triggerIndex, setTriggerIndex] = useState(-1);

  const vscode = useVSCodeMessage((message) => {
    if (message.type === "searchResults") {
      setAutocompleteItems(message.results || []);
      setShowAutocomplete(message.results && message.results.length > 0);
      setAutocompleteType(message.searchType);
      setSelectedIndex(-1);
    } else if (message.type === "addContextChip") {
      addContextChip(message.chip);
    }
  });

  const handleInputChange = useCallback(
    (value, cursorPosition = value.length) => {
      const textBeforeCursor = value.substring(0, cursorPosition);
      const hashIndex = textBeforeCursor.lastIndexOf("#");
      const atIndex = textBeforeCursor.lastIndexOf("@");

      let newTriggerIndex = -1;
      let query = "";
      let type = "";

      // Check which trigger is closer to cursor (and exists)
      if (hashIndex > atIndex && hashIndex !== -1) {
        const potentialQuery = textBeforeCursor.substring(hashIndex + 1);
        // Only trigger if no spaces in query
        if (!/\s/.test(potentialQuery)) {
          newTriggerIndex = hashIndex;
          query = potentialQuery;
          type = "searchFiles";
        }
      } else if (atIndex > hashIndex && atIndex !== -1) {
        const potentialQuery = textBeforeCursor.substring(atIndex + 1);
        if (!/\s/.test(potentialQuery)) {
          newTriggerIndex = atIndex;
          query = potentialQuery;
          type = "searchSymbols";
        }
      }

      setTriggerIndex(newTriggerIndex);

      if (newTriggerIndex !== -1) {
        vscode.postMessage({ type, query });
      } else {
        setShowAutocomplete(false);
        setAutocompleteItems([]);
      }
    },
    [vscode]
  );

  const addContextChip = useCallback((chip) => {
    setContextChips((prev) => {
      // Avoid duplicates
      const exists = prev.some(
        (c) => c.value === chip.value && c.type === chip.type
      );
      if (exists) return prev;
      return [...prev, chip];
    });
  }, []);

  const removeContextChip = useCallback((index) => {
    setContextChips((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const selectItem = useCallback(
    (item) => {
      addContextChip({
        type: autocompleteType,
        value: item.value,
        display: item.label,
      });
      setShowAutocomplete(false);
      setAutocompleteItems([]);
    },
    [autocompleteType, addContextChip]
  );

  const navigateAutocomplete = useCallback(
    (direction) => {
      if (!showAutocomplete || autocompleteItems.length === 0) return;

      setSelectedIndex((prev) => {
        if (direction === "down") {
          return Math.min(prev + 1, autocompleteItems.length - 1);
        } else {
          return Math.max(prev - 1, 0);
        }
      });
    },
    [showAutocomplete, autocompleteItems]
  );

  const selectCurrentItem = useCallback(() => {
    if (selectedIndex >= 0 && autocompleteItems[selectedIndex]) {
      selectItem(autocompleteItems[selectedIndex]);
    }
  }, [selectedIndex, autocompleteItems, selectItem]);

  const clearContextChips = useCallback(() => {
    setContextChips([]);
  }, []);

  return {
    contextChips,
    addContextChip,
    removeContextChip,
    clearContextChips,
    autocompleteItems,
    showAutocomplete,
    autocompleteType,
    selectedIndex,
    handleInputChange,
    selectItem,
    navigateAutocomplete,
    selectCurrentItem,
    triggerIndex,
  };
}

export default useAutocomplete;
