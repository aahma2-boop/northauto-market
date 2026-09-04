'use strict';

const CATS = ['Brakes','Oil & Fluids','Filters','Tires & Wheels','Ignition','Suspension','Electrical','Wipers','Exhaust','Body Parts'];
const CONDITIONS = ['New','Like New','Good','For Parts'];
const COND_COLORS = { New:'#1a9e50', 'Like New':'#2b6cb0', Good:'#c98a04', 'For Parts':'#d43d3d' };
const CA_PROV = ['AB','BC','MB','NB','NL','NS','ON','PE','QC','SK'];
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const ICONS = {
  'Brakes':'<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>',
  'Oil & Fluids':'<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2 5 12h14L12 2z"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  'Filters':'<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16v4l-6 8v4H10v-4L4 8V4z"/></svg>',
  'Tires & Wheels':'<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3m9-9h-3M6 12H3"/></svg>',
  'Ignition':'<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  'Suspension':'<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20h16M6 20V10l6-6 6 6v10"/></svg>',
  'Electrical':'<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  'Wipers':'<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16v2l-8 14L4 6V4z"/></svg>',
  'Exhaust':'<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8h13a5 5 0 0 1 5 5v3h-4v-3a1 1 0 0 0-1-1H3z"/></svg>',
  'Body Parts':'<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11m-14 0h14a2 2 0 0 1 2 2v4h-2.5M5 11a2 2 0 0 0-2 2v4h2.5m0 0a2.5 2.5 0 1 0 5 0m-5 0h5m4.5 0a2.5 2.5 0 1 0 5 0m-5 0h5"/></svg>'
};
const icon = c => ICONS[c] || ICONS['Brakes'];
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const initials = n => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
const flag = c => c === 'Canada' ? 'CA' : 'US';

let me = null;
let state = { q:'', cat:'All', conds:new Set(), country:'', sort:'newest', view:'marketplace', showSaved:false };
let inboxCache = [];

async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('Request failed (' + r.status + ')'));
  return data;
}

/* ---------------- header ---------------- */
function renderHeader() {
  const el = document.getElementById('headerActions');
  const inboxBadge = inboxCache.filter(m => m.to_user === (me && me.id)).length;
  el.innerHTML = me ? `
    <button class="hbtn" id="marketplaceBtn">Marketplace</button>
    <button class="hbtn" id="myListingsBtn">My Listings</button>
    <button class="hbtn" id="inboxBtn">Inbox${inboxBadge ? `<span class="badge-count">${inboxBadge}</span>` : ''}</button>
    <button class="hbtn" id="ordersBtn">Orders</button>
    <button class="hbtn" id="savedBtn">Saved</button>
    <button class="hbtn primary" id="sellBtn">+ Sell a Part</button>
    <span style="font-size:13px;color:var(--text-3);margin-left:4px">Hi, <b style="color:var(--text)">${esc(me.name.split(' ')[0])}</b> (${flag(me.country)})</span>
    <button class="hbtn" id="logoutBtn">Log out</button>`
  : `
    <button class="hbtn" id="marketplaceBtn">Marketplace</button>
    <button class="hbtn" id="loginBtn">Log in</button>
    <button class="hbtn primary" id="sellBtn">+ Sell a Part</button>`;
  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
  on('marketplaceBtn', () => { state.view='marketplace'; state.showSaved=false; load(); });
  on('myListingsBtn', () => { state.view='mine'; state.showSaved=false; load(); });
  on('savedBtn', () => { state.showSaved=!state.showSaved; if (state.showSaved) state.view='marketplace'; load(); });
  on('sellBtn', () => me ? openSellForm() : openAuth('register'));
  on('loginBtn', () => openAuth('login'));
  on('logoutBtn', async () => { await api('/api/auth/logout', { method:'POST' }); me = null; state.view='marketplace'; await boot(); toast('Logged out'); });
  on('inboxBtn', openInbox);
  on('ordersBtn', openOrders);
  document.getElementById('myListingsBtn')?.classList.toggle('active-view', state.view==='mine');
  document.getElementById('savedBtn')?.classList.toggle('active-view', state.showSaved);
}

