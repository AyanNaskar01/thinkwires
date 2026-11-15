import React, { useState, useEffect, useRef } from 'react';
import API_BASE from '../../utils/apiConfig';

const DOMAIN_OPTIONS = [
  'BFSI',
  'Healthcare',
  'SAP',
  'Cloud',
  'E-Commerce',
  'IT & Software',
  'Engineering',
  'Other',
];

const EXPERIENCE_OPTIONS = [
  '0–2 years',
  '2–5 years',
  '5–8 years',
  '8–12 years',
  '12+ years',
];

const NOTICE_PERIOD_OPTIONS = [
  'Immediate',
  'Less than 15 days',
  '15–30 days',
  '30 days',
  'Flexible',
];

/**
 * RequisitionDropdown: Premium custom dropdown matching the reference design.
 * Features:
 * - Rounded trigger with selected value and animated chevron
 * - Clean white popup menu with subtle shadow
 * - Primary blue selected option with checkmark
 * - Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)
 * - Click-outside and Escape listeners
 * - Preserves hidden native <select> for form serialization and accessibility
 */
const RequisitionDropdown = ({
  id,
  nativeId,
  name,
  label,
  value,
  options = [],
  onChange,
  isOpen,
  onToggle,
  onClose,
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
        onChange(name, options[highlightedIndex]);
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
    <div className={`BenchRequisition-field ${isOpen ? 'is-open' : ''}`}>
      <label
        htmlFor={nativeId}
        className="BenchRequisition-label"
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
      >
        {label}
      </label>

      {/* Hidden native select for accessibility & form compatibility */}
      <select
        id={nativeId}
        name={name}
        className="BenchRequisition-nativeSelectHidden"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        tabIndex={-1}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>

      {/* Custom styled dropdown container */}
      <div
        className={`BenchRequisition-customSelectContainer ${
          isOpen ? 'is-open' : ''
        }`}
      >
        <button
          ref={triggerRef}
          type="button"
          id={id}
          className={`BenchRequisition-customTrigger ${
            isOpen ? 'is-open' : ''
          }`}
          onClick={onToggle}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`Select ${label}`}
        >
          <span className="BenchRequisition-triggerValue" title={value}>
            {value}
          </span>
          <svg
            className={`BenchRequisition-dropdownChevron ${
              isOpen ? 'is-open' : ''
            }`}
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
            className="BenchRequisition-customMenu"
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
                  className={`BenchRequisition-customOption ${
                    isSelected ? 'is-selected' : ''
                  } ${isHighlighted ? 'is-highlighted' : ''}`}
                  onClick={() => {
                    onChange(name, opt);
                    onClose();
                    if (triggerRef.current) triggerRef.current.focus();
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  <span className="BenchRequisition-optionText">{opt}</span>
                  {isSelected && (
                    <svg
                      className="BenchRequisition-dropdownCheck"
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

const BenchRequisitionCTA = () => {
  const [formData, setFormData] = useState({
    requiredSkills: '',
    experienceRange: '2–5 years',
    domain: 'IT & Software',
    customDomain: '',
    noticePeriod: 'Immediate',
    workEmail: '',
    contactName: '',
    contactDetails: '',
  });

  const [openDropdown, setOpenDropdown] = useState(null);
  const formRef = useRef(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (formRef.current && !formRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errorMessage) setErrorMessage(null);
  };

  const handleDropdownSelect = (name, value) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errorMessage) setErrorMessage(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Client-side validations
    const skills = formData.requiredSkills.trim();
    if (!skills) {
      setErrorMessage('Please specify your required skills or tech stack.');
      return;
    }

    const email = formData.workEmail.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setErrorMessage('Please enter a valid work email address.');
      return;
    }

    const name = formData.contactName.trim();
    if (!name) {
      setErrorMessage('Please provide your contact name.');
      return;
    }

    const finalDomain =
      formData.domain === 'Other'
        ? formData.customDomain.trim() || 'Other'
        : formData.domain;

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = {
      targetRole: skills,
      techStack: skills,
      seniority: formData.experienceRange,
      domain: finalDomain,
      engagementModel: `Bench Requisition: ${finalDomain}`,
      deploymentUrgency: formData.noticePeriod,
      corporateEmail: email,
      fullName: name,
      company: 'Bench Requisition Inquiry',
      phone: formData.contactDetails.trim() || '',
      contactDetails: formData.contactDetails.trim() || '',
      jobDescription: `Demand requisition submitted from Bench Pool. Domain: ${finalDomain}, Experience: ${formData.experienceRange}, Notice: ${formData.noticePeriod}`,
    };

    try {
      const response = await fetch(`${API_BASE}/find-talent/requisition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit requisition.');
      }

      setSuccessMessage(
        'Your technical hiring requisition has been dispatched to our Technical Staffing Director. We will contact you within 5 business hours.'
      );
      setFormData({
        requiredSkills: '',
        experienceRange: '2–5 years',
        domain: 'IT & Software',
        customDomain: '',
        noticePeriod: 'Immediate',
        workEmail: '',
        contactName: '',
        contactDetails: '',
      });
    } catch (err) {
      setErrorMessage(
        err.message || 'Unable to submit your requisition at this time. Please try again or reach out directly.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="BenchCta-section" aria-label="Highlight Your Demand">
      <div className="BenchCta-container">
        <div className="BenchCta-card BenchRequisition-card">
          <div className="BenchCta-content BenchRequisition-content">
            <span className="BenchCta-tag">DIRECT HIRING REQUISITION</span>
            <h2 className="BenchCta-title">Highlight Your Demand</h2>
            <p className="BenchCta-desc">
              Can’t find your exact stack on today’s active bench? Highlight your specific technical hiring requirements, and our talent directors will compile and vet tailored profiles within 5 business days.
            </p>

            {/* Submission Alerts */}
            {successMessage && (
              <div
                className="BenchRequisition-alert BenchRequisition-alertSuccess"
                role="status"
              >
                <span className="material-symbols-outlined">check_circle</span>
                <div>
                  <strong>Demand Requisition Received!</strong>
                  <p>{successMessage}</p>
                </div>
              </div>
            )}

            {errorMessage && (
              <div
                className="BenchRequisition-alert BenchRequisition-alertError"
                role="alert"
              >
                <span className="material-symbols-outlined">error</span>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Requisition Form */}
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              className="BenchRequisition-form"
            >
              <div className="BenchRequisition-grid">
                {/* A. Required Skills / Stack */}
                <div className="BenchRequisition-field full-width">
                  <label htmlFor="req-skills" className="BenchRequisition-label">
                    Required Skills / Stack <span className="req-star">*</span>
                  </label>
                  <input
                    id="req-skills"
                    name="requiredSkills"
                    type="text"
                    className="BenchRequisition-input"
                    placeholder="e.g. React, Node.js, Python, Java, AWS, SAP"
                    value={formData.requiredSkills}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                {/* B. Experience Range */}
                <RequisitionDropdown
                  id="req-experience-trigger"
                  nativeId="req-experience"
                  name="experienceRange"
                  label="Experience Range"
                  value={formData.experienceRange}
                  options={EXPERIENCE_OPTIONS}
                  onChange={handleDropdownSelect}
                  isOpen={openDropdown === 'experience'}
                  onToggle={() =>
                    setOpenDropdown(
                      openDropdown === 'experience' ? null : 'experience'
                    )
                  }
                  onClose={() => setOpenDropdown(null)}
                />

                {/* C. Domain */}
                <RequisitionDropdown
                  id="req-domain-trigger"
                  nativeId="req-domain"
                  name="domain"
                  label="Domain"
                  value={formData.domain}
                  options={DOMAIN_OPTIONS}
                  onChange={handleDropdownSelect}
                  isOpen={openDropdown === 'domain'}
                  onToggle={() =>
                    setOpenDropdown(openDropdown === 'domain' ? null : 'domain')
                  }
                  onClose={() => setOpenDropdown(null)}
                />

                {/* Custom Domain if Other selected */}
                {formData.domain === 'Other' && (
                  <div className="BenchRequisition-field full-width">
                    <label htmlFor="req-custom-domain" className="BenchRequisition-label">
                      Specify Other Domain <span className="req-star">*</span>
                    </label>
                    <input
                      id="req-custom-domain"
                      name="customDomain"
                      type="text"
                      className="BenchRequisition-input"
                      placeholder="e.g. EdTech, Telecommunications, Agritech"
                      value={formData.customDomain}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                )}

                {/* D. Target Notice Period */}
                <RequisitionDropdown
                  id="req-notice-trigger"
                  nativeId="req-notice"
                  name="noticePeriod"
                  label="Target Notice Period"
                  value={formData.noticePeriod}
                  options={NOTICE_PERIOD_OPTIONS}
                  onChange={handleDropdownSelect}
                  isOpen={openDropdown === 'notice'}
                  onToggle={() =>
                    setOpenDropdown(openDropdown === 'notice' ? null : 'notice')
                  }
                  onClose={() => setOpenDropdown(null)}
                />

                {/* E. Work Email */}
                <div className="BenchRequisition-field">
                  <label htmlFor="req-email" className="BenchRequisition-label">
                    Work Email <span className="req-star">*</span>
                  </label>
                  <input
                    id="req-email"
                    name="workEmail"
                    type="email"
                    className="BenchRequisition-input"
                    placeholder="name@company.com"
                    value={formData.workEmail}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                {/* F. Contact Details */}
                <div className="BenchRequisition-field">
                  <label htmlFor="req-name" className="BenchRequisition-label">
                    Contact Name <span className="req-star">*</span>
                  </label>
                  <input
                    id="req-name"
                    name="contactName"
                    type="text"
                    className="BenchRequisition-input"
                    placeholder="e.g. Sarah Jenkins"
                    value={formData.contactName}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="BenchRequisition-field">
                  <label htmlFor="req-details" className="BenchRequisition-label">
                    Contact Details / Preferred Channel
                  </label>
                  <input
                    id="req-details"
                    name="contactDetails"
                    type="text"
                    className="BenchRequisition-input"
                    placeholder="e.g. LinkedIn profile, Slack, or direct email"
                    value={formData.contactDetails}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              {/* Submit CTA Button */}
              <div className="BenchRequisition-actionRow">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="BenchCta-btnPrimary BenchRequisition-submitBtn"
                >
                  <span className="material-symbols-outlined">
                    {isSubmitting ? 'hourglass_top' : 'bolt'}
                  </span>
                  <span>
                    {isSubmitting
                      ? 'Dispatching Requisition...'
                      : 'Dispatch Custom Pod Requisition'}
                  </span>
                </button>
              </div>
            </form>

            {/* Note with mailto link */}
            <div className="BenchRequisition-hrNote">
              Can't find your exact stack? Speak with our Technical Director at{' '}
              <a
                href="mailto:hr@thinkwires.com"
                className="BenchRequisition-hrLink"
              >
                hr@thinkwires.com
              </a>
            </div>
          </div>

          {/* Right Visual Stats Column */}
          <div className="BenchCta-graphic">
            <div className="BenchCta-statBox">
              <span className="BenchCta-statNumber">5 Days</span>
              <span className="BenchCta-statLabel">
                Custom Pod Delivery SLA
              </span>
            </div>
            <div className="BenchCta-statBox">
              <span className="BenchCta-statNumber">100%</span>
              <span className="BenchCta-statLabel">
                IP Ownership from Day 1
              </span>
            </div>
            <div className="BenchCta-statBox">
              <span className="BenchCta-statNumber">&lt; 5h</span>
              <span className="BenchCta-statLabel">
                Director Intake Calibration
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BenchRequisitionCTA;
