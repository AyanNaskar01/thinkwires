import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import ScrollReveal from '../common/ScrollReveal';

const CapabilityBriefing = () => {
  const [submitted, setSubmitted] = useState(false);
  const cbData = useSelector((state) => state.industries.capabilityBriefing);

  const badge = cbData?.badge || 'Global Staffing Intelligence';
  const title =
    cbData?.title || 'Need domain-certified engineers for your sector?';
  const description =
    cbData?.description ||
    'Request a customized industry capability briefing. We evaluate your tech architecture, compliance benchmarks, and provide an instant talent availability map.';

  const features =
    cbData?.features && cbData.features.length > 0
      ? cbData.features
      : [
          {
            icon: 'schedule',
            text: '48-hour shortlist SLA with pre-cleared engineers',
          },
          {
            icon: 'gavel',
            text: '100% compliant cross-border EOR contracts (US, Canada, Global)',
          },
          {
            icon: 'shield',
            text: 'Pre-screened against FDA, HIPAA, PCI-DSS, and ISO protocols',
          },
        ];

  const formCard = cbData?.formCard || {
    title: 'Request Industry Capability Briefing',
    subtitle: 'Confidential briefing tailored to your sector constraints.',
    industryOptions: [
      'Life Sciences & Healthcare',
      'Banking & FinTech (BFSI)',
      'Automotive & Mobility',
      'Manufacturing & Telecom',
      'Technology & Cloud Software',
      'Defense & Aerospace',
      'Semiconductor & Hardware',
      'Logistics & Supply Chain',
    ],
    podSizeOptions: [
      '1 - 3 Senior Specialists',
      '4 - 10 Engineered Pod',
      '10+ Scaled Global Pod',
      'Executive / Architect Search',
    ],
    privacyNote:
      'Non-disclosure assured. We never distribute engineer profiles without mutual confidentiality agreements.',
  };

  const industryOptions =
    formCard.industryOptions && formCard.industryOptions.length > 0
      ? formCard.industryOptions
      : [
          'Life Sciences & Healthcare',
          'Banking & FinTech (BFSI)',
          'Automotive & Mobility',
          'Manufacturing & Telecom',
          'Technology & Cloud Software',
          'Defense & Aerospace',
          'Semiconductor & Hardware',
          'Logistics & Supply Chain',
        ];

  const podSizeOptions =
    formCard.podSizeOptions && formCard.podSizeOptions.length > 0
      ? formCard.podSizeOptions
      : [
          '1 - 3 Senior Specialists',
          '4 - 10 Engineered Pod',
          '10+ Scaled Global Pod',
          'Executive / Architect Search',
        ];

  const [selectedIndustry, setSelectedIndustry] = useState(
    industryOptions[0] || 'Life Sciences & Healthcare'
  );
  const [selectedPodSize, setSelectedPodSize] = useState(
    podSizeOptions[0] || '1 - 3 Senior Specialists'
  );

  const [industryOpen, setIndustryOpen] = useState(false);
  const [podSizeOpen, setPodSizeOpen] = useState(false);
  const [industryHighlight, setIndustryHighlight] = useState(-1);
  const [podSizeHighlight, setPodSizeHighlight] = useState(-1);

  const industryRef = useRef(null);
  const podSizeRef = useRef(null);
  const industryTriggerRef = useRef(null);
  const podSizeTriggerRef = useRef(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (industryRef.current && !industryRef.current.contains(e.target)) {
        setIndustryOpen(false);
        setIndustryHighlight(-1);
      }
      if (podSizeRef.current && !podSizeRef.current.contains(e.target)) {
        setPodSizeOpen(false);
        setPodSizeHighlight(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectIndustry = (val) => {
    setSelectedIndustry(val);
    setIndustryOpen(false);
    setIndustryHighlight(-1);
    if (industryTriggerRef.current) {
      industryTriggerRef.current.focus();
    }
  };

  const handleIndustryKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!industryOpen) {
        setIndustryOpen(true);
        const currIdx = industryOptions.indexOf(selectedIndustry);
        setIndustryHighlight(currIdx >= 0 ? currIdx : 0);
        return;
      }
      setIndustryHighlight((prev) =>
        prev < industryOptions.length - 1 ? prev + 1 : 0
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!industryOpen) {
        setIndustryOpen(true);
        const currIdx = industryOptions.indexOf(selectedIndustry);
        setIndustryHighlight(
          currIdx >= 0 ? currIdx : industryOptions.length - 1
        );
        return;
      }
      setIndustryHighlight((prev) =>
        prev > 0 ? prev - 1 : industryOptions.length - 1
      );
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (
        industryOpen &&
        industryHighlight >= 0 &&
        industryOptions[industryHighlight]
      ) {
        handleSelectIndustry(industryOptions[industryHighlight]);
      } else {
        setIndustryOpen((prev) => !prev);
        const currIdx = industryOptions.indexOf(selectedIndustry);
        setIndustryHighlight(currIdx >= 0 ? currIdx : 0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIndustryOpen(false);
      setIndustryHighlight(-1);
      return;
    }

    if (e.key === 'Tab') {
      setIndustryOpen(false);
      setIndustryHighlight(-1);
    }
  };

  const handleSelectPodSize = (val) => {
    setSelectedPodSize(val);
    setPodSizeOpen(false);
    setPodSizeHighlight(-1);
    if (podSizeTriggerRef.current) {
      podSizeTriggerRef.current.focus();
    }
  };

  const handlePodSizeKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!podSizeOpen) {
        setPodSizeOpen(true);
        const currIdx = podSizeOptions.indexOf(selectedPodSize);
        setPodSizeHighlight(currIdx >= 0 ? currIdx : 0);
        return;
      }
      setPodSizeHighlight((prev) =>
        prev < podSizeOptions.length - 1 ? prev + 1 : 0
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!podSizeOpen) {
        setPodSizeOpen(true);
        const currIdx = podSizeOptions.indexOf(selectedPodSize);
        setPodSizeHighlight(currIdx >= 0 ? currIdx : podSizeOptions.length - 1);
        return;
      }
      setPodSizeHighlight((prev) =>
        prev > 0 ? prev - 1 : podSizeOptions.length - 1
      );
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (
        podSizeOpen &&
        podSizeHighlight >= 0 &&
        podSizeOptions[podSizeHighlight]
      ) {
        handleSelectPodSize(podSizeOptions[podSizeHighlight]);
      } else {
        setPodSizeOpen((prev) => !prev);
        const currIdx = podSizeOptions.indexOf(selectedPodSize);
        setPodSizeHighlight(currIdx >= 0 ? currIdx : 0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setPodSizeOpen(false);
      setPodSizeHighlight(-1);
      return;
    }

    if (e.key === 'Tab') {
      setPodSizeOpen(false);
      setPodSizeHighlight(-1);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section className="CapabilityBriefing-section" id="capability-briefing">
      <div
        className="CapabilityBriefing-bgGlow CapabilityBriefing-bgGlow--left"
        aria-hidden="true"
      ></div>
      <div
        className="CapabilityBriefing-bgGlow CapabilityBriefing-bgGlow--right"
        aria-hidden="true"
      ></div>

      <div className="CapabilityBriefing-container">
        {/* Left Column: Information */}
        <ScrollReveal
          direction="left"
          className="CapabilityBriefing-infoColWrap"
        >
          <div className="CapabilityBriefing-infoCol">
            <span className="CapabilityBriefing-badge">
              <span className="CapabilityBriefing-badgeDot"></span>
              {badge}
            </span>

            <h2 className="CapabilityBriefing-title">{title}</h2>

            <p className="CapabilityBriefing-description">{description}</p>

            <div className="CapabilityBriefing-featuresList">
              {features.map((feat, idx) => (
                <div key={idx} className="CapabilityBriefing-featureItem">
                  <span className="material-symbols-outlined CapabilityBriefing-featureIcon">
                    {feat.icon}
                  </span>
                  <span>{feat.text}</span>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Right Column: Form */}
        <ScrollReveal
          direction="right"
          className="CapabilityBriefing-formCardWrap"
        >
          <div className="CapabilityBriefing-formCard">
            <h3 className="CapabilityBriefing-formTitle">{formCard.title}</h3>
            <p className="CapabilityBriefing-formSubtitle">
              {formCard.subtitle}
            </p>

            <form className="CapabilityBriefing-form" onSubmit={handleSubmit}>
              <div className="CapabilityBriefing-formRow">
                <div className="CapabilityBriefing-formGroup">
                  <label className="CapabilityBriefing-label">Work Email</label>
                  <input
                    className="CapabilityBriefing-input"
                    placeholder="vp.eng@enterprise.com"
                    required
                    type="email"
                  />
                </div>
                <div className="CapabilityBriefing-formGroup">
                  <label className="CapabilityBriefing-label">
                    Company Name
                  </label>
                  <input
                    className="CapabilityBriefing-input"
                    placeholder="Global Corp Inc."
                    required
                    type="text"
                  />
                </div>
              </div>

              <div className="CapabilityBriefing-formRow">
                {/* Primary Industry Custom Dropdown */}
                <div className="CapabilityBriefing-formGroup">
                  <label
                    className="CapabilityBriefing-label"
                    id="industry-label"
                  >
                    Primary Industry
                  </label>
                  <div
                    className="CapabilityBriefing-customSelectWrap"
                    ref={industryRef}
                    style={{ position: 'relative' }}
                  >
                    <button
                      type="button"
                      id="industry-trigger"
                      ref={industryTriggerRef}
                      className={`CapabilityBriefing-customSelectTrigger${industryOpen ? ' is-open' : ''}`}
                      aria-haspopup="listbox"
                      aria-expanded={industryOpen}
                      aria-labelledby="industry-label industry-trigger"
                      onClick={() => {
                        setIndustryOpen((prev) => !prev);
                        if (!industryOpen) {
                          const idx = industryOptions.indexOf(selectedIndustry);
                          setIndustryHighlight(idx >= 0 ? idx : 0);
                        }
                      }}
                      onKeyDown={handleIndustryKeyDown}
                    >
                      <span className="CapabilityBriefing-customSelectValue">
                        {selectedIndustry}
                      </span>
                      <span
                        className={`material-symbols-outlined CapabilityBriefing-selectArrow${industryOpen ? ' is-open' : ''}`}
                        aria-hidden="true"
                      >
                        expand_more
                      </span>
                    </button>

                    {/* Hidden native select for form submit compatibility */}
                    <select
                      className="CapabilityBriefing-hiddenSelect"
                      name="primaryIndustry"
                      tabIndex={-1}
                      aria-hidden="true"
                      value={selectedIndustry}
                      onChange={() => {}}
                    >
                      {industryOptions.map((opt, i) => (
                        <option key={i} value={opt}>{opt}</option>
                      ))}
                    </select>

                    {industryOpen && (
                      <ul
                        id="industry-menu"
                        role="listbox"
                        aria-labelledby="industry-label"
                        className="CapabilityBriefing-customSelectMenu"
                      >
                        {industryOptions.map((opt, idx) => {
                          const isSelected = opt === selectedIndustry;
                          const isHighlighted = idx === industryHighlight;
                          return (
                            <li
                              key={idx}
                              role="option"
                              aria-selected={isSelected}
                              className={`CapabilityBriefing-customSelectOption${isSelected ? ' is-selected' : ''}${isHighlighted && !isSelected ? ' is-highlighted' : ''}`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectIndustry(opt);
                              }}
                              onMouseEnter={() => setIndustryHighlight(idx)}
                            >
                              <span className="CapabilityBriefing-customSelectOptionText">
                                {opt}
                              </span>
                              {isSelected && (
                                <span
                                  className="material-symbols-outlined CapabilityBriefing-customSelectCheck"
                                  aria-hidden="true"
                                >
                                  check
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Desired Pod Size Custom Dropdown */}
                <div className="CapabilityBriefing-formGroup">
                  <label
                    className="CapabilityBriefing-label"
                    id="podsize-label"
                  >
                    Desired Pod Size
                  </label>
                  <div
                    className="CapabilityBriefing-customSelectWrap"
                    ref={podSizeRef}
                    style={{ position: 'relative' }}
                  >
                    <button
                      type="button"
                      id="podsize-trigger"
                      ref={podSizeTriggerRef}
                      className={`CapabilityBriefing-customSelectTrigger${podSizeOpen ? ' is-open' : ''}`}
                      aria-haspopup="listbox"
                      aria-expanded={podSizeOpen}
                      aria-labelledby="podsize-label podsize-trigger"
                      onClick={() => {
                        setPodSizeOpen((prev) => !prev);
                        if (!podSizeOpen) {
                          const idx = podSizeOptions.indexOf(selectedPodSize);
                          setPodSizeHighlight(idx >= 0 ? idx : 0);
                        }
                      }}
                      onKeyDown={handlePodSizeKeyDown}
                    >
                      <span className="CapabilityBriefing-customSelectValue">
                        {selectedPodSize}
                      </span>
                      <span
                        className={`material-symbols-outlined CapabilityBriefing-selectArrow${podSizeOpen ? ' is-open' : ''}`}
                        aria-hidden="true"
                      >
                        expand_more
                      </span>
                    </button>

                    {/* Hidden native select for form submit compatibility */}
                    <select
                      className="CapabilityBriefing-hiddenSelect"
                      name="desiredPodSize"
                      tabIndex={-1}
                      aria-hidden="true"
                      value={selectedPodSize}
                      onChange={() => {}}
                    >
                      {podSizeOptions.map((opt, i) => (
                        <option key={i} value={opt}>{opt}</option>
                      ))}
                    </select>

                    {podSizeOpen && (
                      <ul
                        id="podsize-menu"
                        role="listbox"
                        aria-labelledby="podsize-label"
                        className="CapabilityBriefing-customSelectMenu"
                      >
                        {podSizeOptions.map((opt, idx) => {
                          const isSelected = opt === selectedPodSize;
                          const isHighlighted = idx === podSizeHighlight;
                          return (
                            <li
                              key={idx}
                              role="option"
                              aria-selected={isSelected}
                              className={`CapabilityBriefing-customSelectOption${isSelected ? ' is-selected' : ''}${isHighlighted && !isSelected ? ' is-highlighted' : ''}`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectPodSize(opt);
                              }}
                              onMouseEnter={() => setPodSizeHighlight(idx)}
                            >
                              <span className="CapabilityBriefing-customSelectOptionText">
                                {opt}
                              </span>
                              {isSelected && (
                                <span
                                  className="material-symbols-outlined CapabilityBriefing-customSelectCheck"
                                  aria-hidden="true"
                                >
                                  check
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              <div className="CapabilityBriefing-formGroup">
                <label className="CapabilityBriefing-label">
                  Tech Stack &amp; Compliance Requirements
                </label>
                <textarea
                  className="CapabilityBriefing-textarea"
                  placeholder="e.g., AUTOSAR Classic, C++, ISO 26262 ASIL-D or HIPAA HL7 FHIR with Python/AWS"
                  rows="3"
                ></textarea>
              </div>

              <button className="CapabilityBriefing-submitBtn" type="submit">
                <span>Generate Customized Capability Briefing</span>
                <span className="material-symbols-outlined">send</span>
              </button>

              {submitted && (
                <div className="CapabilityBriefing-feedback">
                  ✓ Briefing request received. A Thinkwires Sector Lead will
                  deliver your capability memo within 4 hours.
                </div>
              )}

              <p className="CapabilityBriefing-privacyNote">
                {formCard.privacyNote}
              </p>
            </form>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

export default CapabilityBriefing;
