/* /trial/: checks the application in the browser, sends it to the platform API and shows what happened. */
import {
  CONTACT_EMAIL,
  interpretTrialResponse,
  subdomainPreview,
  TRIAL_ENDPOINT,
  validateTrialForm,
  buildTrialRequest,
  type FieldErrors,
  type TrialField,
  type TrialFormValues,
} from './trial-form.js';

const shownAt = performance.now();
const form = document.querySelector<HTMLFormElement>('#trial-form');
const done = document.querySelector<HTMLElement>('#trial-done');
const formError = document.querySelector<HTMLElement>('#form-error');
const preview = document.querySelector<HTMLElement>('#subdomain-preview');

const FIELDS: TrialField[] = ['companyName', 'taxId', 'employeeRange', 'contactName', 'contactTitle', 'email', 'phone', 'preferredSubdomain', 'identityProvider', 'consent'];

function read(f: HTMLFormElement): TrialFormValues {
  const data = new FormData(f);
  const text = (name: string) => String(data.get(name) ?? '');
  return {
    companyName: text('companyName'), taxId: text('taxId'), employeeRange: text('employeeRange'), contactName: text('contactName'),
    contactTitle: text('contactTitle'), email: text('email'), phone: text('phone'), preferredSubdomain: text('preferredSubdomain'),
    identityProvider: text('identityProvider'), consent: data.get('consent') !== null, website: text('website'),
  };
}

function controls(f: HTMLFormElement, field: TrialField): HTMLElement[] {
  const el = f.elements.namedItem(field);
  if (el instanceof RadioNodeList) return Array.from(el as ArrayLike<Node>).filter((n): n is HTMLElement => n instanceof HTMLElement);
  return el instanceof HTMLElement ? [el] : [];
}

function showFieldError(f: HTMLFormElement, field: TrialField, message: string | undefined) {
  const slot = document.getElementById(`err-${field}`);
  if (slot) slot.textContent = message ?? '';
  for (const c of controls(f, field)) {
    if (message) c.setAttribute('aria-invalid', 'true');
    else c.removeAttribute('aria-invalid');
  }
}

function showErrors(f: HTMLFormElement, errors: FieldErrors) {
  for (const field of FIELDS) showFieldError(f, field, errors[field]);
}

function showFormError(message: string | null, contact: boolean) {
  if (!formError) return;
  formError.hidden = !message;
  formError.textContent = message ?? '';
  if (message && contact) {
    formError.append(' ');
    const a = document.createElement('a');
    a.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Yutis Care 申請試用')}`;
    a.textContent = '寫信給我們';
    formError.append(a);
  }
}

function focusFirstError(f: HTMLFormElement, errors: FieldErrors) {
  const first = FIELDS.find(field => errors[field]);
  if (first) controls(f, first)[0]?.focus();
}

if (form && done) {
  const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
  const flagged = new Set<TrialField>();

  const updatePreview = () => {
    if (!preview) return;
    const value = (form.elements.namedItem('preferredSubdomain') as HTMLInputElement | null)?.value ?? '';
    const address = subdomainPreview(value);
    preview.hidden = !address;
    preview.textContent = address ? `貴公司的網址會是 ${address}` : '';
  };
  updatePreview();

  // After a failed send, each flagged field re-checks itself as the applicant corrects it.
  const recheck = (event: Event) => {
    const name = (event.target as HTMLInputElement | null)?.name as TrialField | undefined;
    if (name === 'preferredSubdomain') updatePreview();
    if (!name || !flagged.has(name)) return;
    const message = validateTrialForm(read(form))[name];
    showFieldError(form, name, message);
    if (!message) flagged.delete(name);
  };
  form.addEventListener('input', recheck);
  form.addEventListener('change', recheck);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    showFormError(null, false);
    const values = read(form);
    const errors = validateTrialForm(values);
    showErrors(form, errors);
    for (const field of Object.keys(errors) as TrialField[]) flagged.add(field);
    if (Object.keys(errors).length) {
      focusFirstError(form, errors);
      return;
    }

    if (button) { button.disabled = true; button.textContent = '送出中…'; }
    let status = 0;
    let body: unknown = null;
    try {
      const response = await fetch(TRIAL_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(buildTrialRequest(values, performance.now() - shownAt)),
        credentials: 'omit',
      });
      status = response.status;
      body = await response.json().catch(() => null);
    } catch {
      status = 0;
    }

    const outcome = interpretTrialResponse(status, body);
    if (outcome.kind === 'received') {
      form.hidden = true;
      done.hidden = false;
      const email = done.querySelector<HTMLElement>('[data-email]');
      if (email) email.textContent = values.email.trim();
      done.querySelector<HTMLElement>('h2')?.focus();
      done.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (button) { button.disabled = false; button.textContent = '送出申請'; }
    if (outcome.kind === 'field') {
      flagged.add(outcome.field);
      showFieldError(form, outcome.field, outcome.message);
      focusFirstError(form, { [outcome.field]: outcome.message });
    } else {
      showFormError(outcome.message, outcome.contact);
      formError?.focus();
    }
  });
}