/* ---------------- filters & grid ---------------- */
async function load() {
  const p = new URLSearchParams();
  if (state.view === 'mine') p.set('mine', '1');
  else if (state.showSaved) p.set('saved', '1');
  if (state.q) p.set('q', state.q);
  if (state.cat !== 'All') p.set('category', state.cat);
  if (state.conds.size) [...state.conds].forEach(c => p.append('condition', c));
  if (state.country) p.set('country', state.country);
  p.set('sort', state.sort);
  let rows;
  try { ({ listings: rows } = await api('/api/listings?' + p)); }
  catch (e) { toast(e.message); return; }
  renderFilters(rows);
  renderGrid(rows);
  renderHeader();
  updatePayoutBanner();
  // stats
  const all = await api('/api/listings').catch(() => ({ listings: [] }));
  document.getElementById('statListings').textContent = all.listings.length;
  document.getElementById('statSellers').textContent = new Set(all.listings.map(l => l.seller)).size;
}

function renderFilters(rows) {
  const cats = ['All', ...CATS];
  document.getElementById('categoryList').innerHTML = cats.map(c => {
    const n = c==='All' ? rows.length : rows.filter(r => r.category===c).length;
    return `<li class="category-item ${state.cat===c?'active':''}" data-cat="${c}"><span>${c}</span><span class="category-count">${n}</span></li>`;
  }).join('');
  document.querySelectorAll('.category-item').forEach(el => el.onclick = () => { state.cat = el.dataset.cat; state.showSaved = false; load(); });
  document.getElementById('conditionFilters').innerHTML = CONDITIONS.map(c =>
    `<label class="check-row"><input type="checkbox" value="${c}" ${state.conds.has(c)?'checked':''}><span class="dot" style="background:${COND_COLORS[c]}"></span>${c}</label>`).join('');
  document.querySelectorAll('#conditionFilters input').forEach(el => el.onchange = () => { el.checked ? state.conds.add(el.value) : state.conds.delete(el.value); load(); });
  document.getElementById('countryFilters').innerHTML = [['','All locations'],['Canada','Canada'],['USA','USA']].map(([v,l]) =>
    `<label class="check-row"><input type="radio" name="cty" value="${v}" ${state.country===v?'checked':''}><span>${l}</span></label>`).join('');
  document.querySelectorAll('#countryFilters input').forEach(el => el.onchange = () => { state.country = el.value; load(); });
}

function priceHtml(l) {
  if (l.currency === 'CAD') return `<div class="product-price">$${l.price_usd.toFixed(2)} <span style="font-size:11px;font-weight:600;color:var(--text-4)">USD</span></div><div class="alt-price">CA$${l.price.toFixed(2)}</div>`;
  return `<div class="product-price">$${l.price.toFixed(2)} <span style="font-size:11px;font-weight:600;color:var(--text-4)">USD</span></div>`;
}

