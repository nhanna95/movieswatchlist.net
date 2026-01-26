import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './AutocompleteMultiselect.css';
import { calculateFixedDropdownPosition } from '../utils/dropdownPosition';

const AutocompleteMultiselect = ({
  options = [],
  selected = [],
  onChange,
  placeholder = 'Type to search...',
  getDisplayValue,
  getOptionValue,
  isLoading = false,
  onEnterKey,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [focusedChipIndex, setFocusedChipIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, right: null, width: 0, alignRight: false });
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const chipRefs = useRef([]);

  // Ensure getDisplayValue is always a function
  const getDisplay = getDisplayValue || ((option) => option);

  // Use getOptionValue if provided, otherwise use the option itself
  const getValue = getOptionValue || ((option) => option);

  // Helper function to check if an option is selected
  // For string options, we can use direct comparison
  // For object options, we need to extract and compare values
  const isOptionSelected = (option) => {
    if (!selected || selected.length === 0) return false;
    const optionValue = getValue(option);
    return selected.some((selectedOption) => {
      const selectedValue = getValue(selectedOption);
      // Use strict equality for comparison
      return selectedValue === optionValue;
    });
  };

  // Filter options based on input and exclude already selected
  const filteredOptions = options.filter((option) => {
    // If input is empty, show all unselected options
    if (!inputValue || inputValue.trim() === '') {
      return !isOptionSelected(option);
    }
    // Otherwise, filter by search term
    const displayValue = String(getDisplay(option) || '').toLowerCase();
    const searchTerm = inputValue.toLowerCase();
    return displayValue.includes(searchTerm) && !isOptionSelected(option);
  });

  // Handle input change
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsOpen(true);
    setHighlightedIndex(-1);
    // Clear chip focus when typing
    if (focusedChipIndex >= 0) {
      setFocusedChipIndex(-1);
    }
  };

  // Show dropdown when input is focused and there are options
  const handleFocus = () => {
    setIsOpen(true);
    setHighlightedIndex(-1);
    // Clear chip focus when input is focused
    setFocusedChipIndex(-1);
  };

  // Handle option selection
  const handleSelect = (option) => {
    if (!isOptionSelected(option)) {
      onChange([...selected, option]);
    }
    setInputValue('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  // Handle removing a selected item
  const handleRemove = (option) => {
    const optionValue = getValue(option);
    const removedIndex = selected.findIndex((item) => getValue(item) === optionValue);
    const newSelected = selected.filter((item) => getValue(item) !== optionValue);
    onChange(newSelected);
    
    // Handle focus after removal
    if (newSelected.length === 0) {
      // If no chips left, focus input
      setFocusedChipIndex(-1);
      inputRef.current?.focus();
    } else if (focusedChipIndex >= 0) {
      // If a chip was focused, adjust focus index
      if (removedIndex < focusedChipIndex) {
        // Removed chip was before focused chip, adjust index
        setFocusedChipIndex(focusedChipIndex - 1);
      } else if (removedIndex === focusedChipIndex) {
        // Removed the focused chip, focus previous or next
        if (focusedChipIndex < newSelected.length) {
          // Focus the chip that took its place
          setFocusedChipIndex(focusedChipIndex);
        } else if (focusedChipIndex > 0) {
          // Focus the previous chip
          setFocusedChipIndex(focusedChipIndex - 1);
        } else {
          // No chips left to focus, focus input
          setFocusedChipIndex(-1);
          inputRef.current?.focus();
        }
      }
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    // If input has text, arrow keys navigate dropdown (existing behavior)
    if (inputValue.trim() !== '') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // If there's only one option, select it automatically
        if (filteredOptions.length === 1) {
          handleSelect(filteredOptions[0]);
        } else if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          // Otherwise, select the highlighted option
          handleSelect(filteredOptions[highlightedIndex]);
        } else if (onEnterKey && (filteredOptions.length === 0 || highlightedIndex < 0)) {
          // If no option is selected and callback is provided, call it
          onEnterKey();
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setHighlightedIndex(-1);
      } else if (e.key === 'Backspace' && inputValue === '' && selected.length > 0) {
        handleRemove(selected[selected.length - 1]);
      }
      return;
    }

    // When input is empty, handle chip navigation
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (focusedChipIndex >= 0) {
        // Move to previous chip
        if (focusedChipIndex > 0) {
          const newIndex = focusedChipIndex - 1;
          setFocusedChipIndex(newIndex);
          chipRefs.current[newIndex]?.focus();
        } else {
          // Already at first chip, focus input
          setFocusedChipIndex(-1);
          inputRef.current?.focus();
        }
      } else if (selected.length > 0) {
        // Input is focused, move to last chip
        const lastIndex = selected.length - 1;
        setFocusedChipIndex(lastIndex);
        chipRefs.current[lastIndex]?.focus();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (focusedChipIndex >= 0) {
        // Move to next chip
        if (focusedChipIndex < selected.length - 1) {
          const newIndex = focusedChipIndex + 1;
          setFocusedChipIndex(newIndex);
          chipRefs.current[newIndex]?.focus();
        } else {
          // Already at last chip, focus input
          setFocusedChipIndex(-1);
          inputRef.current?.focus();
        }
      } else if (selected.length > 0) {
        // Input is focused, move to first chip
        setFocusedChipIndex(0);
        chipRefs.current[0]?.focus();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // If there's only one option, select it automatically
      if (filteredOptions.length === 1) {
        handleSelect(filteredOptions[0]);
      } else if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        // Otherwise, select the highlighted option
        handleSelect(filteredOptions[highlightedIndex]);
      } else if (onEnterKey && (filteredOptions.length === 0 || highlightedIndex < 0)) {
        // If no option is selected and callback is provided, call it
        onEnterKey();
      }
    } else if (e.key === 'Escape') {
      if (focusedChipIndex >= 0) {
        // Clear chip focus and return to input
        setFocusedChipIndex(-1);
        inputRef.current?.focus();
      } else {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    } else if (e.key === 'Backspace' && inputValue === '' && selected.length > 0) {
      // Remove last chip when backspace is pressed on empty input
      handleRemove(selected[selected.length - 1]);
    }
  };

  // Handle keyboard events on chips
  const handleChipKeyDown = (e, chipIndex) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      handleRemove(selected[chipIndex]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (chipIndex > 0) {
        const newIndex = chipIndex - 1;
        setFocusedChipIndex(newIndex);
        chipRefs.current[newIndex]?.focus();
      } else {
        // Move to input
        setFocusedChipIndex(-1);
        inputRef.current?.focus();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (chipIndex < selected.length - 1) {
        const newIndex = chipIndex + 1;
        setFocusedChipIndex(newIndex);
        chipRefs.current[newIndex]?.focus();
      } else {
        // Move to input
        setFocusedChipIndex(-1);
        inputRef.current?.focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setFocusedChipIndex(-1);
      inputRef.current?.focus();
    }
  };

  // Handle click outside - account for portal-rendered dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      const target = event.target;

      // Check if clicking on an autocomplete option - if so, don't close (let handleSelect handle it)
      const isOptionElement = target.closest('.autocomplete-option');
      if (isOptionElement) {
        return;
      }

      const isInsideContainer = containerRef.current && containerRef.current.contains(target);
      const isInsideDropdown = dropdownRef.current && dropdownRef.current.contains(target);

      // If clicking inside container or dropdown, don't close
      if (isInsideContainer || isInsideDropdown) {
        return;
      }

      // Click is outside, close the dropdown and clear chip focus
      setIsOpen(false);
      setHighlightedIndex(-1);
      setFocusedChipIndex(-1);
    };

    // Use mousedown event - option's onMouseDown will fire first and stop propagation
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Open dropdown when options are loaded and input is focused
  useEffect(() => {
    if (options.length > 0 && inputRef.current === document.activeElement && !isOpen) {
      setIsOpen(true);
    }
  }, [options.length, isOpen]);

  // Calculate dropdown position from container
  const updateDropdownPosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const position = calculateFixedDropdownPosition(rect, rect.width);
      setDropdownPosition({
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        right: position.right,
        width: rect.width,
        alignRight: position.alignRight,
      });
    }
  };

  // Update dropdown position when it opens or container changes
  useEffect(() => {
    if (isOpen && containerRef.current) {
      updateDropdownPosition();
    }
  }, [isOpen]);

  // Handle window scroll and resize to update dropdown position
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => {
      updateDropdownPosition();
    };

    const handleResize = () => {
      updateDropdownPosition();
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex];
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [highlightedIndex]);

  // Update chip refs array when selected changes
  useEffect(() => {
    chipRefs.current = chipRefs.current.slice(0, selected.length);
  }, [selected.length]);

  return (
    <div className="autocomplete-multiselect" ref={containerRef}>
      <div
        className="autocomplete-input-container"
        onClick={() => {
          inputRef.current?.focus();
          setIsOpen(true);
        }}
      >
        {/* Selected items as chips - rendered inline with input */}
        {selected.map((option, index) => {
          const value = getValue(option);
          const display = getDisplay(option);
          // Use index as fallback for key to handle edge cases
          const key = value != null ? String(value) : `selected-${index}`;
          const isFocused = focusedChipIndex === index;
          return (
            <span
              key={key}
              ref={(el) => {
                chipRefs.current[index] = el;
              }}
              className={`chip ${isFocused ? 'focused' : ''}`}
              tabIndex={0}
              onFocus={() => setFocusedChipIndex(index)}
              onBlur={() => {
                // Only clear focus if not moving to another chip or input
                setTimeout(() => {
                  if (document.activeElement !== chipRefs.current[index] && 
                      document.activeElement !== inputRef.current &&
                      !chipRefs.current.some(ref => ref === document.activeElement)) {
                    setFocusedChipIndex(-1);
                  }
                }, 0);
              }}
              onKeyDown={(e) => handleChipKeyDown(e, index)}
              onClick={(e) => {
                e.stopPropagation();
                setFocusedChipIndex(index);
                chipRefs.current[index]?.focus();
              }}
            >
              {display}
              <button
                type="button"
                className="chip-remove"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemove(option);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                aria-label={`Remove ${display}`}
              >
                ×
              </button>
            </span>
          );
        })}
        {/* Input field */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={selected.length === 0 ? placeholder : ''}
          className="autocomplete-input"
        />
        {/* Loading indicator */}
        {isLoading && <span className="autocomplete-loading">Loading...</span>}
      </div>
      {/* Dropdown rendered via Portal to escape container clipping */}
      {isOpen &&
        (filteredOptions.length > 0 || isLoading) &&
        createPortal(
          <div
            className={`autocomplete-dropdown ${dropdownPosition.alignRight ? 'align-right' : ''}`}
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownPosition.top,
              bottom: dropdownPosition.bottom,
              left: dropdownPosition.left,
              right: dropdownPosition.right,
              width: `${dropdownPosition.width}px`,
              zIndex: 1001,
            }}
          >
            {isLoading ? (
              <div className="autocomplete-no-results">Loading options...</div>
            ) : (
              filteredOptions.map((option, index) => {
                const value = getValue(option);
                // Use index as fallback for key to handle edge cases
                const key = value != null ? String(value) : `option-${index}`;
                return (
                  <div
                    key={key}
                    className={`autocomplete-option ${
                      index === highlightedIndex ? 'highlighted' : ''
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelect(option);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    {getDisplay(option)}
                  </div>
                );
              })
            )}
          </div>,
          document.body
        )}
      {/* Show message when open but no results and not loading */}
      {isOpen &&
        filteredOptions.length === 0 &&
        !isLoading &&
        createPortal(
          <div
            className={`autocomplete-dropdown ${dropdownPosition.alignRight ? 'align-right' : ''}`}
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownPosition.top,
              bottom: dropdownPosition.bottom,
              left: dropdownPosition.left,
              right: dropdownPosition.right,
              width: `${dropdownPosition.width}px`,
              zIndex: 1001,
            }}
          >
            <div className="autocomplete-no-results">
              {inputValue
                ? 'No results found'
                : options.length === 0
                  ? 'No options available'
                  : 'All options selected'}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default AutocompleteMultiselect;
