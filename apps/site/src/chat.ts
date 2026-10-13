/* The online chat window on every site page (線上客服): start a chat, then send and receive messages. The browser keeps the
 * chat's token, so the conversation follows the visitor between pages; new messages are asked for every few seconds. */
import {
  authorLabel,
  buildChatStartRequest,
  CHAT_ENDPOINT,
  CHAT_IDLE_POLL_MS,
  CHAT_POLL_MS,
  CHAT_START_ENDPOINT,
  CHAT_STORAGE_KEY,
  CHAT_TOKEN_HEADER,
  countNewReplies,
  formatChatTime,
  interpretChatResponse,
  mergeMessages,
  pollAfter,
  validateChatMessage,
  validateChatStart,
  type ChatMessage,
  type ChatStartErrors,
  type ChatStartField,
  type ChatStartValues,
} from './chat-logic.js';

const root = document.querySelector<HTMLElement>('[data-chat]');

/** localStorage can be missing or refuse (private windows, blocked site data): the chat then lasts as long as the page. */
const storage = {
  get: () => { try { return localStorage.getItem(CHAT_STORAGE_KEY); } catch { return null; } },
  set: (v: string) => { try { localStorage.setItem(CHAT_STORAGE_KEY, v); } catch { /* page-only */ } },
  clear: () => { try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch { /* page-only */ } },
};

async function request(url: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(url, { ...init, credentials: 'omit', headers: { accept: 'application/json', ...init.headers } });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  }
}