function renderGrid(rows) {
  const grid = document.getElementById('productGrid');
  const label = state.view==='mine' ? 'My Listings' : state.showSaved ? 'Saved items' : 'Marketplace';
  document.getElementById('resultsCount').textContent = `${label} — ${rows.length} item${rows.length!==1?'s':''} · prices shown in USD`;
  if (!rows.length) {
    grid.innerHTML = `<div class="empty-state"><div style="font-size:15px;font-weight:650;margin-bottom:4px">Nothing here yet</div><div style="font-size:13px">${state.view==='mine' ? 'Click "+ Sell a Part" to list your first item.' : 'Try clearing filters or search.'}</div></div>`;
    return;
  }
  grid.innerHTML = rows.map(l => `
    <div class="product-card ${l.sold?'sold':''}" data-id="${l.id}">
      <div class="product-image">
        ${l.image ? `<img src="${l.image}" alt="">` : icon(l.category)}
        <span class="cond-badge" style="background:${COND_COLORS[l.condition]||'#888'}">${l.condition}</span>
        <span class="ship-badge ${me && me.country !== l.country ? 'cross':''}">${flag(l.country)} · ${esc(l.city)}, ${l.region}</span>
        ${!l.mine ? `<button class="heart-btn ${l.saved?'saved':''}" data-heart="${l.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${l.saved?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg></button>`:''}
        ${l.sold ? '<div class="sold-stamp">SOLD</div>':''}
      </div>
      <div class="product-info">
        <div class="product-name">${esc(l.title)}</div>
        <div class="product-meta">${esc(l.fitment)}</div>
        <div class="seller-row">${flag(l.country)} ${esc(l.city)}, ${l.region} · ${esc(l.seller)}</div>
        <div class="product-footer">
          <div>${priceHtml(l)}</div>
          <span class="list-date">${l.ago}</span>
        </div>
        ${l.mine ? `<div class="manage-row">
          <button class="mini-btn" data-edit="${l.id}">Edit</button>
          <button class="mini-btn" data-sold="${l.id}">${l.sold?'Relist':'Mark sold'}</button>
          <button class="mini-btn danger" data-del="${l.id}">Delete</button>
        </div>`:''}
      </div>
    </div>`).join('');
  grid.querySelectorAll('.product-card').forEach(c => c.onclick = e => {
    if (e.target.closest('[data-heart],[data-edit],[data-del],[data-sold]')) return;
    openDetail(c.dataset.id);
  });
  grid.querySelectorAll('[data-heart]').forEach(b => b.onclick = async e => { e.stopPropagation(); await toggleSave(+b.dataset.heart); });
  grid.querySelectorAll('[data-edit]').forEach(b => b.onclick = async e => { e.stopPropagation(); const { listing } = await api('/api/listings/' + b.dataset.edit); openSellForm(listing); });
  grid.querySelectorAll('[data-del]').forEach(b => b.onclick = async e => { e.stopPropagation(); await api('/api/listings/' + b.dataset.del, { method:'DELETE' }); toast('Listing deleted'); load(); });
  grid.querySelectorAll('[data-sold]').forEach(b => b.onclick = async e => { e.stopPropagation(); const r = await api('/api/listings/' + b.dataset.sold + '/sold', { method:'POST' }); toast(r.sold ? 'Marked as sold' : 'Relisted'); load(); });
}

async function toggleSave(id) {
  if (!me) return openAuth('login');
  const was = document.querySelector(`[data-heart="${id}"]`)?.classList.contains('saved');
  await api('/api/listings/' + id + '/save', { method: was ? 'DELETE' : 'POST' });
  toast(was ? 'Removed from saved' : 'Saved');
  load();
}

/* ---------------- modal plumbing ---------------- */
const overlay = document.getElementById('modalOverlay'), modal = document.getElementById('modal');
function openModal(html) { modal.innerHTML = html; overlay.classList.add('active'); modal.querySelector('.modal-close').onclick = closeModal; }
function closeModal() { overlay.classList.remove('active'); }
overlay.onclick = e => { if (e.target === overlay) closeModal(); };

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

/* ---------------- auth ---------------- */
function openAuth(mode = 'login') {
  let m = mode;
  const draw = () => openModal(`
    <div class="modal-header"><div class="modal-title">${m==='login'?'Log in':'Create your account'}</div><button class="modal-close">×</button></div>
    <div class="modal-body">
      <div class="auth-tabs">
        <button class="auth-tab ${m==='login'?'active':''}" data-t="login">Log in</button>
        <button class="auth-tab ${m==='register'?'active':''}" data-t="register">Register</button>
      </div>
      <div class="form-group"><label class="form-label">Email <span>*</span></label><input class="form-input" id="aEmail" type="email" placeholder="you@example.com"></div>
      ${m==='register' ? `
      <div class="form-group"><label class="form-label">Your name <span>*</span></label><input class="form-input" id="aName" placeholder="e.g. Armin Ahmadi"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Country</label><select class="form-select" id="aCountry"><option value="USA">USA</option><option value="Canada">Canada</option></select></div>
        <div class="form-group"><label class="form-label">City</label><input class="form-input" id="aCity" placeholder="e.g. Detroit"></div>
      </div>
      <div class="form-group" id="regionWrap"></div>`:''}
      <div class="form-group"><label class="form-label">Password <span>*</span></label><input class="form-input" id="aPass" type="password" placeholder="${m==='register'?'At least 6 characters':'Your password'}"></div>
      <div class="form-error" id="aErr" style="display:none;margin-bottom:10px"></div>
      <button class="submit-btn" id="aGo">${m==='login'?'Log in':'Create account'}</button>
      ${m==='login' ? '<div style="margin-top:12px;font-size:12px;color:var(--text-3)">Demo seed accounts use password: <b>password123</b> (e.g. armin@northauto.example)</div>':''}
    </div>`);
  draw();
  const regionSelect = () => {
    const w = document.getElementById('regionWrap');
    if (!w) return;
    const isCA = document.getElementById('aCountry').value === 'Canada';
    w.innerHTML = `<label class="form-label">${isCA?'Province':'State'}</label><select class="form-select" id="aRegion">${(isCA?CA_PROV:US_STATES).map(r=>`<option>${r}</option>`).join('')}</select>`;
  };
  if (m === 'register') { regionSelect(); document.getElementById('aCountry').onchange = regionSelect; }
  modal.querySelectorAll('.auth-tab').forEach(t => t.onclick = () => { m = t.dataset.t; openAuth(m); });
  document.getElementById('aGo').onclick = async () => {
    const err = document.getElementById('aErr');
    err.style.display = 'none';
    try {
      const body = m==='login'
        ? { email: val('aEmail'), password: val('aPass') }
        : { email: val('aEmail'), password: val('aPass'), name: val('aName'), country: val('aCountry'), city: val('aCity'), region: val('aRegion') };
      const { user } = await api('/api/auth/' + m, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      me = user; closeModal(); toast(`Welcome, ${user.name.split(' ')[0]}!`); await refreshInbox(); load();
    } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
  };
}
const val = id => (document.getElementById(id)?.value || '').trim();

/* ---------------- detail & contact ---------------- */
async function openDetail(id) {
  let d;
  try { d = await api('/api/listings/' + id); } catch (e) { return toast(e.message); }
  const l = d.listing, s = d.seller;
  const cross = me && me.country !== l.country;
  const borderNote = cross
    ? `<span style="color:var(--warning);font-weight:600">Cross-border shipment (${flag(l.country)} → ${flag(me.country)}). Made in ${esc(l.made_in)} — ${l.made_in==='Canada' ? 'USMCA duty-free if shipped US → CA, or CA → US' : 'duty may apply'}.</span>`
    : `<span style="color:var(--positive);font-weight:600">Domestic shipment within ${esc(l.country)}.</span>`;
  openModal(`
    <div class="modal-header"><div class="modal-title">${esc(l.title)}</div><button class="modal-close">×</button></div>
    <div class="modal-body">
      <div style="display:flex;gap:18px;flex-wrap:wrap">
        <div style="width:180px;height:180px;background:var(--surface);border-radius:12px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border);flex-shrink:0;overflow:hidden">
          ${l.image ? `<img src="${l.image}" style="width:100%;height:100%;object-fit:cover" alt="">` : `<span style="opacity:0.4">${icon(l.category)}</span>`}
        </div>
        <div style="flex:1;min-width:190px">
          <span class="cond-badge" style="position:static;display:inline-block;background:${COND_COLORS[l.condition]||'#888'}">${l.condition}</span>
          <div style="font-size:26px;font-weight:800;margin:8px 0;font-variant-numeric:tabular-nums">$${l.price_usd.toFixed(2)} <span style="font-size:13px;font-weight:600;color:var(--text-4)">USD</span></div>
          ${l.currency==='CAD' ? `<div style="font-size:12px;color:var(--text-4);margin-bottom:6px">Listed at CA$${l.price.toFixed(2)}</div>`:''}
          <div style="color:var(--text-2);font-size:14px;margin-bottom:10px">Fits: ${esc(l.fitment)}</div>
          <div style="font-size:13px;color:var(--text-3);margin-bottom:14px">${l.ago} · Ships from ${esc(l.city)}, ${l.region} (${flag(l.country)})</div>
          ${l.mine
            ? `<div class="manage-row"><button class="mini-btn" id="dSold">${l.sold?'Relist':'Mark sold'}</button><button class="mini-btn" id="dEdit">Edit</button></div>`
            : `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="contact-btn" style="padding:11px 22px;font-size:14px;background:var(--positive)" id="dBuy">Buy now — $${l.price_usd.toFixed(2)}</button><button class="contact-btn" style="padding:11px 22px;font-size:14px" id="dContact">Message Seller</button></div>`}
        </div>
      </div>
      ${l.description ? `<div style="margin-top:16px;padding:13px;background:var(--surface);border-radius:10px;font-size:14px;line-height:1.5">${esc(l.description)}</div>`:''}
      <div class="border-panel">
        <b>Shipping &amp; origin</b><br>
        Ships from ${esc(l.city)}, ${l.region}, ${flag(l.country)} · ${cross ? 'Est. 4–8 business days (cross-border)' : 'Est. 2–5 business days'}<br>
        ${borderNote}
      </div>
      <div class="border-panel" style="margin-top:12px">
        <b>Duty &amp; tax estimate</b>
        <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap;align-items:center">
          <select class="form-select" id="dutyDest" style="width:auto">
            <option value="USA">Importing to USA</option>
            <option value="Canada" ${me && me.country === 'Canada' ? 'selected' : ''}>Importing to Canada</option>
          </select>
          <select class="form-select" id="dutyProv" style="width:auto;display:${me && me.country === 'Canada' ? 'inline-block' : 'none'}">${CA_PROV.map(p => `<option>${p}</option>`).join('')}</select>
          <button class="mini-btn" id="dutyGo">Estimate</button>
        </div>
        <div id="dutyOut" style="font-size:13px">Select your destination and click Estimate.</div>
      </div>
      <div class="seller-card">
        <div class="avatar">${initials(s.name)}</div>
        <div class="seller-info">
          <div class="seller-name">${esc(s.name)}</div>
          <div class="seller-loc">${esc(s.city)}, ${s.region} (${flag(s.country)})</div>
          <div class="seller-stats">${s.active} other active listing${s.active!==1?'s':''}</div>
        </div>
      </div>
    </div>`);
  const dc = document.getElementById('dContact');
  if (dc) dc.onclick = () => openContact(l);
  const ds = document.getElementById('dSold');
  if (ds) ds.onclick = async () => { await api(`/api/listings/${l.id}/sold`, { method:'POST' }); closeModal(); toast('Updated'); load(); };
  const de = document.getElementById('dEdit');
  if (de) de.onclick = () => openSellForm(l);
  const dBuy = document.getElementById('dBuy');
  if (dBuy) dBuy.onclick = async () => {
    try {
      const r = await api('/api/payments/checkout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ listing_id: l.id }) });
      if (r.demo) toast('Payments not configured yet — add STRIPE_SECRET_KEY to the server');
      else window.location.href = r.url;
    } catch (e) { toast(e.message); }
  };
  const dutyDest = document.getElementById('dutyDest');
  if (dutyDest) {
    const dutyProv = document.getElementById('dutyProv');
    dutyDest.onchange = () => { dutyProv.style.display = dutyDest.value === 'Canada' ? 'inline-block' : 'none'; };
    document.getElementById('dutyGo').onclick = async () => {
      const out = document.getElementById('dutyOut');
      out.textContent = 'Estimating...';
      try {
        const r = await api('/api/duty-estimate', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ listing_id: l.id, destination: dutyDest.value, province: dutyProv.value }) });
        out.innerHTML = r.lines.map(x => `<div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(x.label)}${x.note ? ` <span style="color:var(--text-4)">(${esc(x.note)})</span>` : ''}</span><b>${x.amount === null ? '—' : '$' + x.amount.toFixed(2)}</b></div>`).join('')
          + `<div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);margin-top:6px;padding-top:6px"><span><b>Estimated landed total</b></span><b>$${r.total.toFixed(2)}</b></div>`
          + `<div style="font-size:11px;color:var(--text-4);margin-top:6px">${esc(r.disclaimer)}</div>`;
      } catch (e) { out.textContent = e.message; }
    };
  }
}

