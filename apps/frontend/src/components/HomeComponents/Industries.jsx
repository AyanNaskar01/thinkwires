import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  fetchIndustriesPageData,
  getAllIndustries,
} from '../../store/slices/industriesSlice';

const Industries = () => {
  const dispatch = useDispatch();
  const { sectors: reduxSectors, status } = useSelector(
    (state) => state.industries
  );

  const [isPaused, setIsPaused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchIndustriesPageData());
    }
  }, [dispatch, status]);

  const sectors =
    reduxSectors && reduxSectors.length > 0
      ? reduxSectors
      : getAllIndustries();

  // Create duplicated seamless array for continuous 0% -> -50% CSS marquee loop
  const marqueeSectors = useMemo(() => {
    if (!sectors || sectors.length === 0) return [];
    let base = [...sectors];
    while (base.length < 8) {
      base = [...base, ...sectors];
    }
    return [...base, ...base];
  }, [sectors]);

  return (
    <section className="Industries-section" aria-label="Industries We Empower">
      <div className="Industries-container">
        {/* Section Header with Title and Controls */}
        <div className="Industries-header">
          <div className="Industries-headerLeft">
            <span className="Industries-tag">DOMAIN EXPERTISE</span>
            <h2 className="Industries-title">Industries We Empower</h2>
            <p className="Industries-description">
              Supplying deep niche technical knowledge tailored to regulatory,
              compliance, and velocity needs across key sectors.
            </p>
          </div>

          <div className="Industries-headerRight flex items-center gap-3">
            {/* Play / Pause Toggle Button */}
            <button
              type="button"
              className="Industries-navBtn"
              onClick={() => setIsPaused((prev) => !prev)}
              aria-label={isPaused ? 'Resume auto-sliding' : 'Pause auto-sliding'}
              title={isPaused ? 'Resume auto-sliding' : 'Pause auto-sliding'}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isPaused ? 'play_arrow' : 'pause'}
              </span>
            </button>

            <Link to="/industries" className="Industries-browseLink group">
              <span>View All Sectors</span>
              <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </Link>
          </div>
        </div>

        {/* Continuous Infinite Marquee Carousel with Gradient Masks & Hover Pause */}
        <div
          className="Industries-carouselWrapper Industries-marqueeWrapper"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onTouchStart={() => setIsHovered(true)}
          onTouchEnd={() => setIsHovered(false)}
        >
          <div
            className={`Industries-carouselTrack Industries-marqueeTrack ${
              isPaused || isHovered ? 'is-paused' : ''
            }`}
            role="region"
            aria-label="Industry Cards Carousel"
          >
            {marqueeSectors.map((sector, index) => {
              const bgImg =
                sector.bgImage ||
                'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80';

              return (
                <article
                  key={`${sector.slug || sector.id || 'ind'}-${index}`}
                  className="Industries-carouselCard group"
                  style={{
                    backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.42) 0%, rgba(15, 23, 42, 0.88) 55%, #0f172a 100%), url("${bgImg}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {/* Card Content Top */}
                  <div className="Industries-cardTop">
                    <div className="Industries-cardHeaderRow">
                      <div className="Industries-glassIconWrap">
                        <span className="material-symbols-outlined text-[24px]">
                          {sector.icon || 'domain'}
                        </span>
                      </div>
                      <span className="Industries-glassBadge">
                        <span
                          className="Industries-badgeDot"
                          style={{
                            backgroundColor:
                              sector.badgeDot || 'var(--color-cobalt-bright, #2563EB)',
                          }}
                        />
                        {sector.badgeText || sector.badge || 'Domain Verified'}
                      </span>
                    </div>

                    <h3 className="Industries-carouselCardTitle">
                      {sector.title || sector.name}
                    </h3>
                    <p className="Industries-carouselCardDesc">
                      {sector.shortDesc || sector.desc}
                    </p>

                    {/* Placements / High-Demand tags preview */}
                    {sector.placements && sector.placements.length > 0 && (
                      <div className="Industries-cardTags">
                        {sector.placements.slice(0, 3).map((tag, i) => (
                          <span key={i} className="Industries-cardTag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Footer Pinned at Bottom */}
                  <div className="Industries-carouselCardFooter">
                    <span className="Industries-carouselPodsCount">
                      Pods: <strong>{sector.podsDeployed || '25+'}</strong>
                    </span>
                    <a
                      href="#process"
                      onClick={(e) => {
                        e.preventDefault();
                        const el = document.getElementById('process');
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      className="Industries-exploreLink cursor-pointer relative z-10 no-underline"
                      style={{ textDecoration: 'none', borderBottom: 'none' }}
                    >
                      <span>Explore</span>
                      <span
                        className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform"
                        style={{
                          textDecoration: 'none',
                          borderBottom: 'none',
                          display: 'inline-block',
                          lineHeight: 1,
                          verticalAlign: 'middle',
                        }}
                      >
                        arrow_forward
                      </span>
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* Bottom CTA Button */}
        <div className="Industries-bottomCta">
          <Link
            to="/industries"
            className="btn btn-outline"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.75rem',
              borderRadius: '9999px',
              fontSize: '0.95rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <span>View All 11 Specialized Sectors</span>
            <span className="material-symbols-outlined text-[18px]">apps</span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Industries;
