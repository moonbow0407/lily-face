/**
 * 站点级设置（site.json）：左上角链接按钮、左下角角色传送门、Cloudflare 统计。和角色无关。
 */
import site from '../../site.json';
import './site.css';

const LINK_ICONS = {
  github: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 1.6a10.4 10.4 0 0 0-3.29 20.27c.52.1.71-.23.71-.5v-1.77c-2.9.63-3.51-1.4-3.51-1.4-.47-1.2-1.15-1.52-1.15-1.52-.95-.65.07-.64.07-.64 1.05.07 1.6 1.08 1.6 1.08.93 1.6 2.45 1.14 3.04.87.1-.68.37-1.14.66-1.4-2.31-.27-4.75-1.16-4.75-5.15 0-1.14.4-2.07 1.08-2.8-.11-.27-.47-1.33.1-2.77 0 0 .88-.28 2.86 1.07a9.9 9.9 0 0 1 5.2 0c1.98-1.35 2.86-1.07 2.86-1.07.57 1.44.21 2.5.1 2.77.67.73 1.08 1.66 1.08 2.8 0 4-2.44 4.88-4.76 5.14.37.32.71.96.71 1.93v2.86c0 .28.19.61.72.5A10.4 10.4 0 0 0 12 1.6Z"/></svg>',
  // B 站经典小电视图标（#00a1d6 哔哩蓝）
  bilibili: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#00a1d6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.1 3.8 10.3 6.7m5.6-2.9-2.2 2.9" stroke-width="2.1"/><path d="M5.6 6.8Q12 6.3 18.4 6.8C20.5 7 21.4 8.2 21.5 10.6Q21.8 13.8 21.5 16.8C21.4 19 20.4 20.1 18.4 20.3Q12 20.8 5.6 20.3C3.6 20.1 2.6 19 2.5 16.8Q2.2 13.8 2.5 10.6C2.6 8.2 3.5 7 5.6 6.8Z" stroke-width="2.2"/><path d="M6.2 13.1 9.5 11.7m8.3 1.4-3.3-1.4" stroke-width="2.1"/><path d="M9.5 14.9c.3 1.8 2 1.8 2.5.3.5 1.5 2.2 1.5 2.5-.3" stroke-width="1.45"/></svg>',
  // 菲比团子线性图标（参考站）
  origin: `<svg viewBox="0 0 28 24" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5.4 10.1C6.0 3.3 9.2 1.8 14 1.8C18.8 1.8 22.0 3.3 22.6 10.1"/><path d="M6.0 7.7Q10.0 5.8 14 7.6Q18.0 5.8 22.0 7.7" stroke-width="1.3"/>
    <path d="M1.4 10.5Q14 9.7 26.6 10.5" stroke-width="1.7"/><path d="M5.6 10.6C4.7 12.8 4.6 14.8 5.0 16.5"/><path d="M22.4 10.6C23.3 12.8 23.4 14.8 23.0 16.5"/>
    <path d="M19.8 11.7l2.1 2.1m0-2.1l-2.1 2.1" stroke-width="1.35"/><circle cx="6.2" cy="18.8" r="2.45"/><circle cx="21.8" cy="18.8" r="2.45"/>
    <path d="M8.5 20.6Q14 21.8 19.5 20.6"/><ellipse cx="11.2" cy="16.5" rx="1.4" ry="2.25" fill="currentColor" stroke="none"/>
    <ellipse cx="16.8" cy="16.5" rx="1.4" ry="2.25" fill="currentColor" stroke="none"/><path d="M13.3 19.3Q14 20.0 14.7 19.3" stroke-width="1.35"/></svg>`,
  link: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
};

const ARROW_ICON = '<svg class="portal-arrow" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4"/></svg>';

/** 左上角链接按钮（音效按钮之后） */
export function setupSiteLinks(bar = document.querySelector('.toolbar.left')) {
  for (const l of site.links ?? []) {
    const a = document.createElement('a');
    a.className = 'tool-link';
    a.href = l.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = l.title ?? l.label;
    a.setAttribute('aria-label', a.title);
    a.innerHTML = LINK_ICONS[l.icon] ?? LINK_ICONS.link;
    bar.append(a);
  }
}

/** 左下角角色传送门（姐妹站与原站入口） */
export function setupPortals(root = document.querySelector('#app')) {
  const list = site.portals ?? [];
  if (!list.length || !root) return;
  const nav = document.createElement('nav');
  nav.className = 'portal-dock';
  nav.setAttribute('aria-label', '其他捏脸站');
  for (const p of list) {
    const el = document.createElement(p.current || !p.href ? 'span' : 'a');
    el.className = 'portal-item';
    if (p.color) el.style.setProperty('--portal-color', p.color);
    if (p.current) {
      el.setAttribute('aria-current', 'page');
    } else if (p.href) {
      el.href = p.href;
      el.target = '_blank';
      el.rel = 'noopener';
    }
    el.title = p.title ?? p.label;
    const badge = p.icon && LINK_ICONS[p.icon]
      ? `<span class="portal-icon">${LINK_ICONS[p.icon]}</span>`
      : '<span class="portal-dot" aria-hidden="true"></span>';
    const tag = p.tag ? `<span class="portal-tag">${p.tag}</span>` : '';
    const arrow = !p.current && p.href ? ARROW_ICON : '';
    el.innerHTML = `${badge}<span>${p.label}</span>${tag}${arrow}`;
    nav.append(el);
  }
  root.append(nav);
}

/** Cloudflare Web Analytics：只在正式构建、且配置了 token 时加载 */
export function setupAnalytics() {
  const token = site.cloudflare?.analyticsToken;
  if (!token || import.meta.env.DEV) return;
  const s = document.createElement('script');
  s.type = 'module';
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.dataset.cfBeacon = JSON.stringify({ token });
  document.body.append(s);
}

export default site;
