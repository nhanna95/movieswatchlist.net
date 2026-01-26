import './FilterTag.css';

const FilterTag = ({
  filter,
  filterType,
  onClick,
  onRemove,
  isActive,
  hasActiveValues,
  hasMultipleFilters,
  isEndOfRow,
}) => {
  // Handle OR groups specially
  const displayText =
    filter.type === 'or_group'
      ? filterType.formatDisplay(filter.config)
      : filterType.formatDisplay(filter.config);

  const getFilterIcon = () => {
    const field = filterType.field;
    const type = filterType.type;

    // Special cases for specific fields
    if (
      field === 'runtime' ||
      field === 'year'
    ) {
      // "#" icon for numeric fields
      return <span className="filter-tag-icon">#</span>;
    }

    if (field === 'director' || field === 'actor' || field === 'writer' || field === 'producer') {
      // Hamburger menu icon (three lines)
      return (
        <svg
          className="filter-tag-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 4H14M2 8H14M2 12H14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    }

    if (type === 'multiselect') {
      // Circular icon with triangle (dropdown)
      return (
        <svg
          className="filter-tag-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M6 6L8 8L10 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="currentColor"
          />
        </svg>
      );
    }

    if (type === 'availability' || type === 'streaming_service') {
      // Streaming/play icon for availability and streaming service filters
      return (
        <svg
          className="filter-tag-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 4L12 8L6 12V4Z"
            fill="currentColor"
          />
        </svg>
      );
    }

    if (type === 'text') {
      // "Aa" icon for text/search
      return (
        <span className="filter-tag-icon" style={{ fontSize: '14px', fontWeight: 'bold' }}>
          Aa
        </span>
      );
    }

    if (type === 'boolean') {
      // Checkbox icon
      return (
        <svg
          className="filter-tag-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M5 8L7 10L11 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    if (type === 'or_group') {
      // OR group icon (star/sparkle)
      return (
        <svg
          className="filter-tag-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M8 2L10 6L14 7L10 8L8 12L6 8L2 7L6 6L8 2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    return null;
  };

  const isOrGroup = filter.type === 'or_group';

  return (
    <div
      className={`filter-tag ${isActive ? 'active' : ''} ${hasActiveValues ? 'has-active-values' : ''} ${hasMultipleFilters ? 'has-multiple-filters' : ''} ${isOrGroup ? 'filter-tag-or-group' : ''} ${isEndOfRow ? 'is-end-of-row' : ''}`}
    >
      <button className="filter-tag-button" onClick={onClick} type="button">
        {getFilterIcon()}
        {isOrGroup && <span className="filter-tag-or-bracket">(</span>}
        {displayText}
        {isOrGroup && <span className="filter-tag-or-bracket">)</span>}
      </button>
      <button
        className="filter-tag-remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        type="button"
        aria-label="Remove filter"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9 3L3 9M3 3L9 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
};

export default FilterTag;
