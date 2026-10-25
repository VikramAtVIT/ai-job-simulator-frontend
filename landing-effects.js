(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealTargets = document.querySelectorAll(
    '.landing-section-label, .landing-intro-grid, .landing-pillar:not(.landing-pillar-featured), .landing-workflow-heading, .landing-loop-step, .landing-skills-copy, .landing-skill-stack, .landing-progress-panel, .landing-final-cta'
  );

  if (!reducedMotion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14 });

    revealTargets.forEach(element => {
      element.classList.add('scroll-reveal');
      observer.observe(element);
    });
  }

  if (reducedMotion) return;

  document.querySelectorAll('.landing-preview-card, .landing-pillar').forEach(element => {
    element.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse') return;
      const bounds = element.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      element.style.setProperty('--tilt-x', `${(x * 7).toFixed(2)}deg`);
      element.style.setProperty('--tilt-y', `${(-y * 6).toFixed(2)}deg`);
    });
    element.addEventListener('pointerleave', () => {
      element.style.removeProperty('--tilt-x');
      element.style.removeProperty('--tilt-y');
    });
  });

  let scrollFrame = 0;
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      const scroll = window.scrollY;
      document.documentElement.style.setProperty('--landing-scroll-near', `${scroll * 0.035}px`);
      document.documentElement.style.setProperty('--landing-scroll-far', `${scroll * -0.02}px`);
      scrollFrame = 0;
    });
  }, { passive: true });
})();