function openContact(l) {
  openModal(`
    <div class="modal-header"><div class="modal-title">Message seller</div><button class="modal-close">×</button></div>
    <div class="modal-body">
      <div style="padding:13px;background:var(--surface);border-radius:10px;font-size:14px;margin-bottom:16px">Re: <b>${esc(l.title)}</b> — $${l.price_usd.toFixed(2)} USD · ships from ${esc(l.city)}, ${l.region}</div>
      <div class="form-group"><label class="form-label">Your message</label><textarea class="form-textarea" id="cMsg" placeholder="Hi, is this still available? Can you ship to ${me ? esc(me.city||'my city') : 'my city'}?"></textarea></div>
      <button class="submit-btn" id="cSend">Send Message</button>
    </div>`);
  document.getElementById('cSend').onclick = async () => {
    try {
      await api('/api/messages', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ listing_id: l.id, body: val('cMsg') }) });
      closeModal(); toast('Message sent'); refreshInbox();
    } catch (e) { toast(e.message); }
  };
}

/* ---------------- inbox ---------------- */
async function refreshInbox() {
  if (!me) { inboxCache = []; return; }
  try { ({ messages: inboxCache } = await api('/api/messages')); } catch (e) { inboxCache = []; }
}

function openInbox() {
  if (!me) return openAuth('login');
  const mine = inboxCache;
  openModal(`
    <div class="modal-header"><div class="modal-title">Inbox</div><button class="modal-close">×</button></div>
    <div class="modal-body">
      ${mine.length ? mine.map(m => `
        <div class="msg-row">
          <div class="msg-head"><span><b>${esc(m.from_name)}</b> ${m.from_user===me.id?'(you)':''} · re: ${esc(m.listing_title)}</span><span>${m.ago}</span></div>
          <div class="msg-body">${esc(m.body)}</div>
          <div class="msg-actions"><button class="link-btn" data-reply="${m.listing_id}" data-to="${m.from_user===me.id?m.to_user:m.from_user}">Reply</button></div>
        </div>`).join('')
      : '<div class="empty-state" style="padding:30px">No messages yet. Contact a seller to start a conversation.</div>'}
    </div>`);
  modal.querySelectorAll('[data-reply]').forEach(b => b.onclick = () => {
    const l = { id: +b.dataset.reply };
    openModal(`
      <div class="modal-header"><div class="modal-title">Reply</div><button class="modal-close">×</button></div>
      <div class="modal-body">
        <div class="form-group"><textarea class="form-textarea" id="rMsg"></textarea></div>
        <button class="submit-btn" id="rSend">Send</button>
      </div>`);
    document.getElementById('rSend').onclick = async () => {
      try {
        await api('/api/messages', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ listing_id: l.id, body: val('rMsg'), to_user: +b.dataset.to }) });
        closeModal(); toast('Reply sent'); refreshInbox().then(renderHeader);
      } catch (e) { toast(e.message); }
    };
  });
}