if (root) {
  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const launcher = q<HTMLButtonElement>('.chat-launcher');
  const badge = q<HTMLElement>('.chat-badge');
  const panel = q<HTMLElement>('.chat-panel');
  const log = q<HTMLElement>('.chat-log');
  const startForm = q<HTMLFormElement>('.chat-start');
  const compose = q<HTMLFormElement>('.chat-compose');
  const input = q<HTMLTextAreaElement>('#chat-input');

  let token = storage.get();
  let messages: ChatMessage[] = [];
  let closed = false;
  let unread = 0;
  /** The first answer restores what was already there; only later replies count toward the badge. */
  let loaded = false;
  let openedAt = 0;
  let timer: number | undefined;

  const isOpen = () => !panel.hidden;

  function showBadge() {
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? '9+' : String(unread);
    launcher.setAttribute('aria-label', unread ? `線上客服，${unread} 則新回覆` : '線上客服');
  }

  function render() {
    log.querySelectorAll('.chat-msg:not(.chat-greeting)').forEach(n => n.remove());
    for (const m of messages) {
      const row = document.createElement('p');
      row.className = `chat-msg from-${m.author}`;
      const bubble = document.createElement('span');
      bubble.className = 'chat-bubble';
      bubble.textContent = m.body;
      const meta = document.createElement('span');
      meta.className = 'chat-meta';
      meta.textContent = `${authorLabel(m.author)} · ${formatChatTime(m.createdAt)}`;
      row.append(bubble, meta);
      log.append(row);
    }
    startForm.hidden = !!token;
    compose.hidden = !token;
    input.placeholder = closed ? '對話已結束，留言即可重新開始' : '輸入訊息，按 Enter 送出';
    log.scrollTop = log.scrollHeight;
  }

  function showError(form: HTMLFormElement, message: string | null) {
    const slot = form.querySelector<HTMLElement>('.chat-error')!;
    slot.hidden = !message;
    slot.textContent = message ?? '';
  }

  /** The token no longer works (the conversation was deleted): start over. */
  function forget() {
    token = null;
    storage.clear();
    messages = [];
    closed = false;
    loaded = false;
    unread = 0;
    showBadge();
    render();
  }

  function schedule() {
    window.clearTimeout(timer);
    if (!token) return;
    timer = window.setTimeout(() => void poll(), isOpen() && !document.hidden ? CHAT_POLL_MS : CHAT_IDLE_POLL_MS);
  }

  async function poll() {
    if (!token) return;
    const after = pollAfter(messages);
    const { status, body } = await request(after ? `${CHAT_ENDPOINT}?after=${encodeURIComponent(after)}` : CHAT_ENDPOINT, { headers: { [CHAT_TOKEN_HEADER]: token } });
    const outcome = interpretChatResponse(status, body);
    if (outcome.kind === 'expired') return forget();
    if (outcome.kind === 'ok' && body && typeof body === 'object') {
      const data = body as { status: 'open' | 'closed'; messages: ChatMessage[] };
      const fresh = countNewReplies(messages, data.messages);
      const changed = fresh > 0 || data.messages.some(m => !messages.some(s => s.id === m.id)) || closed !== (data.status === 'closed');
      messages = mergeMessages(messages, data.messages);
      closed = data.status === 'closed';
      if (!isOpen() && fresh && loaded) { unread += fresh; showBadge(); }
      loaded = true;
      if (changed) render();
    }
    schedule();
  }

  function open() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    root!.classList.add('is-open');
    openedAt = performance.now();
    unread = 0;
    showBadge();
    render();
    (token ? input : q<HTMLInputElement>('#chat-name')).focus();
    if (token) void poll();
  }

  function close() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    root!.classList.remove('is-open');
    launcher.focus();
    schedule();
  }

  launcher.addEventListener('click', () => (isOpen() ? close() : open()));
  q<HTMLButtonElement>('.chat-close').addEventListener('click', close);
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && token) void poll(); });

  const FIELDS: ChatStartField[] = ['name', 'email', 'companyName', 'message', 'consent'];
  const read = (): ChatStartValues => {
    const d = new FormData(startForm);
    const text = (k: string) => String(d.get(k) ?? '');
    return { name: text('name'), email: text('email'), companyName: text('companyName'), message: text('message'), consent: d.get('consent') !== null, website: text('website') };
  };
  const showErrors = (errors: ChatStartErrors) => {
    for (const f of FIELDS) {
      const slot = root!.querySelector<HTMLElement>(`#chat-err-${f}`);
      if (slot) slot.textContent = errors[f] ?? '';
      const control = startForm.elements.namedItem(f) as HTMLElement | null;
      if (errors[f]) control?.setAttribute('aria-invalid', 'true');
      else control?.removeAttribute('aria-invalid');
    }
  };

  startForm.addEventListener('submit', async e => {
    e.preventDefault();
    showError(startForm, null);
    const values = read();
    const errors = validateChatStart(values);
    showErrors(errors);
    const first = FIELDS.find(f => errors[f]);
    if (first) return (startForm.elements.namedItem(first) as HTMLElement | null)?.focus();

    const button = startForm.querySelector<HTMLButtonElement>('button[type=submit]')!;
    button.disabled = true;
    button.textContent = '連線中…';
    const { status, body } = await request(CHAT_START_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildChatStartRequest(values, location.pathname, performance.now() - openedAt)),
    });
    button.disabled = false;
    button.textContent = '開始對話';
    const outcome = interpretChatResponse(status, body);
    if (outcome.kind !== 'ok' || !body || typeof body !== 'object') {
      return showError(startForm, outcome.kind === 'error' ? outcome.message : '目前無法連線，請稍後再試。');
    }
    const data = body as { token: string; status: 'open' | 'closed'; messages: ChatMessage[] };
    token = data.token;
    loaded = true;
    storage.set(token);
    messages = mergeMessages([], data.messages);
    closed = false;
    startForm.reset();
    render();
    input.focus();
    schedule();
  });

  const send = async () => {
    if (!token) return;
    showError(compose, null);
    const problem = validateChatMessage(input.value);
    if (problem) return showError(compose, input.value.trim() ? problem : null);
    const text = input.value.trim();
    input.value = '';
    const { status, body } = await request(`${CHAT_ENDPOINT}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CHAT_TOKEN_HEADER]: token },
      body: JSON.stringify({ body: text }),
    });
    const outcome = interpretChatResponse(status, body);
    if (outcome.kind === 'expired') return forget();
    if (outcome.kind === 'error') {
      input.value = text;
      return showError(compose, outcome.message);
    }
    messages = mergeMessages(messages, [body as ChatMessage]);
    closed = false;
    render();
    schedule();
  };
  compose.addEventListener('submit', e => { e.preventDefault(); void send(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send(); }
  });

  // A conversation from an earlier page: restore it quietly, so a reply that came meanwhile shows on the badge.
  if (token) void poll();
}
