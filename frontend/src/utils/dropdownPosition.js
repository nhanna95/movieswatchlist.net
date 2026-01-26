/**
 * Calculates the optimal position for a dropdown to prevent it from going off-screen.
 * Returns positioning information for both absolute and fixed positioning.
 *
 * @param {DOMRect} triggerRect - The bounding rect of the trigger element
 * @param {number} dropdownWidth - The width of the dropdown (default: 320)
 * @param {number} dropdownHeight - The height of the dropdown (optional, for vertical positioning)
 * @param {number} spacing - Spacing between trigger and dropdown (default: 8)
 * @returns {Object} Position object with top, left, right, and alignment info
 */
export const calculateDropdownPosition = (
  triggerRect,
  dropdownWidth = 320,
  dropdownHeight = null,
  spacing = 8
) => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // Calculate if dropdown would overflow on the right
  const wouldOverflowRight = triggerRect.left + dropdownWidth > viewportWidth;
  
  // Calculate if dropdown would overflow on the left (if we align to right)
  const wouldOverflowLeft = triggerRect.right - dropdownWidth < 0;

  // Determine horizontal alignment
  // If it would overflow on the right, align to the right edge of the trigger
  // But only if it wouldn't overflow on the left
  const alignRight = wouldOverflowRight && !wouldOverflowLeft;

  // Calculate positions
  let left, right;
  
  if (alignRight) {
    // Align dropdown's right edge to trigger's right edge
    right = viewportWidth - triggerRect.right;
    left = null;
  } else {
    // Align dropdown's left edge to trigger's left edge (default)
    left = triggerRect.left;
    right = null;
  }

  // Vertical positioning
  // For fixed positioning, use viewport coordinates (triggerRect is already in viewport coordinates)
  const top = triggerRect.bottom + spacing;
  
  // Check if dropdown would overflow bottom (optional, for future use)
  const wouldOverflowBottom = dropdownHeight && (top + dropdownHeight > viewportHeight);
  const bottom = wouldOverflowBottom ? viewportHeight - triggerRect.top + spacing : null;

  return {
    top: bottom ? null : top,
    bottom,
    left,
    right,
    alignRight,
    // For absolute positioning (relative to parent)
    absoluteLeft: alignRight ? null : 0,
    absoluteRight: alignRight ? 0 : null,
  };
};

/**
 * Calculates position for fixed positioning (used in portals)
 */
export const calculateFixedDropdownPosition = (
  triggerRect,
  dropdownWidth = 320,
  dropdownHeight = null,
  spacing = 8
) => {
  const position = calculateDropdownPosition(triggerRect, dropdownWidth, dropdownHeight, spacing);
  
  return {
    position: 'fixed',
    top: position.top !== null ? `${position.top}px` : null,
    bottom: position.bottom !== null ? `${position.bottom}px` : null,
    left: position.left !== null ? `${position.left}px` : null,
    right: position.right !== null ? `${position.right}px` : null,
    alignRight: position.alignRight,
  };
};
