import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon } from '../../admin/AdminIcons';
import SkillSearchInput from '../common/SkillSearchInput';

const LOCATION_OPTIONS = [
  { value: 'All', label: 'All Locations (Global & India)' },
  { value: 'United States', label: 'United States' },
  { value: 'Canada', label: 'Canada' },
  { value: 'India', label: 'India' },
  { value: 'Europe', label: 'Europe & Remote' },
];

const EXPERIENCE_OPTIONS = [
  { value: 'All', label: 'All Experience Tiers' },
  { value: 'Junior', label: '1 - 3 Years (Junior)' },
  { value: 'Mid', label: '3 - 5 Years (Mid-Level)' },
  { value: 'Senior', label: '5 - 8 Years (Senior)' },
  { value: 'Lead', label: '8+ Years (Lead / Principal)' },
];

const JobSearch = ({
  searchQuery,
  setSearchQuery,
  locationFilter = 'All',
  setLocationFilter,
  experienceFilter = 'All',
  setExperienceFilter,
  workMode,
  setWorkMode,
  jobMode = 'All Types',
  setJobMode,
  noticePeriod = 'All Notice',
  setNoticePeriod,
  sortBy = 'Newest First',
  setSortBy,
  totalResults,
  onSearchSubmit,
}) => {
  const workModes = [
    'All Modes',
    'Work From Home',
    'Hybrid',
    'Work From Office',
  ];
  const jobModes = ['All Types', 'Permanent', 'Contract', 'Contract to Hire'];
  const noticePeriods = [
    'All Notice',
    'Immediate',
    'On Notice Period',
    '< 30 Days',
    '> 30 Days',
  ];
  const sortOptions = ['Newest First', 'Highest Salary', 'Title A-Z'];

  const [locationOpen, setLocationOpen] = useState(false);
  const [experienceOpen, setExperienceOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const [locationHighlight, setLocationHighlight] = useState(-1);
  const [experienceHighlight, setExperienceHighlight] = useState(-1);
  const [noticeHighlight, setNoticeHighlight] = useState(-1);
  const [sortHighlight, setSortHighlight] = useState(-1);

  const locationRef = useRef(null);
  const experienceRef = useRef(null);
  const noticeRef = useRef(null);
  const sortRef = useRef(null);

  const locationTriggerRef = useRef(null);
  const experienceTriggerRef = useRef(null);
  const noticeTriggerRef = useRef(null);
  const sortTriggerRef = useRef(null);

  // Close custom dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (locationRef.current && !locationRef.current.contains(e.target)) {
        setLocationOpen(false);
        setLocationHighlight(-1);
      }
      if (experienceRef.current && !experienceRef.current.contains(e.target)) {
        setExperienceOpen(false);
        setExperienceHighlight(-1);
      }
      if (noticeRef.current && !noticeRef.current.contains(e.target)) {
        setNoticeOpen(false);
        setNoticeHighlight(-1);
      }
      if (sortRef.current && !sortRef.current.contains(e.target)) {
        setSortOpen(false);
        setSortHighlight(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (onSearchSubmit) onSearchSubmit();
  };

  const handleSelectLocation = (val) => {
    if (setLocationFilter) setLocationFilter(val);
    setLocationOpen(false);
    setLocationHighlight(-1);
    if (locationTriggerRef.current) {
      locationTriggerRef.current.focus();
    }
  };

  const handleSelectExperience = (val) => {
    if (setExperienceFilter) setExperienceFilter(val);
    setExperienceOpen(false);
    setExperienceHighlight(-1);
    if (experienceTriggerRef.current) {
      experienceTriggerRef.current.focus();
    }
  };

  const handleSelectNotice = (val) => {
    if (setNoticePeriod) setNoticePeriod(val);
    setNoticeOpen(false);
    setNoticeHighlight(-1);
    if (noticeTriggerRef.current) {
      noticeTriggerRef.current.focus();
    }
  };

  const handleSelectSort = (val) => {
    if (setSortBy) setSortBy(val);
    setSortOpen(false);
    setSortHighlight(-1);
    if (sortTriggerRef.current) {
      sortTriggerRef.current.focus();
    }
  };

  const handleLocationKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!locationOpen) {
        setLocationOpen(true);
        setExperienceOpen(false);
        setNoticeOpen(false);
        setSortOpen(false);
        const currIdx = LOCATION_OPTIONS.findIndex(
          (opt) => opt.value === locationFilter
        );
        setLocationHighlight(currIdx >= 0 ? currIdx : 0);
        return;
      }
      setLocationHighlight((prev) =>
        prev < LOCATION_OPTIONS.length - 1 ? prev + 1 : 0
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!locationOpen) {
        setLocationOpen(true);
        setExperienceOpen(false);
        setNoticeOpen(false);
        setSortOpen(false);
        const currIdx = LOCATION_OPTIONS.findIndex(
          (opt) => opt.value === locationFilter
        );
        setLocationHighlight(
          currIdx >= 0 ? currIdx : LOCATION_OPTIONS.length - 1
        );
        return;
      }
      setLocationHighlight((prev) =>
        prev > 0 ? prev - 1 : LOCATION_OPTIONS.length - 1
      );
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (
        locationOpen &&
        locationHighlight >= 0 &&
        LOCATION_OPTIONS[locationHighlight]
      ) {
        handleSelectLocation(LOCATION_OPTIONS[locationHighlight].value);
      } else {
        setLocationOpen((prev) => !prev);
        setExperienceOpen(false);
        setNoticeOpen(false);
        setSortOpen(false);
        const currIdx = LOCATION_OPTIONS.findIndex(
          (opt) => opt.value === locationFilter
        );
        setLocationHighlight(currIdx >= 0 ? currIdx : 0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setLocationOpen(false);
      setLocationHighlight(-1);
      return;
    }

    if (e.key === 'Tab') {
      setLocationOpen(false);
      setLocationHighlight(-1);
    }
  };

  const handleExperienceKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!experienceOpen) {
        setExperienceOpen(true);
        setLocationOpen(false);
        setNoticeOpen(false);
        setSortOpen(false);
        const currIdx = EXPERIENCE_OPTIONS.findIndex(
          (opt) => opt.value === experienceFilter
        );
        setExperienceHighlight(currIdx >= 0 ? currIdx : 0);
        return;
      }
      setExperienceHighlight((prev) =>
        prev < EXPERIENCE_OPTIONS.length - 1 ? prev + 1 : 0
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!experienceOpen) {
        setExperienceOpen(true);
        setLocationOpen(false);
        setNoticeOpen(false);
        setSortOpen(false);
        const currIdx = EXPERIENCE_OPTIONS.findIndex(
          (opt) => opt.value === experienceFilter
        );
        setExperienceHighlight(
          currIdx >= 0 ? currIdx : EXPERIENCE_OPTIONS.length - 1
        );
        return;
      }
      setExperienceHighlight((prev) =>
        prev > 0 ? prev - 1 : EXPERIENCE_OPTIONS.length - 1
      );
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (
        experienceOpen &&
        experienceHighlight >= 0 &&
        EXPERIENCE_OPTIONS[experienceHighlight]
      ) {
        handleSelectExperience(EXPERIENCE_OPTIONS[experienceHighlight].value);
      } else {
        setExperienceOpen((prev) => !prev);
        setLocationOpen(false);
        setNoticeOpen(false);
        setSortOpen(false);
        const currIdx = EXPERIENCE_OPTIONS.findIndex(
          (opt) => opt.value === experienceFilter
        );
        setExperienceHighlight(currIdx >= 0 ? currIdx : 0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setExperienceOpen(false);
      setExperienceHighlight(-1);
      return;
    }

    if (e.key === 'Tab') {
      setExperienceOpen(false);
      setExperienceHighlight(-1);
    }
  };

  const handleNoticeKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!noticeOpen) {
        setNoticeOpen(true);
        setSortOpen(false);
        setLocationOpen(false);
        setExperienceOpen(false);
        const currIdx = noticePeriods.indexOf(noticePeriod);
        setNoticeHighlight(currIdx >= 0 ? currIdx : 0);
        return;
      }
      setNoticeHighlight((prev) =>
        prev < noticePeriods.length - 1 ? prev + 1 : 0
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!noticeOpen) {
        setNoticeOpen(true);
        setSortOpen(false);
        setLocationOpen(false);
        setExperienceOpen(false);
        const currIdx = noticePeriods.indexOf(noticePeriod);
        setNoticeHighlight(currIdx >= 0 ? currIdx : noticePeriods.length - 1);
        return;
      }
      setNoticeHighlight((prev) =>
        prev > 0 ? prev - 1 : noticePeriods.length - 1
      );
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (noticeOpen && noticeHighlight >= 0 && noticePeriods[noticeHighlight]) {
        handleSelectNotice(noticePeriods[noticeHighlight]);
      } else {
        setNoticeOpen((prev) => !prev);
        setSortOpen(false);
        setLocationOpen(false);
        setExperienceOpen(false);
        const currIdx = noticePeriods.indexOf(noticePeriod);
        setNoticeHighlight(currIdx >= 0 ? currIdx : 0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setNoticeOpen(false);
      setNoticeHighlight(-1);
      return;
    }

    if (e.key === 'Tab') {
      setNoticeOpen(false);
      setNoticeHighlight(-1);
    }
  };

  const handleSortKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!sortOpen) {
        setSortOpen(true);
        setNoticeOpen(false);
        setLocationOpen(false);
        setExperienceOpen(false);
        const currIdx = sortOptions.indexOf(sortBy);
        setSortHighlight(currIdx >= 0 ? currIdx : 0);
        return;
      }
      setSortHighlight((prev) =>
        prev < sortOptions.length - 1 ? prev + 1 : 0
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!sortOpen) {
        setSortOpen(true);
        setNoticeOpen(false);
        setLocationOpen(false);
        setExperienceOpen(false);
        const currIdx = sortOptions.indexOf(sortBy);
        setSortHighlight(currIdx >= 0 ? currIdx : sortOptions.length - 1);
        return;
      }
      setSortHighlight((prev) =>
        prev > 0 ? prev - 1 : sortOptions.length - 1
      );
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (sortOpen && sortHighlight >= 0 && sortOptions[sortHighlight]) {
        handleSelectSort(sortOptions[sortHighlight]);
      } else {
        setSortOpen((prev) => !prev);
        setNoticeOpen(false);
        setLocationOpen(false);
        setExperienceOpen(false);
        const currIdx = sortOptions.indexOf(sortBy);
        setSortHighlight(currIdx >= 0 ? currIdx : 0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setSortOpen(false);
      setSortHighlight(-1);
      return;
    }

    if (e.key === 'Tab') {
      setSortOpen(false);
      setSortHighlight(-1);
    }
  };

  const selectedLocationLabel =
    LOCATION_OPTIONS.find((opt) => opt.value === locationFilter)?.label ||
    locationFilter ||
    'All Locations (Global & India)';

  const selectedExperienceLabel =
    EXPERIENCE_OPTIONS.find((opt) => opt.value === experienceFilter)?.label ||
    experienceFilter ||
    'All Experience Tiers';

  return (
    <div className="JobSearch-floatingCard">
      <form onSubmit={handleFormSubmit} className="JobSearch-searchForm">
        {/* Row 1: Search Inputs Grid */}
        <div className="JobSearch-inputsRow">
          {/* Keyword Input with Magnifying Glass Icon */}
          <div className="JobSearch-fieldWithIcon JobSearch-keywordField">
            <label htmlFor="job-search-query" className="sr-only">
              Search by title or tech stack
            </label>
            <svg
              className="JobSearch-inputIcon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <SkillSearchInput
              id="job-search-query"
              ariaLabel="Search job titles or skills"
              className="JobSearch-nativeInput"
              placeholder="Skill, role or stack (e.g. React, Python, Cloud)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onSelect={(skill) => setSearchQuery(skill)}
            />
            {searchQuery && (
              <button
                type="button"
                className="JobSearch-clearBtn"
                aria-label="Clear search input"
                onClick={() => setSearchQuery('')}
              >
                <CloseIcon size={13} />
              </button>
            )}
          </div>

          {/* Location Custom Dropdown */}
          <div
            className="JobSearch-customSelectWrapper"
            ref={locationRef}
          >
            {/* Hidden native select for WCAG accessibility and form compatibility */}
            <label htmlFor="job-search-location" className="sr-only">
              Filter by Location
            </label>
            <select
              id="job-search-location"
              aria-label="Filter jobs by location"
              className="JobSearch-hiddenSelect"
              tabIndex={-1}
              aria-hidden="true"
              value={locationFilter}
              onChange={(e) => handleSelectLocation(e.target.value)}
            >
              {LOCATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              id="location-filter-trigger"
              ref={locationTriggerRef}
              className={`JobSearch-customSelectTrigger ${locationOpen ? 'is-open' : ''}`}
              aria-haspopup="listbox"
              aria-expanded={locationOpen}
              aria-controls="location-filter-menu"
              aria-label={`Location filter: ${selectedLocationLabel}`}
              onClick={() => {
                setLocationOpen((prev) => !prev);
                setExperienceOpen(false);
                setNoticeOpen(false);
                setSortOpen(false);
                const currIdx = LOCATION_OPTIONS.findIndex(
                  (opt) => opt.value === locationFilter
                );
                setLocationHighlight(currIdx >= 0 ? currIdx : 0);
              }}
              onKeyDown={handleLocationKeyDown}
            >
              <svg
                className="JobSearch-fieldLeftIcon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>

              <span className="JobSearch-customSelectValue">
                {selectedLocationLabel}
              </span>

              <svg
                className={`JobSearch-chevronIcon ${locationOpen ? 'is-open' : ''}`}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {locationOpen && (
              <ul
                id="location-filter-menu"
                className="JobSearch-customSelectMenu"
                role="listbox"
                aria-label="Filter jobs by location"
              >
                {LOCATION_OPTIONS.map((opt, idx) => {
                  const isSelected = opt.value === locationFilter;
                  const isHighlighted = idx === locationHighlight;
                  return (
                    <li
                      key={opt.value}
                      id={`location-option-${opt.value}`}
                      role="option"
                      aria-selected={isSelected}
                      className={`JobSearch-customSelectOption ${isSelected ? 'is-selected' : ''} ${isHighlighted ? 'is-highlighted' : ''}`}
                      onClick={() => handleSelectLocation(opt.value)}
                      onMouseEnter={() => setLocationHighlight(idx)}
                    >
                      <span className="JobSearch-customSelectOptionText">
                        {opt.label}
                      </span>
                      {isSelected && (
                        <svg
                          className="JobSearch-checkIcon"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Experience Custom Dropdown */}
          <div
            className="JobSearch-customSelectWrapper"
            ref={experienceRef}
          >
            {/* Hidden native select for WCAG accessibility and form compatibility */}
            <label htmlFor="job-search-experience" className="sr-only">
              Filter by Experience
            </label>
            <select
              id="job-search-experience"
              aria-label="Filter jobs by experience tier"
              className="JobSearch-hiddenSelect"
              tabIndex={-1}
              aria-hidden="true"
              value={experienceFilter}
              onChange={(e) => handleSelectExperience(e.target.value)}
            >
              {EXPERIENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              id="experience-filter-trigger"
              ref={experienceTriggerRef}
              className={`JobSearch-customSelectTrigger ${experienceOpen ? 'is-open' : ''}`}
              aria-haspopup="listbox"
              aria-expanded={experienceOpen}
              aria-controls="experience-filter-menu"
              aria-label={`Experience filter: ${selectedExperienceLabel}`}
              onClick={() => {
                setExperienceOpen((prev) => !prev);
                setLocationOpen(false);
                setNoticeOpen(false);
                setSortOpen(false);
                const currIdx = EXPERIENCE_OPTIONS.findIndex(
                  (opt) => opt.value === experienceFilter
                );
                setExperienceHighlight(currIdx >= 0 ? currIdx : 0);
              }}
              onKeyDown={handleExperienceKeyDown}
            >
              <svg
                className="JobSearch-fieldLeftIcon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>

              <span className="JobSearch-customSelectValue">
                {selectedExperienceLabel}
              </span>

              <svg
                className={`JobSearch-chevronIcon ${experienceOpen ? 'is-open' : ''}`}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {experienceOpen && (
              <ul
                id="experience-filter-menu"
                className="JobSearch-customSelectMenu"
                role="listbox"
                aria-label="Filter jobs by experience tier"
              >
                {EXPERIENCE_OPTIONS.map((opt, idx) => {
                  const isSelected = opt.value === experienceFilter;
                  const isHighlighted = idx === experienceHighlight;
                  return (
                    <li
                      key={opt.value}
                      id={`experience-option-${opt.value}`}
                      role="option"
                      aria-selected={isSelected}
                      className={`JobSearch-customSelectOption ${isSelected ? 'is-selected' : ''} ${isHighlighted ? 'is-highlighted' : ''}`}
                      onClick={() => handleSelectExperience(opt.value)}
                      onMouseEnter={() => setExperienceHighlight(idx)}
                    >
                      <span className="JobSearch-customSelectOptionText">
                        {opt.label}
                      </span>
                      {isSelected && (
                        <svg
                          className="JobSearch-checkIcon"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Search Submit Button */}
          <button
            type="submit"
            aria-label="Search Jobs"
            className="JobSearch-submitButton"
          >
            <span>Search</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>

        {/* Row 2: Secondary Filter Bars (Work Mode & Job Mode & Notice) */}
        <div
          className="JobSearch-subFiltersRow"
          style={{ flexWrap: 'wrap', gap: '1rem', rowGap: '0.85rem' }}
        >
          {/* Work Mode Filter Pills */}
          <div className="JobSearch-workModeGroup">
            <span className="JobSearch-workModeLabel">WORK MODE:</span>
            <div className="JobSearch-modePillsList">
              {workModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`JobSearch-modePill ${workMode === mode ? 'JobSearch-activeModePill' : ''}`}
                  onClick={() => setWorkMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Job Mode Filter Pills */}
          {setJobMode && (
            <div className="JobSearch-workModeGroup">
              <span className="JobSearch-workModeLabel">JOB MODE:</span>
              <div className="JobSearch-modePillsList">
                {jobModes.map((jm) => (
                  <button
                    key={jm}
                    type="button"
                    className={`JobSearch-modePill ${jobMode === jm ? 'JobSearch-activeModePill' : ''}`}
                    onClick={() => setJobMode(jm)}
                  >
                    {jm}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notice Period Filter Custom Dropdown */}
          {setNoticePeriod && (
            <div
              className="JobSearch-workModeGroup"
              style={{ alignItems: 'center' }}
            >
              <span className="JobSearch-workModeLabel">NOTICE:</span>
              <div
                className="JobSearch-pillSelectWrapper"
                ref={noticeRef}
              >
                <select
                  id="job-search-notice"
                  aria-label="Filter jobs by notice period"
                  className="JobSearch-hiddenSelect"
                  tabIndex={-1}
                  aria-hidden="true"
                  value={noticePeriod}
                  onChange={(e) => handleSelectNotice(e.target.value)}
                >
                  {noticePeriods.map((np) => (
                    <option key={np} value={np}>
                      {np}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  id="notice-filter-trigger"
                  ref={noticeTriggerRef}
                  className={`JobSearch-pillSelectTrigger ${noticeOpen ? 'is-open' : ''}`}
                  aria-haspopup="listbox"
                  aria-expanded={noticeOpen}
                  aria-controls="notice-filter-menu"
                  aria-label={`Notice period filter: ${noticePeriod}`}
                  onClick={() => {
                    setNoticeOpen((prev) => !prev);
                    setSortOpen(false);
                    setLocationOpen(false);
                    setExperienceOpen(false);
                    const currIdx = noticePeriods.indexOf(noticePeriod);
                    setNoticeHighlight(currIdx >= 0 ? currIdx : 0);
                  }}
                  onKeyDown={handleNoticeKeyDown}
                >
                  <span className="JobSearch-pillSelectValue">
                    {noticePeriod}
                  </span>
                  <svg
                    className={`JobSearch-pillChevron ${noticeOpen ? 'is-open' : ''}`}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {noticeOpen && (
                  <ul
                    id="notice-filter-menu"
                    className="JobSearch-pillSelectMenu"
                    role="listbox"
                    aria-label="Filter jobs by notice period"
                  >
                    {noticePeriods.map((np, idx) => {
                      const isSelected = np === noticePeriod;
                      const isHighlighted = idx === noticeHighlight;
                      return (
                        <li
                          key={np}
                          id={`notice-option-${idx}`}
                          role="option"
                          aria-selected={isSelected}
                          className={`JobSearch-pillSelectOption ${isSelected ? 'is-selected' : ''} ${isHighlighted ? 'is-highlighted' : ''}`}
                          onClick={() => handleSelectNotice(np)}
                          onMouseEnter={() => setNoticeHighlight(idx)}
                        >
                          <span className="JobSearch-pillSelectOptionText">
                            {np}
                          </span>
                          {isSelected && (
                            <svg
                              className="JobSearch-checkIcon"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Right Status Indicator & Sorting Custom Dropdown */}
          <div
            className="JobSearch-statusSortGroup"
            style={{ marginLeft: 'auto' }}
          >
            <div className="JobSearch-rolesCounter">
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '16px',
                  color: '#16a34a',
                  marginRight: '4px',
                }}
              >
                bolt
              </span>
              <span className="JobSearch-rolesCountText">
                <strong>{totalResults}</strong> Open Tech Roles
              </span>
            </div>

            <div className="JobSearch-sortInline">
              <span className="JobSearch-sortLabel">Sort:</span>
              <div
                className="JobSearch-pillSelectWrapper"
                ref={sortRef}
              >
                <select
                  id="job-search-sort"
                  aria-label="Sort jobs"
                  className="JobSearch-hiddenSelect"
                  tabIndex={-1}
                  aria-hidden="true"
                  value={sortBy}
                  onChange={(e) => handleSelectSort(e.target.value)}
                >
                  {sortOptions.map((so) => (
                    <option key={so} value={so}>
                      {so}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  id="sort-filter-trigger"
                  ref={sortTriggerRef}
                  className={`JobSearch-pillSelectTrigger ${sortOpen ? 'is-open' : ''}`}
                  aria-haspopup="listbox"
                  aria-expanded={sortOpen}
                  aria-controls="sort-filter-menu"
                  aria-label={`Sort jobs: ${sortBy}`}
                  onClick={() => {
                    setSortOpen((prev) => !prev);
                    setNoticeOpen(false);
                    setLocationOpen(false);
                    setExperienceOpen(false);
                    const currIdx = sortOptions.indexOf(sortBy);
                    setSortHighlight(currIdx >= 0 ? currIdx : 0);
                  }}
                  onKeyDown={handleSortKeyDown}
                >
                  <span className="JobSearch-pillSelectValue">
                    {sortBy}
                  </span>
                  <svg
                    className={`JobSearch-pillChevron ${sortOpen ? 'is-open' : ''}`}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {sortOpen && (
                  <ul
                    id="sort-filter-menu"
                    className="JobSearch-pillSelectMenu JobSearch-pillSelectMenu--alignRight"
                    role="listbox"
                    aria-label="Sort jobs"
                  >
                    {sortOptions.map((so, idx) => {
                      const isSelected = so === sortBy;
                      const isHighlighted = idx === sortHighlight;
                      return (
                        <li
                          key={so}
                          id={`sort-option-${idx}`}
                          role="option"
                          aria-selected={isSelected}
                          className={`JobSearch-pillSelectOption ${isSelected ? 'is-selected' : ''} ${isHighlighted ? 'is-highlighted' : ''}`}
                          onClick={() => handleSelectSort(so)}
                          onMouseEnter={() => setSortHighlight(idx)}
                        >
                          <span className="JobSearch-pillSelectOptionText">
                            {so}
                          </span>
                          {isSelected && (
                            <svg
                              className="JobSearch-checkIcon"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default JobSearch;
