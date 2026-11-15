import React from 'react';
import { Link } from 'react-router-dom';
import { getIndustrySlugByJobSector } from '../../store/slices/industriesSlice';
import { shareJobOnWhatsApp, downloadJobDescriptionPdf } from '../../utils/jobActions';

const JobCard = ({ job, onApplyClick, onViewSpecClick }) => {
  const industrySlug =
    job.industrySlug ||
    getIndustrySlugByJobSector(
      [job.industrySector, job.category, job.title, job.department, job.company]
        .filter(Boolean)
        .join(' ')
    );

  const getIndustryDisplayName = (slug) => {
    switch (slug) {
      case 'information-technology': return 'Tech & Cloud';
      case 'bfsi': return 'BFSI & FinTech';
      case 'healthcare-life-sciences': return 'Healthcare & Bio';
      case 'automobile-manufacturing': return 'Industrial & Mfg';
      case 'automotive-mobility': return 'Automotive & Mobility';
      case 'telecommunications': return 'Telecom & 5G';
      case 'retail-ecommerce': return 'Retail & Commerce';
      case 'energy-utilities': return 'Energy & CleanTech';
      case 'education-edtech': return 'EdTech';
      case 'professional-services': return 'Consulting';
      case 'aerospace-defense': return 'Aerospace & Defense';
      default: return 'Enterprise Sector';
    }
  };

  const industryName = job.industrySector || getIndustryDisplayName(industrySlug);

  /* ── Logo background gradient ── */
  const getLogoBg = (logo = '') => {
    if (logo === 'SAP') return 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
    if (logo === 'ACH') return 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)';
    if (logo === 'AEM') return 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)';
    if (logo === 'AI')  return 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)';
    if (logo === 'K8S') return 'linear-gradient(135deg, #2563eb 0%, #0284c7 100%)';
    if (logo === 'AWS') return 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
    return 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
  };

  /* ── Badge colour map ── */
  const getJobModeBadge = (mode) => {
    if (!mode) return null;
    const map = {
      Permanent:        { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
      Contract:         { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
      'Contract to Hire': { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' },
    };
    return map[mode] || { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
  };

  const getStatusBadge = (badge) => {
    if (!badge) return null;
    const lc = badge.toLowerCase();
    if (lc.includes('hot'))       return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
    if (lc.includes('urgent'))    return { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' };
    if (lc.includes('immediate')) return { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
    if (lc.includes('high'))      return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
    return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
  };

  const modeBadge   = getJobModeBadge(job.jobMode);
  const statusBadge = getStatusBadge(job.badge || job.tag);

  const logoLabel = job.logo || (job.title ? job.title.substring(0, 2).toUpperCase() : 'TW');

  return (
    <div className="JC-card">

      {/* ── HEADER: category row + badges ── */}
      <div className="JC-header">
        {/* Left: category + industry pill */}
        <div className="JC-headerLeft">
          <span className="JC-category">
            {job.category || 'ENTERPRISE • CONTRACT'}
          </span>
          <Link
            to={`/industries/${industrySlug}`}
            className="JC-industryPill"
            onClick={(e) => e.stopPropagation()}
            title={`Explore ${industryName}`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>domain</span>
            {industryName}
          </Link>
        </div>

        {/* Right: job-mode + status badges */}
        <div className="JC-badgesRow">
          {modeBadge && (
            <span
              className="JC-badge"
              style={{ background: modeBadge.bg, color: modeBadge.color, borderColor: modeBadge.border }}
            >
              {job.jobMode}
            </span>
          )}
          {statusBadge && (job.badge || job.tag) && (
            <span
              className="JC-badge JC-badgeStatus"
              style={{ background: statusBadge.bg, color: statusBadge.color, borderColor: statusBadge.border }}
            >
              {job.badge || job.tag}
            </span>
          )}
        </div>
      </div>

      {/* ── TITLE ROW: logo + job title ── */}
      <div className="JC-titleRow">
        <div
          className="JC-logo"
          style={{ background: getLogoBg(job.logo) }}
          aria-hidden="true"
        >
          {logoLabel}
        </div>
        <h3 className="JC-title">{job.title}</h3>
      </div>

      {/* ── DESCRIPTION ── */}
      <p className="JC-description">{job.description}</p>

      {/* ── INFO GRID ── */}
      <div className="JC-infoGrid">

        {/* Location & Mode */}
        <div className="JC-infoItem">
          <span className="JC-infoLabel">
            <span className="material-symbols-outlined JC-infoIcon">location_on</span>
            Location &amp; Mode
          </span>
          <span className="JC-infoValue">
            {job.location}
            {job.workMode ? ` (${job.workMode})` : ''}
          </span>
        </div>

        {/* Experience & Type */}
        <div className="JC-infoItem">
          <span className="JC-infoLabel">
            <span className="material-symbols-outlined JC-infoIcon">work</span>
            Experience &amp; Type
          </span>
          <span className="JC-infoValue">
            {job.experience}
            {job.jobMode ? ` • ${job.jobMode}` : ''}
          </span>
        </div>

        {/* Budget Range */}
        <div className="JC-infoItem">
          <span className="JC-infoLabel">
            <span className="material-symbols-outlined JC-infoIcon">payments</span>
            Budget Range
          </span>
          <span className="JC-infoValue JC-salary">{job.salary}</span>
        </div>

        {/* Notice Period */}
        <div className="JC-infoItem">
          <span className="JC-infoLabel">
            <span className="material-symbols-outlined JC-infoIcon">timer</span>
            Notice Period
          </span>
          <span className="JC-infoValue">
            {job.noticePeriod || job.joining || 'Immediate'}
          </span>
        </div>
      </div>

      {/* ── SKILLS ── */}
      {job.skills && job.skills.length > 0 && (
        <div className="JC-skills">
          {job.skills.map((skill, idx) => (
            <span key={idx} className="JC-skill">{skill}</span>
          ))}
        </div>
      )}

      {/* ── ACTION BAR: Download + WhatsApp ── */}
      <div className="JC-actionBar">
        <button
          type="button"
          className="JC-actionBtn JC-downloadBtn"
          onClick={(e) => { e.stopPropagation(); downloadJobDescriptionPdf(job); }}
          title={`Download PDF JD for ${job.title}`}
          aria-label={`Download Job Description for ${job.title}`}
        >
          {/* Download icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download JD
        </button>

        <button
          type="button"
          className="JC-actionBtn JC-whatsappBtn"
          onClick={(e) => { e.stopPropagation(); shareJobOnWhatsApp(job); }}
          title={`Share ${job.title} on WhatsApp`}
          aria-label={`Share ${job.title} on WhatsApp`}
        >
          {/* WhatsApp icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
          </svg>
          WhatsApp
        </button>
      </div>

      {/* ── FOOTER: View Spec + Apply Now ── */}
      <div className="JC-footer">
        <button
          type="button"
          className="JC-viewSpecBtn"
          onClick={() => onViewSpecClick ? onViewSpecClick(job) : onApplyClick(job)}
          title="View Complete Job Specifications"
        >
          View Job Spec
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </button>

        <button
          type="button"
          className="JC-applyBtn"
          onClick={() => onApplyClick(job)}
          title="Apply for this position"
        >
          Apply Now
        </button>
      </div>
    </div>
  );
};

export default JobCard;
