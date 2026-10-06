/* /login/: send people to their company's own address. */
import { baseDomainFor, loginTarget } from './login-logic.js';

const form = document.querySelector<HTMLFormElement>('#login-form');
const input = document.querySelector<HTMLInputElement>('#f-code');
const error = document.querySelector<HTMLElement>('#err-code');
const row = input?.closest<HTMLElement>('.code-row');

if (form && input && error) {
  const suffix = document.querySelector<HTMLElement>('#code-suffix');
  if (suffix) suffix.textContent = `.${baseDomainFor(location.hostname)}`;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const target = loginTarget(input.value, location.hostname);
    if (!target.ok) {
      error.textContent = target.error;
      input.setAttribute('aria-invalid', 'true');
      row?.classList.add('invalid');
      input.focus();
      return;
    }
    location.assign(target.url);
  });
  input.addEventListener('input', () => {
    error.textContent = '';
    input.removeAttribute('aria-invalid');
    row?.classList.remove('invalid');
  });
}