/* ---------------- sell form ---------------- */
function openSellForm(l) {
  const edit = !!l;
  openModal(`
    <div class="modal-header"><div class="modal-title">${edit?'Edit listing':'Sell a part — reach all of North America'}</div><button class="modal-close">×</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Part title <span>*</span></label><input class="form-input" id="fTitle" value="${edit?esc(l.title):''}" placeholder="e.g. Brembo Ceramic Brake Pads (Front)"><div class="form-error" id="eTitle">Required</div></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Category</label><select class="form-select" id="fCat">${CATS.map(c=>`<option ${edit&&l.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Condition</label><select class="form-select" id="fCond">${CONDITIONS.map(c=>`<option ${edit&&l.condition===c?'selected':''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Price <span>*</span> <span id="curTag" style="color:var(--text-3);font-weight:500">(USD)</span></label><input class="form-input" id="fPrice" type="number" min="0" step="0.01" value="${edit?l.price:''}" placeholder="0.00"><div class="form-error" id="ePrice">Enter a valid price</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:4px" id="convNote"></div></div>
        <div class="form-group"><label class="form-label">Fits / Fitment</label><input class="form-input" id="fFit" value="${edit?esc(l.fitment):''}" placeholder="e.g. 2019–2024 Toyota Camry"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Ships from (country)</label><select class="form-select" id="fCountry"><option value="USA" ${edit&&l.country==='USA'?'selected':''}>USA</option><option value="Canada" ${(!edit&&me.country==='Canada')||(edit&&l.country==='Canada')?'selected':''}>Canada</option></select></div>
        <div class="form-group"><label class="form-label">City</label><input class="form-input" id="fCity" value="${edit?esc(l.city):(me.city||'')}" placeholder="e.g. Toronto"></div>
      </div>
      <div class="form-group" id="fRegionWrap"></div>
      <div class="form-group"><label class="form-label">Made in</label><input class="form-input" id="fMade" value="${edit?esc(l.made_in):'Canada'}" placeholder="e.g. Ontario, Canada"></div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="fDesc" placeholder="Condition, origin, hardware included...">${edit?esc(l.description):''}</textarea></div>
      <div class="form-group"><label class="form-label">Photo (jpg / png / webp, max 5MB)</label><input class="form-input" id="fImg" type="file" accept="image/jpeg,image/png,image/webp"></div>
      <button class="submit-btn" id="fGo">${edit?'Save changes':'Publish listing'}</button>
    </div>`);
  const regionWrap = () => {
    const isCA = document.getElementById('fCountry').value === 'Canada';
    document.getElementById('curTag').textContent = isCA ? '(CAD — buyers see USD)' : '(USD)';
    document.getElementById('convNote').textContent = isCA ? 'US buyers will see the USD equivalent automatically.' : '';
    document.getElementById('fRegionWrap').innerHTML = `<label class="form-label">${isCA?'Province':'State'}</label><select class="form-select" id="fRegion">${(isCA?CA_PROV:US_STATES).map(r=>`<option ${edit&&l.region===r?'selected':''}>${r}</option>`).join('')}</select>`;
  };
  regionWrap();
  document.getElementById('fCountry').onchange = regionWrap;
  document.getElementById('fGo').onclick = async () => {
    const title = val('fTitle'), price = parseFloat(val('fPrice'));
    document.getElementById('eTitle').style.display = title ? 'none':'block';
    document.getElementById('ePrice').style.display = (price>0) ? 'none':'block';
    if (!title || !(price>0)) return;
    const fd = new FormData();
    const fieldMap = { fTitle:'title', fCat:'category', fCond:'condition', fPrice:'price', fFit:'fitment', fCountry:'country', fCity:'city', fRegion:'region', fMade:'made_in', fDesc:'description' };
    Object.entries(fieldMap).forEach(([id, key]) => fd.append(key, val(id)));
    const img = document.getElementById('fImg').files[0];
    if (img) fd.append('image', img);
    try {
      await api('/api/listings' + (edit ? '/' + l.id : ''), { method: edit ? 'PUT' : 'POST', body: fd });
      closeModal(); toast(edit ? 'Listing updated' : 'Your part is live across North America!'); load();
    } catch (e) { toast(e.message); }
  };
}

/* ---------------- orders & payouts ---------------- */
async function openOrders() {
  if (!me) return openAuth('login');
  const { orders } = await api('/api/orders');
  openModal(`
    <div class="modal-header"><div class="modal-title">Orders</div><button class="modal-close">×</button></div>
    <div class="modal-body">
      ${orders.length ? orders.map(o => `
        <div class="msg-row">
          <div class="msg-head"><span><b>${o.buyer_id === me.id ? 'Purchase' : 'Sale'}</b> · ${esc(o.title || 'listing removed')}</span><span>$${o.amount_usd.toFixed(2)}</span></div>
          <div class="msg-body" style="font-size:12px;color:var(--text-3)">${esc(o.status)} · ${o.ago}${o.seller_id === me.id ? ` · platform fee $${o.fee_usd.toFixed(2)}` : ''}</div>
        </div>`).join('')
      : '<div class="empty-state" style="padding:30px">No orders yet. Buy a part or wait for a buyer.</div>'}
    </div>`);
}

async function updatePayoutBanner() {
  const el = document.getElementById('payoutBanner');
  if (!el) return;
  if (state.view !== 'mine' || !me) { el.innerHTML = ''; return; }
  try {
    const s = await api('/api/payments/status');
    if (!s.configured) {
      el.innerHTML = `<div class="border-panel" style="margin:0 0 14px"><b>Payouts not configured.</b> Add <code>STRIPE_SECRET_KEY</code> to accept live payments. Platform fee: ${s.feePct}%. <button class="mini-btn" id="connectBtn">Set up payouts</button></div>`;
    } else if (s.charges_enabled) {
      el.innerHTML = `<div class="border-panel" style="margin:0 0 14px;border-color:rgba(26,158,80,0.5)"><b style="color:var(--positive)">Payouts active</b> — buyers can pay you directly by card. The ${s.feePct}% platform fee is deducted per sale.</div>`;
    } else {
      el.innerHTML = `<div class="border-panel" style="margin:0 0 14px"><b>Payouts not set up yet.</b> Connect Stripe to get paid. <button class="mini-btn" id="connectBtn">Set up payouts</button></div>`;
    }
    const cb = document.getElementById('connectBtn');
    if (cb) cb.onclick = async () => {
      const r = await api('/api/payments/connect', { method:'POST' });
      if (r.demo) toast('Add STRIPE_SECRET_KEY to the server first');
      else window.location.href = r.url;
    };
  } catch (e) { el.innerHTML = ''; }
}

/* ---------------- boot ---------------- */
document.getElementById('searchInput').oninput = e => { state.q = e.target.value; state.view='marketplace'; state.showSaved=false; load(); };
document.getElementById('sortSelect').onchange = e => { state.sort = e.target.value; load(); };
document.getElementById('logoHome').onclick = () => { state.view='marketplace'; state.showSaved=false; state.cat='All'; state.q=''; state.conds.clear(); state.country=''; document.getElementById('searchInput').value=''; load(); };

async function boot() {
  const qs = new URLSearchParams(location.search);
  ({ user: me } = await api('/api/me').catch(() => ({ user: null })));
  if (qs.get('purchased')) toast('Payment received — the seller has been notified');
  if (qs.get('connect') === 'done') { toast('Payout setup complete'); refreshInbox(); }
  if (qs.has('purchased') || qs.has('connect')) history.replaceState(null, '', '/');
  await refreshInbox();
  renderHeader();
  load();
}
boot();
