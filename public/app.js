document.addEventListener('click', async (event) => {
  const close = event.target.closest('.alert-close');
  if (close) close.closest('.alert')?.remove();

  const copy = event.target.closest('[data-copy]');
  if (copy) {
    const target = document.querySelector(copy.dataset.copy);
    if (!target) return;

    const value = target.value || target.textContent || '';
    const old = copy.textContent;

    try {
      await navigator.clipboard.writeText(value);
      copy.textContent = 'Tersalin';
    } catch {
      if (typeof target.select === 'function') {
        target.select();
        document.execCommand('copy');
        copy.textContent = 'Tersalin';
      } else {
        copy.textContent = 'Gagal menyalin';
      }
    }

    setTimeout(() => { copy.textContent = old; }, 1400);
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form');
  if (!form) return;

  if (form.matches('[data-confirm]') && !window.confirm(form.dataset.confirm)) {
    event.preventDefault();
    return;
  }

  const submit = form.querySelector('button[type="submit"]');
  if (submit && !submit.disabled) {
    submit.dataset.originalText = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Memproses...';
    submit.setAttribute('aria-busy', 'true');
  }
});

const tabs = [...document.querySelectorAll('.section-tabs a')];
if (tabs.length && 'IntersectionObserver' in window) {
  const sections = tabs.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const observer = new IntersectionObserver(entries => {
    const active = entries.filter(e => e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if (!active) return;
    tabs.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${active.target.id}`));
  }, { rootMargin: '-120px 0px -65% 0px', threshold: [0, .2, .5] });
  sections.forEach(section => observer.observe(section));
}
