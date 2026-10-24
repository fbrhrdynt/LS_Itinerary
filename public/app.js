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
  if (event.defaultPrevented) return;
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

// Restore controls when Safari restores a page from its back/forward cache.
window.addEventListener('pageshow', () => {
  document.querySelectorAll('button[data-original-text]').forEach(button => {
    button.textContent = button.dataset.originalText;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  });
});
const resetToken = document.getElementById('reset-token');
function processResetLink() {
  if (!resetToken) return;
  const token = location.hash.slice(1);
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
    resetToken.value = token;
    document.getElementById('reset-form').style.removeProperty('display');
    document.getElementById('reset-status').textContent = 'Pilih password minimal 8 karakter. Tautan hanya dapat digunakan satu kali.';
  }
  history.replaceState(null, '', location.pathname);
}
processResetLink();
window.addEventListener('hashchange', processResetLink);

const passwordConfirmation = document.querySelector('#reset-form [name="confirm_password"]');
if (passwordConfirmation) {
  const passwordInput = document.querySelector('#reset-form [name="password"]');
  const validatePasswords = () => {
    passwordInput.setCustomValidity(new TextEncoder().encode(passwordInput.value).length > 72 ? 'Password maksimal 72 byte.' : '');
    passwordConfirmation.setCustomValidity(passwordConfirmation.value !== passwordInput.value ? 'Konfirmasi password harus sama.' : '');
  };
  passwordInput.addEventListener('input', validatePasswords);
  passwordConfirmation.addEventListener('input', validatePasswords);
}
