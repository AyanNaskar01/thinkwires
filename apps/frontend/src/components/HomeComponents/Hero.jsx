import React, { Suspense, lazy } from 'react';

// Lazy-load the heavy 3D canvas into its own async vendor chunk (SEC-FE-02)
const ThinkWiresAnimation = lazy(() => import('../ThinkWiresAnimation'));

const HeroSkeleton = () => (
  <div
    className="Hero-heroSection flex items-center justify-center bg-[#FAF8FF] min-h-[500px]"
    aria-hidden="true"
  >
    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

const Hero = () => {
  return (
    <section className={'Hero-heroSection min-h-[500px] relative'}>
      <Suspense fallback={<HeroSkeleton />}>
        <ThinkWiresAnimation />
      </Suspense>
    </section>
  );
};

export default Hero;
