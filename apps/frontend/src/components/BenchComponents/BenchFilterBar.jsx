import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import SkillSearchInput from '../common/SkillSearchInput';
import {
  setActiveSpecialty,
  setActiveUrgency,
  setActiveNoticePeriod,
  setActiveExperience,
  setActiveLocation,
  setSortBy,
  setSearchQuery,
} from '../../store/slices/benchSlice';

/**
 * BenchDropdown: Custom styled SaaS dropdown matching the reference design.
 * Features:
 * - Solid rounded trigger button with chevron icon
 * - Chevron rotates 180deg when open
 * - Floating white popup menu with deep soft shadow and rounded corners
 * - Solid blue background with white text and white checkmark for selected option
 * - Soft light-blue hover state for options
 * - Keyboard navigation (ArrowDown, ArrowUp, Enter, Space, Escape, Tab)
 * - Hidden native <select> preserved for WCAG accessibility and automated test compatibility
 */
const BenchDropdown = ({
  id,
  containerClassName = 'BenchFilter-selectField',
  label,
  icon,
  value,
  options = [],
  onChange,
  isOpen,
  onToggle,
  onClose,
  align = 'left',
  nativeId,
  nativeAriaLabel,
}) => {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      const selectedIdx = options.findIndex((opt) => opt === value);
      setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, options, value]);

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'Enter' ||
        e.key === ' '
      ) {
        e.preventDefault();
        onToggle();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIndex >= 0 && options[highlightedIndex]) {
        onChange(options[highlightedIndex]);
        onClose();
        if (triggerRef.current) triggerRef.current.focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      if (triggerRef.current) triggerRef.current.focus();
    } else if (e.key === 'Tab') {
      onClose();
    }
  };

  return (
    <div className={containerClassName}>
      <label
        htmlFor={nativeId}
        className="BenchFilter-selectLabel"
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
      >
        <span className="material-symbols-outlined">{icon}</span> {label}
      </label>

      {/* Hidden native select for accessibility & automated tests */}
      <select
        id={nativeId}
        aria-label={nativeAriaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="BenchFilter-nativeSelectHidden"
        tabIndex={-1}
      >
        {options.map((opt, i) => (
          <option key={i} value={opt}>
            {opt}
          </option>
        ))}
      </select>

      {/* Custom styled dropdown container */}
      <div
        className={`BenchFilter-customSelectContainer ${
          isOpen ? 'is-open' : ''
        }`}
      >
        <button
          ref={triggerRef}
          type="button"
          id={id}
          className={`BenchFilter-customTrigger ${isOpen ? 'is-open' : ''}`}
          onClick={onToggle}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`Select ${label.replace(':', '')}`}
        >
          <span className="BenchFilter-triggerValue" title={value}>
            {value}
          </span>
          <svg
            className={`BenchFilter-dropdownChevron ${isOpen ? 'is-open' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {isOpen && (
          <ul
            ref={menuRef}
            className={`BenchFilter-customMenu ${
              align === 'right' ? 'is-align-right' : ''
            }`}
            role="listbox"
            aria-label={label}
          >
            {options.map((opt, idx) => {
              const isSelected = opt === value;
              const isHighlighted = idx === highlightedIndex;
              return (
                <li
                  key={idx}
                  role="option"
                  aria-selected={isSelected}
                  className={`BenchFilter-customOption ${
                    isSelected ? 'is-selected' : ''
                  } ${isHighlighted ? 'is-highlighted' : ''}`}
                  onClick={() => {
                    onChange(opt);
                    onClose();
                    if (triggerRef.current) triggerRef.current.focus();
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  <span className="BenchFilter-optionText">{opt}</span>
                  {isSelected && (
                    <svg
                      className="BenchFilter-dropdownCheck"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

const BenchFilterBar = ({ totalCount }) => {
  const dispatch = useDispatch();
  const {
    specialtyFilters,
    filterOptions,
    activeSpecialty,
    activeUrgency,
    activeNoticePeriod,
    activeExperience,
    activeLocation,
    sortBy,
    searchQuery,
  } = useSelector((state) => state.bench);

  // Active open dropdown state: 'urgency' | 'notice' | 'experience' | 'location' | 'sort' | null
  const [openDropdown, setOpenDropdown] = useState(null);
  const wrapperRef = useRef(null);

  // Handle clicking outside to close any open dropdown
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Handle Escape key to close any open dropdown
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const defaultSpecialties = [
    { label: 'All Engineering', count: 142 },
    { label: 'GenAI & LLMs', count: 38 },
    { label: 'Cloud & DevOps', count: 31 },
    { label: 'SAP & Enterprise', count: 24 },
    { label: 'Systems & Distributed', count: 27 },
    { label: 'Data & Analytics', count: 22 },
  ];

  const specialties =
    specialtyFilters && specialtyFilters.length > 0
      ? specialtyFilters
      : defaultSpecialties;

  const defaultUrgency = [
    'All Urgency',
    'Immediate (24-48h)',
    'Within 1 Week',
    'Within 2 Weeks',
  ];
  const defaultNoticePeriods = [
    'All Notice Periods',
    'Immediate (48h)',
    'Within 7 Days',
    'Within 15 Days',
    '30 Days',
    'Immediate',
    '60 Days',
    '90 Days',
  ];
  const defaultExperience = [
    'All Experience',
    'Staff/Principal (10+y)',
    'Senior (6-9y)',
    'Lead (8+y)',
  ];
  const defaultLocations = [
    'All Locations',
    'US East / Hybrid',
    'US Remote',
    'EU Remote',
    'Global / Flexible',
  ];
  const defaultSorts = [
    'AI Assessment',
    'Highest Score',
    'Fastest Availability',
    'Lowest Rate',
  ];

  const urgencyList = filterOptions?.urgency || defaultUrgency;
  const noticePeriodList = filterOptions?.noticePeriod || defaultNoticePeriods;
  const experienceList = filterOptions?.experience || defaultExperience;
  const locationList = filterOptions?.locations || defaultLocations;
  const sortList = filterOptions?.sortOptions || defaultSorts;

  return (
    <div
      className={`BenchFilter-wrapper ${
        openDropdown ? 'has-open-dropdown' : ''
      }`}
      ref={wrapperRef}
    >
      {/* Search Input & Primary Console Header */}
      <div className="BenchFilter-searchBar">
        <div className="BenchFilter-searchInputWrapper">
          <span className="BenchFilter-searchIcon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: '1.25rem', height: '1.25rem', display: 'block' }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <SkillSearchInput
            id="bench-search-input"
            className="BenchFilter-searchInput"
            placeholder="Search by role, stack (e.g. LangChain, Kubernetes, Go), or TW-BENCH code..."
            value={searchQuery}
            onChange={(e) => dispatch(setSearchQuery(e.target.value))}
            onSelect={(skill) => dispatch(setSearchQuery(skill))}
          />
          {searchQuery && (
            <button
              type="button"
              className="BenchFilter-clearBtn"
              onClick={() => dispatch(setSearchQuery(''))}
              title="Clear search"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>
        <div className="BenchFilter-activeCounter">
          <span className="BenchFilter-counterBadge">{totalCount}</span>
          <span className="BenchFilter-counterText">Talents Available Now</span>
        </div>
      </div>

      {/* Specialty Filter Pills */}
      <div className="BenchFilter-specialtyPills">
        {specialties.map((item, idx) => {
          const isActive = activeSpecialty === item.label;
          return (
            <button
              key={idx}
              type="button"
              className={`BenchFilter-pill ${isActive ? 'is-active' : ''}`}
              onClick={() => dispatch(setActiveSpecialty(item.label))}
            >
              <span>{item.label}</span>
              {item.count !== undefined && (
                <span className="BenchFilter-pillBadge">{item.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Quick Notice Period Toggles (Issue #166) */}
      <div className="BenchFilter-quickTogglesRow">
        <span className="BenchFilter-quickTogglesLabel">
          <span className="material-symbols-outlined">bolt</span>
          <span>Fast Deployment:</span>
        </span>
        <div className="BenchFilter-quickTogglesGroup">
          {[
            { label: 'Immediate (48h)', icon: 'bolt' },
            { label: 'Within 7 Days', icon: 'speed' },
            { label: 'Within 15 Days', icon: 'calendar_today' },
          ].map((item) => {
            const isActive = activeNoticePeriod === item.label;
            return (
              <button
                key={item.label}
                type="button"
                className={`BenchFilter-quickToggleBtn ${isActive ? 'is-active' : ''}`}
                onClick={() =>
                  dispatch(
                    setActiveNoticePeriod(
                      isActive ? 'All Notice Periods' : item.label
                    )
                  )
                }
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Secondary Dropdown Filter Bar */}
      <div className="BenchFilter-dropdownRow">
        {/* Row 1: Urgency, Notice Period, Experience */}
        <div className="BenchFilter-dropdownGroup">
          <BenchDropdown
            id="bench-dropdown-urgency"
            containerClassName="BenchFilter-selectField"
            label="Urgency:"
            icon="schedule"
            value={activeUrgency}
            options={urgencyList}
            onChange={(val) => dispatch(setActiveUrgency(val))}
            isOpen={openDropdown === 'urgency'}
            onToggle={() =>
              setOpenDropdown(openDropdown === 'urgency' ? null : 'urgency')
            }
            onClose={() => setOpenDropdown(null)}
            nativeId="bench-filter-urgency"
            nativeAriaLabel="Filter candidates by deployment urgency"
          />

          <BenchDropdown
            id="bench-dropdown-notice"
            containerClassName="BenchFilter-selectField"
            label="Notice Period:"
            icon="hourglass_top"
            value={activeNoticePeriod}
            options={noticePeriodList}
            onChange={(val) => dispatch(setActiveNoticePeriod(val))}
            isOpen={openDropdown === 'notice'}
            onToggle={() =>
              setOpenDropdown(openDropdown === 'notice' ? null : 'notice')
            }
            onClose={() => setOpenDropdown(null)}
            nativeId="bench-filter-notice-period"
            nativeAriaLabel="Filter candidates by notice period"
          />

          <BenchDropdown
            id="bench-dropdown-experience"
            containerClassName="BenchFilter-selectField"
            label="Experience:"
            icon="workspace_premium"
            value={activeExperience}
            options={experienceList}
            onChange={(val) => dispatch(setActiveExperience(val))}
            isOpen={openDropdown === 'experience'}
            onToggle={() =>
              setOpenDropdown(
                openDropdown === 'experience' ? null : 'experience'
              )
            }
            onClose={() => setOpenDropdown(null)}
            nativeId="bench-filter-experience"
            nativeAriaLabel="Filter candidates by experience tier"
          />
        </div>

        {/* Row 2: Location (left) and Sort by (right) */}
        <div className="BenchFilter-dropdownRowBottom">
          <BenchDropdown
            id="bench-dropdown-location"
            containerClassName="BenchFilter-selectField"
            label="Location:"
            icon="public"
            value={activeLocation}
            options={locationList}
            onChange={(val) => dispatch(setActiveLocation(val))}
            isOpen={openDropdown === 'location'}
            onToggle={() =>
              setOpenDropdown(openDropdown === 'location' ? null : 'location')
            }
            onClose={() => setOpenDropdown(null)}
            nativeId="bench-filter-location"
            nativeAriaLabel="Filter candidates by location"
          />

          <BenchDropdown
            id="bench-dropdown-sort"
            containerClassName="BenchFilter-sortField"
            label="Sort by:"
            icon="sort"
            value={sortBy}
            options={sortList}
            onChange={(val) => dispatch(setSortBy(val))}
            isOpen={openDropdown === 'sort'}
            onToggle={() =>
              setOpenDropdown(openDropdown === 'sort' ? null : 'sort')
            }
            onClose={() => setOpenDropdown(null)}
            align="right"
            nativeId="bench-filter-sort-by"
            nativeAriaLabel="Sort candidates by criteria"
          />
        </div>
      </div>
    </div>
  );
};

export default BenchFilterBar;
