import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import './styles.css';

registerSW({ immediate: true });

// iOS scrolls the page to reveal a focused field and sometimes leaves it
// shifted after the keyboard closes, which misaligns every tap until reload.
// Put it back whenever no field has focus.
const resetScroll = () => {
  const a = document.activeElement;
  if (a && a.matches('input, textarea, select')) return;
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
};
document.addEventListener('focusout', () => setTimeout(resetScroll, 80));
window.visualViewport?.addEventListener('resize', () => setTimeout(resetScroll, 80));
window.addEventListener('scroll', () => setTimeout(resetScroll, 300), { passive: true });

render(<App />, document.getElementById('app')!);
