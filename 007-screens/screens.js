// 多页原型 · 底栏引擎 + 页面切换 + 验证码页 + 全局搜索筛选
const W_SEL = 1.4, W_OTHER = 0.9, W_GAP = 2.1;   /* 中间留白加大：左右 tab 图标不贴 + 号 */
const BAR_H = 69, PILL_H = 34;   /* 微椭圆胶囊（非圆形），BAR_H 对齐新 tab 栏高度 69 */

// TABS: 0=密码库 1=验证码 2=⊕ 3=标签 4=设置（图标 = 桌面版同款 lucide）
const TABS = [
  { t: '密码库', ic: icon('lock', { w: 18 }) },
  { t: '验证码', ic: icon('timer', { w: 18 }) },
  null,
  { t: '标签', ic: icon('tag', { w: 18 }) },
  { t: '设置', ic: icon('settings-2', { w: 18 }) },
];

const PAGE_OF = { 0: 'page-vault', 1: 'page-totp', 3: 'page-tags', 4: 'page-settings' };

const tabbar = document.getElementById('tabbar');
let selected = 0;

// ===== 全局筛选状态（单次搜索，不显示、不留痕） =====
let query = '';
// ===== 标签系统（「全部」「收藏」固定不可删改；其余可在标签页增删改 + 选图标） =====
const TAG_ICON_CHOICES = [
  'briefcase', 'gamepad-2', 'shopping-bag', 'music', 'video', 'book',
  'plane', 'heart', 'home', 'wrench', 'camera', 'code',
  'mail', 'phone', 'users', 'coffee', 'dumbbell', 'graduation-cap',
  'wallet', 'key', 'headphones', 'tv', 'car', 'trophy',
];
// 颜色表（iOS 系统色 12 色）—— 新建/编辑标签时自选
const TAG_COLOR_CHOICES = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#30B0C7',
  '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#A2845E', '#8E8E93',
];
const TAG_COLORS = ['#FB7299', '#3D9BFF', '#30D158', '#BF5AF2', '#FF9F0A', '#64D2FF', '#FFD60A'];   // 旧数据回退用

let TAGS = [
  { id: 'all', name: '全部', icon: '', fixed: true },
  { id: 'fav', name: '收藏', icon: '', fixed: true },
  { id: 't1', name: '娱乐', icon: 'film', color: '#FF2D55' },
  { id: 't2', name: '工作', icon: 'briefcase', color: '#007AFF' },
  { id: 't3', name: '游戏', icon: 'gamepad-2', color: '#5856D6' },
];
// 演示标签版本：改了默认标签就 +1 → 浏览器里的旧演示标签会被重置（避免残留测试标签）
const TAGS_VER = 2;
let activeTagId = 'all';

// 标签颜色：优先自定义色，否则按索引回退（兼容旧数据）
function tagColor(t) {
  if (t && t.color) return t.color;
  const i = TAGS.indexOf(t);
  return TAG_COLORS[(i < 0 ? 0 : i) % TAG_COLORS.length];
}

function saveTags() { try { localStorage.setItem('fvTags', JSON.stringify(TAGS)); } catch (e) {} }
function loadTags() {
  try {
    if (localStorage.getItem('fvTagsVer') !== String(TAGS_VER)) {   // 版本不符 → 丢掉旧演示标签（含测试标签）
      localStorage.setItem('fvTagsVer', String(TAGS_VER));
      localStorage.removeItem('fvTags');
      return;
    }
    const s = JSON.parse(localStorage.getItem('fvTags') || 'null');
    if (Array.isArray(s) && s.length >= 2 && s[0].id === 'all' && s[1].id === 'fav') {
      // 过滤：空名 / 无效标签 / 历史遗留的空标签（名字为 "00" 的那一个，一次性清理）
      TAGS = s.filter((t, i) => {
        if (i < 2) return true;                                   // 全部 / 收藏 固定保留
        if (!t || !t.id) return false;
        const n = String(t.name || '').trim();
        if (!n) return false;
        if (n === '00') return false;                             // 一次性清理遗留空标签
        return true;
      });
      if (TAGS.length !== s.length) saveTags();
    }
  } catch (e) {}
}
function tagById(id) { return TAGS.find(t => t.id === id) || TAGS[0]; }
function newTagId() { return 't' + Date.now().toString(36); }
// 当前标签是否命中某账号
function tagMatch(c) {
  const t = tagById(activeTagId);
  if (t.id === 'all') return true;
  if (t.id === 'fav') return !!c.fav;
  return c.cat === t.name;
}

function matchText(s) {
  if (!query) return true;
  return (s || '').toLowerCase().includes(query.toLowerCase());
}

// ---- 底栏构建 ----
function build() {
  let html = '<div class="tb-row">';
  TABS.forEach((t, i) => {
    if (t === null) {
      html += `<div class="tb-gap" data-i="${i}" style="flex-grow:${W_GAP}"></div>`;
    } else {
      const on = i === selected ? ' on' : '';
      html += `<div class="tb-slot${on}" data-i="${i}" style="flex-grow:${i === selected ? W_SEL : W_OTHER}">
        <div class="ic">${t.ic}</div>
        <div class="lb"><span>${t.t}</span></div></div>`;
    }
  });
  html += '</div>';
  html += `<div class="tb-pill" id="pill"><div class="disp"></div></div>`;
  tabbar.innerHTML = html;

  document.querySelectorAll('#tabbar .tb-slot').forEach(s => {
    s.onclick = () => setSelected(parseInt(s.dataset.i));
  });
}

const slotIndexOf = (tabIdx) => tabIdx < 2 ? tabIdx : tabIdx - 1;

function setSelected(i) {
  if (i === selected) return;
  selected = i;
  document.querySelectorAll('#tabbar .tb-slot').forEach((s) => {
    const tabIdx = parseInt(s.dataset.i);
    const on = tabIdx === i;
    s.classList.toggle('on', on);
    s.style.setProperty('flex-grow', String(on ? W_SEL : W_OTHER));
  });
  switchPage(PAGE_OF[i]);
}

function switchPage(pageId) {
  if (!pageId) return;
  const fo = document.getElementById('fabOuter');
  if (fo && fo.classList.contains('open')) {
    fo.classList.remove('open');
    const fb = document.getElementById('fabBtn');
    if (fb) fb.classList.remove('open');
  }
  // 用户要求：切换页面即清空搜索（不留痕）
  if (query) { query = ''; applyFilters(); }
  document.querySelectorAll('.content').forEach(p => {
    p.classList.toggle('active', p.id === pageId);
  });
  // 用户要求：切换页面后顶部标签恢复「全部」（进入密码库/验证码页永远是干净状态）
  if (pageId === PAGE_OF[0] || pageId === PAGE_OF[1]) resetChips();
}

// 顶部标签恢复「全部」（两组 chips 一起重置）
function resetChips() {
  if (activeTagId === 'all') return;   // 已经是全部 → 无需重渲染
  activeTagId = 'all';
  document.querySelectorAll('.chips .chip').forEach(el => el.classList.toggle('on', el.dataset.t === 'all'));
  renderCards();
  renderTOTP();
}

// ===== 水滴胶囊引擎（比例速度追踪 + 椭圆形变 + 路过点亮） =====
let pillX = null, pillW = 0, pillVel = 0;

function engine() {
  const pill = document.getElementById('pill');
  if (!pill) return;

  // 槽位位置缓存：只读布局 → 每 100ms 刷新一次（之前每帧 6 次 getBoundingClientRect，真机上 layout 抖动=动画看着慢/卡）
  let slotCache = [], slotCacheT = 0;
  const BASE_W = 44, BASE_H = PILL_H;
  const readSlots = () => {
    const barRect = tabbar.getBoundingClientRect();
    const els = [...document.querySelectorAll('#tabbar .tb-slot')];
    slotCache = els.map((s, i) => {
      const r = s.getBoundingClientRect();
      return { cx: r.left - barRect.left + r.width / 2, w: r.width, el: els[i] };
    });
    slotCacheT = performance.now();
  };
  readSlots();

  const step = () => {
    if (performance.now() - slotCacheT > 60) readSlots();   // 槽位缓存 60ms 刷新，追 flex 动画更快
    const target = slotCache[slotIndexOf(selected)];
    if (target) {
      const targetW = Math.max(Math.min(target.w * 0.85, 54), 34);
      const targetX = target.cx;
      if (pillX === null) { pillX = targetX; pillW = targetW; }

      const dist = targetX - pillX;
      // 速度：上限 16px/帧；加速 .5 → 跟手且平滑
      const vTarget = dist > 0 ? Math.min(dist * 0.72, 32) : Math.max(dist * 0.72, -32);
      pillVel += (vTarget - pillVel) * 0.72;
      pillX += pillVel;
      pillW += (targetW - pillW) * 0.2;

      // 无水滴变形：固定尺寸，只水平滑动（简洁的选中态，不再奇怪）
      const w = BASE_W, h = BASE_H;
      const cx = pillX - w / 2;
      const cy = (BAR_H - h) / 2;

      pill.style.transform = `translate3d(${cx}px, ${cy}px, 0) scale(1, 1)`;

      for (const sl of slotCache) {
        const d = Math.abs(pillX - sl.cx);
        const reach = Math.max(sl.w * 0.80, 46);
        const lit = Math.pow(Math.max(0, 1 - d / reach), 1.5);
        if (sl.el) sl.el.style.setProperty('--lit', lit.toFixed(3));
      }
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ===== 密码库页 =====
const CARDS = [
  { t: '哔哩哔哩', s: 'bili_233 · bilibili.com', c: '#FB7299', totp: 't0', user: 'bili_233', pass: 'Bili@2026#x8f', site: 'bilibili.com', cat: '娱乐', note: '大会员账号，2027-03 到期', fav: true, tags: ['常用', '游戏'] },
  { t: 'Github', s: 'Lucky · github.com', c: '#24292F', totp: 't1', user: 'Lucky', pass: 'gh_#Lucky9921', site: 'github.com', cat: '工作', note: '主账号 · 已开启 2FA', fav: true, tags: ['常用', '重要'] },
  { t: 'Steam', s: 'Lsjputi36FpJ · store.steampowered.com', c: '#2A6DA5', totp: 't2', user: 'Lsjputi36FpJ', pass: 'Steam!vault77', site: 'store.steampowered.com', cat: '游戏', note: '', fav: false, tags: ['游戏'] },
];
// 密码库卡片所用的小圆环（r=9.5）
const MR = 9.5, MCIRC = 2 * Math.PI * MR;

// 把选中的 chip 平滑滚到可视区中间 —— 只滚动 chips 容器自身，绝不带动整页
function scrollChipToCenter(chip) {
  const box = chip.closest('.chips');
  if (!box) return;
  const target = chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2;
  box.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
}

// 同步 chips 两端模糊遮罩（滚到最左 → 左侧遮罩隐；滚到最右 → 右侧遮罩隐）
function syncChipEdges() {
  document.querySelectorAll('.chips').forEach(box => {
    const rail = box.parentElement;
    if (!rail || !rail.classList.contains('chips-rail')) return;
    const max = box.scrollWidth - box.clientWidth;
    rail.classList.toggle('edge-l', box.scrollLeft > 4);
    rail.classList.toggle('edge-r', box.scrollLeft < max - 4);
  });
}

// 标签栏滑动 —— 重做版（极简、零状态残留）
// 设计原则：
//   ① `dragging` 类只影响光标与 scroll-behavior，**绝不碰 pointer-events**（旧版就是死在这）
//   ② 点击判定纯用坐标比较（click 时的 clientX vs 按下的位置），**不设任何会残留的标志位**
//   ③ `e.buttons === 0` 直接返回 —— 没按着就不管（松手丢失事件也天然无害）
function chipsDragBind() {
  document.querySelectorAll('.chips').forEach(box => {
    box.addEventListener('scroll', syncChipEdges, { passive: true });
    let downX = 0, startScroll = 0, drag = false;
    let lastX = 0, lastT = 0, vx = 0, raf = null;

    box.addEventListener('pointerdown', e => {
          if (e.target.closest('.swipe-wrap') || e.target.closest('.card')) { downX = null; return; }  // 卡片区左滑归卡片，标签不抢
          if (raf) { cancelAnimationFrame(raf); raf = null; }   // 再次按住 → 停下惯性
          downX = lastX = e.clientX;
          startScroll = box.scrollLeft;
          lastT = performance.now(); vx = 0; drag = false;
        });

        window.addEventListener('pointermove', e => {
          if (downX === null) return;              // 本次按下在卡片区 → 不参与标签拖动
          if (e.buttons === 0) return;                 // 没按着（含"松手事件丢失"）→ 什么都不做
      const dx = e.clientX - downX;
      if (!drag) {
        if (Math.abs(dx) < 8) return;              // 阈值内 → 还不算拖动（鼠标点击手抖几像素是常态）
        drag = true;
        box.classList.add('dragging');
      }
      const now = performance.now(), dt = now - lastT;
      if (dt > 0) vx = vx * 0.7 + ((e.clientX - lastX) / dt) * 0.3;   // 平滑速度（抗抖）
      lastX = e.clientX; lastT = now;
      box.scrollLeft = startScroll - dx;           // 拖多少滑多少
    });

    window.addEventListener('pointerup', () => {
      box.classList.remove('dragging');
      if (!drag) return;
      drag = false;
      let v = -vx * 14;                            // ---- 惯性甩动：松手后按速度继续滑 ----
      if (Math.abs(v) < 1.2) return;
      const glide = () => {
        const before = box.scrollLeft;
        box.scrollLeft += v;
        v *= 0.94;                                 // 每帧衰减 6%
        if (box.scrollLeft === before || Math.abs(v) <= 0.4) { raf = null; return; }   // 顶到边界/速度耗尽 → 停
        raf = requestAnimationFrame(glide);
      };
      raf = requestAnimationFrame(glide);
    });

    // 拖过 8px 就不当点击（纯坐标判定，不改任何状态）
    box.addEventListener('click', e => {
      if (Math.abs(e.clientX - downX) > 8) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  });
}

// 标签 chips（密码库 + 验证码页共用；点选时只切 class 不重建，保证动画流畅）
function renderChips() {
  // 两组 chips 各自渲染（onclick 带上所属页面，点击时只高亮本组）
  ['vaultChips', 'totpChips'].forEach(boxId => {
    const box = document.getElementById(boxId);
    if (!box) return;
    const isTotp = boxId === 'totpChips';
    box.innerHTML = TAGS.map(t => {
      const on = t.id === activeTagId ? ' on' : '';
      const ic = t.icon ? `<span class="chip-ic" style="--tc:${tagColor(t)}">${icon(t.icon, { w: 13 })}</span>` : '';
      return `<button class="chip${on}" data-t="${t.id}" onclick="setChip('${t.id}'${isTotp ? ',true' : ''})">${ic}<span>${t.name}</span></button>`;
    }).join('');
  });
  syncChipEdges();   // 渲染后刷新两端模糊遮罩
}

// 切换标签：只作用于「点击的那一组 chips」（密码库 / 验证码 各自独立高亮，互不干扰）
function setChip(id, fromTotp) {
  activeTagId = id;
  const box = document.getElementById(fromTotp ? 'totpChips' : 'vaultChips');
  if (box) {
    box.querySelectorAll('.chip').forEach(el => el.classList.toggle('on', el.dataset.t === id));
    const hit = box.querySelector('.chip[data-t="' + id + '"]');
    if (hit) {
      hit.classList.remove('pop');
      void hit.offsetWidth;          // 强制重排以重启动画
      hit.classList.add('pop');
      scrollChipToCenter(hit);       // 滑块：只滚 chips 自身，不带动整页
    }
  }
  renderCards(true);
  renderTOTP();
}

function renderCards(animate) {
  const box = document.getElementById('list');
  const items = CARDS.filter(c => tagMatch(c) && matchText(c.t + ' ' + c.s))
    .sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0));  // 收藏置顶（对标桌面版）

  // FLIP ①：记录旧卡片纵向位置（按账号名作 key）
  const oldTop = {};
  if (animate) {
    box.querySelectorAll('.card').forEach(el => {
      if (el.dataset.t) oldTop[el.dataset.t] = el.getBoundingClientRect().top;
    });
  }

  if (!items.length) {
    box.innerHTML = '<div class="empty">没有匹配的账号</div>';
    if (animate) box.querySelector('.empty').classList.add('enter');
    return;
  }

  box.innerHTML = items.map((c, i) => {
    // 验证码：接入实时 TOTP 引擎（同账号 = 同码同相位，与验证码页同步）
    const ti = c.totp ? TOTP_ITEMS.find(x => x.key === c.totp) : null;
    if (ti && !ti.code) ti.code = randCode();
    const totp = ti ? `<div class="mtotp">
        <code class="mcode" id="mcode-${ti.key}">${ti.code}</code>
        <svg class="mring" id="mring-${ti.key}" width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(-90deg)">
          <circle cx="12" cy="12" r="${MR}" fill="none" stroke="rgba(100,210,255,.18)" stroke-width="3"/>
          <circle class="mbar" cx="12" cy="12" r="${MR}" fill="none" stroke="#64D2FF" stroke-width="3" stroke-linecap="round"
            stroke-dasharray="${MCIRC}" stroke-dashoffset="0"/>
        </svg></div>` : '';
    const star = c.fav ? icon('star', { w: 13, cls: 'fstar' }) : '';
    const ico = c.icon
      ? `<div class="ico" style="background:rgba(255,255,255,.12)"><img src="${c.icon}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>`
      : `<div class="ico" style="background:${c.c}">${c.t[0]}</div>`;
    const ci = CARDS.indexOf(c);
    return `<div class="swipe-wrap">
      <div class="swipe-actions">
        <button class="sw-btn sw-del" onclick="swipeAct(event,${ci},'del')" title="删除">${icon('trash-2', { w: 17 })}</button>
        <button class="sw-btn sw-fav" onclick="swipeAct(event,${ci},'fav')" title="${c.fav ? '取消收藏' : '收藏'}">${icon('star', { w: 17 })}</button>
        <button class="sw-btn sw-edit" onclick="swipeAct(event,${ci},'edit')" title="编辑">${icon('pencil', { w: 17 })}</button>
      </div>
      <div class="card" data-t="${c.t}" onclick="openDetail('${c.t}')">
        ${ico}
        <div class="meta"><div class="t">${c.t}</div><div class="s">${c.s}</div></div>
        ${totp}
        ${star}
        <svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>`;
  }).join('');

  // FLIP ②：留存的卡片平滑滑到新位置；新出现的卡片交错入场
  if (animate) {
    box.querySelectorAll('.card').forEach((el, i) => {
      const prev = oldTop[el.dataset.t];
      if (prev != null) {
        const dy = prev - el.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) {
          el.style.transition = 'none';
          el.style.transform = 'translateY(' + dy + 'px)';
          requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.transition = 'transform .4s cubic-bezier(.22,1,.36,1)';
            el.style.transform = '';
            setTimeout(() => { el.style.transition = ''; }, 440);
          }));
        }
      } else {
        el.classList.add('enter');
        el.style.animationDelay = (i * 0.045) + 's';
      }
    });
  }
}

// ===== 卡片左滑（全局委托：一个处理器管所有卡片，重建 DOM 也不需要重新绑定） =====
const SW_W = 146;   // 按钮区总宽（3×42 + 间距）

let swSt = null;        // 当前滑动状态
let swJustMoved = false; // 抑制拖动后的误点击

// 每个按钮「刚开始露出」的宽度（DOM 顺序：删除 / 收藏 / 编辑）
// 布局：padding-right 6 → 编辑(6~48) → gap → 收藏(55~97) → gap → 删除(104~146)
// 只要开始露出一点点就触发弹动（不等完整露出）
const SW_NEED = [105, 56, 7];

// 按当前露出宽度，给"刚开始露出"的按钮触发弹入动画
function syncBtnPop(actions, revealW) {
  if (!actions) return;
  actions.querySelectorAll('.sw-btn').forEach((btn, i) => {
    const need = SW_NEED[i] !== undefined ? SW_NEED[i] : 105;
    if (revealW >= need && btn.dataset.shown !== '1') {
      btn.dataset.shown = '1';
      btn.classList.remove('pop');
      void btn.offsetWidth;          // 重排以重启动画
      btn.classList.add('pop');
    } else if (btn.dataset.shown === '1' && revealW < need - 4) {
      btn.dataset.shown = '';        // 收回一点后可再次弹（4px 滞回防抖动）
      btn.classList.remove('pop');
    }
  });
}

function swipeReset(wrap) {
  if (!wrap) return;                      // 防护：列表被筛选清空时可能拿到 undefined
  const card = wrap.querySelector('.card');
  const actions = wrap.querySelector('.swipe-actions');
  if (!card) return;
  card.style.transition = 'transform .44s cubic-bezier(.22,1.28,.36,1), border-radius .44s ease, box-shadow .44s ease';
  card.style.transform = '';
  card.style.borderRadius = '';
  card.style.boxShadow = '';
  wrap.style.borderRadius = '';
  if (actions) {
    actions.querySelectorAll('.sw-btn').forEach(b => { b.dataset.shown = ''; b.classList.remove('pop'); });
    actions.style.transition = 'width .44s cubic-bezier(.22,1.28,.36,1)';
    actions.style.width = '0px';
  }
  wrap.classList.remove('sw-open');
}

function closeOtherSwipe(except) {
  document.querySelectorAll('#list .swipe-wrap.sw-open').forEach(w => {
    if (w === except) return;
    swipeReset(w);
  });
}

function swipeFinish() {
  const st = swSt;
  if (!st) return;
  swSt = null;
  // 速度感知：快速左滑（甩动）+ 已滑出一定距离 → 即使没过半也展开
  const flung = st.vx < -0.5 && Math.abs(st.dx) >= 45;
  const shouldOpen = flung || Math.abs(st.dx) >= st.cardW * 0.5;
  const spring = 'cubic-bezier(.22,1.28,.36,1)';   // 轻微过冲 → 弹簧感
  st.card.style.transition = 'transform .44s ' + spring + ', border-radius .44s ease, box-shadow .44s ease';
  if (st.actions) st.actions.style.transition = 'width .44s ' + spring;
  if (shouldOpen) {
    st.card.style.transform = 'translateX(-' + SW_W + 'px) scale(.985)';
    st.card.style.borderRadius = '20px';
    st.card.style.boxShadow = '0 12px 30px rgba(0,0,0,.42)';
    st.wrap.style.borderRadius = '20px';
    if (st.actions) st.actions.style.width = SW_W + 'px';
    st.wrap.classList.add('sw-open');
    syncBtnPop(st.actions, SW_W);   // 补弹（快速甩动时没来得及逐个露出的按钮）
    closeOtherSwipe(st.wrap);
  } else {
    st.card.style.transform = '';        // 不到一半且没甩动 → 弹性回弹
    st.card.style.borderRadius = '';
    st.card.style.boxShadow = '';
    st.wrap.style.borderRadius = '';
    if (st.actions) st.actions.style.width = '0px';
    st.wrap.classList.remove('sw-open');
  }
  if (st.moved) {
    swJustMoved = true;
    setTimeout(() => { swJustMoved = false; }, 60);
  }
}

function swipeBind() {
  const list = document.getElementById('list');
  if (!list || list.dataset.swBound) return;
  list.dataset.swBound = '1';

  // 按下：识别是哪张卡片（动态生成的卡片也有效）
  list.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const wrap = e.target.closest('.swipe-wrap');
    if (!wrap) return;
    if (e.target.closest('.sw-btn')) return;      // 按钮交给自己的 onclick
    const card = wrap.querySelector('.card');
    const actions = wrap.querySelector('.swipe-actions');
    const isOpen = wrap.classList.contains('sw-open');
    const cardW = card.offsetWidth || 300;
    swSt = {
      wrap, card, actions, cardW,
      sx: e.clientX, sy: e.clientY,
      base: isOpen ? -SW_W : 0,
      dx: isOpen ? -SW_W : 0,
      limit: Math.max(SW_W + 30, cardW * 0.6),
      moved: false,
      vx: 0, lastX: e.clientX, lastT: performance.now(),
    };
    card.style.transition = 'none';
    if (actions) actions.style.transition = 'none';
  });

  // 移动：全局监听（不依赖 pointer capture，多张卡片互不干扰）
  document.addEventListener('pointermove', (e) => {
    if (!swSt) return;
    const mx = e.clientX - swSt.sx, my = e.clientY - swSt.sy;
    // 纵向明显为主 → 放弃本次横向手势，让列表正常滚动
    if (!swSt.moved && Math.abs(my) > Math.abs(mx) + 8 && Math.abs(my) > 12) {
      swipeReset(swSt.wrap);
      swSt = null;
      return;
    }
    // 速度追踪（px/ms，负值 = 向左甩）
    const now = performance.now();
    const dt = Math.max(1, now - swSt.lastT);
    swSt.vx = (e.clientX - swSt.lastX) / dt;
    swSt.lastX = e.clientX; swSt.lastT = now;

    if (Math.abs(mx) > 5) swSt.moved = true;
    swSt.dx = Math.max(-swSt.limit, Math.min(0, swSt.base + mx));

    // 卡片形态随进度变化：轻微缩小 + 圆角张开 + 浮起阴影
    const p = Math.min(1, Math.abs(swSt.dx) / SW_W);
    swSt.card.style.transform = 'translateX(' + swSt.dx + 'px) scale(' + (1 - p * 0.015).toFixed(4) + ')';
    swSt.card.style.borderRadius = (16 + p * 5).toFixed(1) + 'px';
    swSt.wrap.style.borderRadius = (16 + p * 5).toFixed(1) + 'px';
    swSt.card.style.boxShadow = p > 0.04
      ? '0 ' + (3 + p * 10).toFixed(1) + 'px ' + (10 + p * 18).toFixed(0) + 'px rgba(0,0,0,' + (0.15 + p * 0.25).toFixed(2) + ')'
      : '';
    // 按钮层裁切：卡片让出多少就显示多少（玻璃下永不透色）+ 完整露出一个就弹一次
    if (swSt.actions) {
      const revealW = Math.min(Math.abs(swSt.dx), SW_W);
      swSt.actions.style.width = revealW + 'px';
      syncBtnPop(swSt.actions, revealW);
    }
  });

  document.addEventListener('pointerup', () => { if (swSt) swipeFinish(); });
  document.addEventListener('pointercancel', () => { if (swSt) swipeFinish(); });

  // 点击：拖动后抑制误触；已展开时点卡片 = 收起
  list.addEventListener('click', (e) => {
    const wrap = e.target.closest('.swipe-wrap');
    if (!wrap) return;
    if (e.target.closest('.sw-btn')) return;
    if (swJustMoved) { e.stopPropagation(); e.preventDefault(); return; }
    if (wrap.classList.contains('sw-open')) {
      e.stopPropagation(); e.preventDefault();
      swipeReset(wrap);
    }
  }, true);
}

// 滑动按钮动作
function swipeAct(e, idx, act) {
  if (e) e.stopPropagation();
  const c = CARDS[idx];
  if (!c) return;
  if (act === 'del') {
    const name = c.t;
    CARDS.splice(idx, 1);
    const ti = (typeof TOTP_ITEMS !== 'undefined') ? TOTP_ITEMS.findIndex(x => x.t === name) : -1;
    if (ti >= 0) TOTP_ITEMS.splice(ti, 1);
    renderChips(); renderCards(); renderTags();
    if (typeof renderTOTP === 'function') renderTOTP();
    showToast('已删除「' + name + '」');
  } else if (act === 'fav') {
    c.fav = !c.fav;
    renderCards();
    showToast(c.fav ? '已收藏「' + c.t + '」' : '已取消收藏「' + c.t + '」');
  } else if (act === 'edit') {
    openEditor(idx);
  }
}

// ===== 验证码页（实时倒计时 + 可筛选） =====
const TOTP_ITEMS = [
  { key: 't0', t: '哔哩哔哩', s: 'bili_233', c: '#FB7299', cat: '娱乐', fav: true, offset: 0, code: '', lastCycle: -1 },
  { key: 't1', t: 'Github', s: 'Lucky', c: '#24292F', cat: '工作', fav: true, offset: 7, code: '', lastCycle: -1 },
  { key: 't2', t: 'Steam', s: 'Lsjputi36FpJ', c: '#2A6DA5', cat: '游戏', fav: false, offset: 14, code: '', lastCycle: -1 },
];
const PERIOD = 30;
let totpOffset = 0;   // TOTP 时间偏移校正（秒），设置 → 高级里调整
const R = 11.5, CIRC = 2 * Math.PI * R;

function randCode() {
  const n = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return n.slice(0, 3) + ' ' + n.slice(3);
}

function renderTOTP() {
  const tag = tagById(activeTagId);
  const items = TOTP_ITEMS.filter(it => {
    if (tag.id === 'fav') return !!it.fav;
    if (tag.id === 'all') return true;
    return it.cat === tag.name;
  }).filter(it => matchText(it.t + ' ' + it.s));
  const box = document.getElementById('totpList');
  if (!items.length) { box.innerHTML = '<div class="empty">没有匹配的验证码</div>'; return; }
  box.innerHTML = items.map(it => {
    if (!it.code) it.code = randCode();
    return `<div class="totp-card" data-key="${it.key}">
      <div class="ico" style="background:${it.c}">${it.t[0]}</div>
      <div class="meta"><div class="t">${it.t}</div><div class="s">${it.s}</div></div>
      <div class="code" id="code-${it.key}">${it.code}</div>
      <div class="ring" id="ring-${it.key}">
        <svg width="30" height="30" viewBox="0 0 30 30">
          <circle class="track" cx="15" cy="15" r="${R}"/>
          <circle class="bar" cx="15" cy="15" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/>
        </svg>
        <div class="sec" id="sec-${it.key}">30</div>
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('.totp-card').forEach(card => {
    card.onclick = () => {
      const it = TOTP_ITEMS.find(x => x.key === card.dataset.key);
      if (it) copyToast(it.t, it.code || randCode());
    };
  });
}

function tickTOTP() {
  const now = Date.now() / 1000 + totpOffset;   // totpOffset：设置里手动校正的时间偏移（秒）
  TOTP_ITEMS.forEach(it => {
    const phase = (now + it.offset) % PERIOD;
    const remain = PERIOD - phase;
    const cycle = Math.floor((now + it.offset) / PERIOD);
    const frac = remain / PERIOD;
    const expiring = remain <= 5;

    // 换新码：验证码页 + 密码库卡片 + 详情页 同步
    if (it.lastCycle !== cycle) {
      it.lastCycle = cycle;
      it.code = randCode();
      const ce = document.getElementById('code-' + it.key);
      if (ce) ce.textContent = it.code;
      const mce0 = document.getElementById('mcode-' + it.key);
      if (mce0) mce0.textContent = it.code;
    }

    // 验证码页：倒计时圆环 + 秒数
    const ring = document.getElementById('ring-' + it.key);
    if (ring) {
      ring.querySelector('.bar').setAttribute('stroke-dashoffset', String(CIRC * (1 - frac)));
      const sec = document.getElementById('sec-' + it.key);
      if (sec) sec.textContent = Math.ceil(remain);
      ring.classList.toggle('expiring', expiring);
      const ce = document.getElementById('code-' + it.key);
      if (ce) ce.classList.toggle('expiring', expiring);
    }

    // 密码库卡片：小圆环 + 到期变色（实时）
    const mring = document.getElementById('mring-' + it.key);
    if (mring) {
      mring.querySelector('.mbar').setAttribute('stroke-dashoffset', String(MCIRC * (1 - frac)));
      mring.classList.toggle('expiring', expiring);
      const mce = document.getElementById('mcode-' + it.key);
      if (mce) mce.classList.toggle('expiring', expiring);
    }

    // 详情页验证码：实时同步 + 到期变色 + 剩余秒数
    const dce = document.getElementById('dcode-' + it.key);
    if (dce) {
      if (dce.textContent !== it.code) dce.textContent = it.code;
      dce.style.color = expiring ? '#FF9F0A' : '#64D2FF';
    }
    const dsec = document.getElementById('dsec-' + it.key);
    if (dsec) dsec.textContent = Math.ceil(remain);
  });
  requestAnimationFrame(tickTOTP);
}

// ===== 标签页（数据同源：与密码库 chips 共用 TAGS） =====

function tagCount(t) {
  if (t.id === 'all') return CARDS.length;
  if (t.id === 'fav') return CARDS.filter(c => c.fav).length;
  return CARDS.filter(c => c.cat === t.name).length;
}

function renderTags() {
  const box = document.getElementById('tagList');
  const items = TAGS.filter(t => matchText(t.name));
  const cards = items.map(t => {
    const c = tagColor(t);
    const ic = t.icon ? icon(t.icon, { w: 17 }) : '';
    const lead = ic
      ? `<div class="tag-ic" style="color:${c}">${ic}</div>`
      : `<div class="dot" style="background:${c}"></div>`;
    const tail = t.fixed
      ? `<span class="tag-fixed">固定</span>`
      : `<button class="tag-edit" onclick="event.stopPropagation();openTagEditor('${t.id}')" aria-label="编辑标签">${icon('pencil', { w: 13 })}</button>`;
    return `
    <div class="tag-card" onclick="openTag('${t.id}')">
      ${lead}
      <div class="n">${t.name}</div>
      <div class="c">${tagCount(t)} 项</div>
      ${tail}
    </div>`;
  }).join('');
  box.innerHTML = cards;   // 新建入口已移到右上角 + 号
}

// 点标签 → 跳到密码库并自动选中该标签（只高亮密码库顶部那组，验证码页的不受影响）
function openTag(id) {
  if (selected !== 0) setSelected(0);   // 先回密码库（切页会先把标签重置为全部）
  query = '';                            // 清掉搜索
  activeTagId = id;
  const vc = document.getElementById('vaultChips');
  if (vc) {
    vc.querySelectorAll('.chip').forEach(el => el.classList.toggle('on', el.dataset.t === id));
    const hit = vc.querySelector('.chip[data-t="' + id + '"]');
    if (hit) {
      hit.classList.remove('pop'); void hit.offsetWidth; hit.classList.add('pop');
      scrollChipToCenter(hit);
    }
  }
  renderCards(true);   // 交错入场
  renderTOTP();
  renderTags();
}

// ===== 标签编辑（新建 / 改名 / 选图标 / 删除） =====
let editingTagId = null;   // null = 新建

function openTagEditor(id) {
  editingTagId = id || null;
  const t = id ? TAGS.find(x => x.id === id) : null;
  document.getElementById('tagEditorTitle').textContent = t ? '编辑标签' : '新建标签';
  document.getElementById('tagNameInput').value = t ? t.name : '';
  document.getElementById('tagDeleteWrap').style.display = t ? '' : 'none';
  renderIconGrid(t ? t.icon : '');
  renderColorGrid(t ? tagColor(t) : TAG_COLOR_CHOICES[6]);   // 新建时默认蓝色
  document.getElementById('tagEditor').classList.add('show');
  setTimeout(() => document.getElementById('tagNameInput').focus(), 350);
}

function renderIconGrid(sel) {
  const grid = document.getElementById('tagIconGrid');
  grid.innerHTML = TAG_ICON_CHOICES.map(n =>
    `<div class="icon-cell${n === sel ? ' sel' : ''}" data-ic="${n}" onclick="pickTagIcon('${n}')">${icon(n, { w: 20 })}</div>`
  ).join('');
}

function pickTagIcon(n) {
  document.querySelectorAll('#tagIconGrid .icon-cell').forEach(el => el.classList.toggle('sel', el.dataset.ic === n));
}

function selectedTagIcon() {
  const el = document.querySelector('#tagIconGrid .icon-cell.sel');
  return el ? el.dataset.ic : '';
}

// 颜色表（12 色）—— 图标与标签卡片都跟着这个颜色走
function renderColorGrid(sel) {
  const grid = document.getElementById('tagColorGrid');
  if (!grid) return;
  grid.innerHTML = TAG_COLOR_CHOICES.map(c =>
    `<div class="color-cell${c === sel ? ' sel' : ''}" data-color="${c}" style="--cc:${c}" onclick="pickTagColor('${c}')"><i></i></div>`
  ).join('');
}

function pickTagColor(c) {
  document.querySelectorAll('#tagColorGrid .color-cell').forEach(el => el.classList.toggle('sel', el.dataset.color === c));
}

function selectedTagColor() {
  const el = document.querySelector('#tagColorGrid .color-cell.sel');
  return el ? el.dataset.color : TAG_COLOR_CHOICES[6];
}

function saveTagEditor() {
  const name = document.getElementById('tagNameInput').value.trim();
  if (!name) { showToast('请输入标签名称'); return; }
  const dup = TAGS.find(t => t.name === name && t.id !== editingTagId);
  if (dup) { showToast('已存在同名标签'); return; }
  const ic = selectedTagIcon();
  const col = selectedTagColor();
  if (editingTagId) {
    const t = TAGS.find(x => x.id === editingTagId);
    const oldName = t.name;
    t.name = name; t.icon = ic; t.color = col;
    if (oldName !== name) {   // 改名 → 同步账号与验证码的分类
      CARDS.forEach(c => { if (c.cat === oldName) c.cat = name; });
      TOTP_ITEMS.forEach(it => { if (it.cat === oldName) it.cat = name; });
    }
    showToast('标签已更新');
  } else {
    TAGS.push({ id: newTagId(), name, icon: ic, color: col });
    showToast('已新建标签「' + name + '」');
  }
  saveTags();
  closeTagEditor();
  renderChips(); renderTags(); renderCards(); renderTOTP();
}

function deleteTag() {
  if (!editingTagId) return;
  const t = TAGS.find(x => x.id === editingTagId);
  if (!t || t.fixed) return;
  const n = t.name;
  TAGS = TAGS.filter(x => x.id !== editingTagId);
  CARDS.forEach(c => { if (c.cat === n) c.cat = ''; });        // 账号归入未分类
  TOTP_ITEMS.forEach(it => { if (it.cat === n) it.cat = ''; });
  if (activeTagId === editingTagId) activeTagId = 'all';
  saveTags();
  closeTagEditor();
  renderChips(); renderTags(); renderCards(); renderTOTP();
  showToast('已删除标签「' + n + '」');
}

function closeTagEditor() {
  document.getElementById('tagEditor').classList.remove('show');
  editingTagId = null;
}

// ===== 搜索 & 筛选 =====
function openSearch() {
  const ov = document.getElementById('searchOverlay');
  ov.classList.add('show');
  const inp = document.getElementById('searchInput');
  inp.value = '';
  setTimeout(() => inp.focus(), 70);
}

function closeSearch() {
  document.getElementById('searchOverlay').classList.remove('show');
}

function doSearch() {
  const inp = document.getElementById('searchInput');
  // 每次搜索直接替换当前筛选（空输入 = 清空筛选）
  query = inp.value.trim();
  closeSearch();
  renderCards(true);   // 结果刷新用交错入场
  renderTOTP();
  renderTags();
}

function applyFilters() {
  renderCards();
  renderTOTP();
  renderTags();
}

// ===== Toast =====
let toastTimer = null;
function copyToast(name, code) {
  const t = document.getElementById('toast');
  t.textContent = `已复制 ${code} · ${name}`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  if (navigator.clipboard) navigator.clipboard.writeText(String(code).replace(' ', '')).catch(() => {});
  // 剪贴板自动清理：30 秒后清空（与 extra.js copyVal 同一策略）
  clearTimeout(window.__clipTimer);
  window.__clipTimer = setTimeout(() => {
    if (navigator.clipboard) navigator.clipboard.writeText('').catch(() => {});
    t.textContent = '已自动清空剪贴板';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }, 30000);
}

// ---- 事件绑定 ----
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
  if (e.key === 'Escape') closeSearch();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSearch();
});

// ---- 启动 ----
build();
swipeBind();      // 左滑（全局委托，只需一次）
loadTags();       // 读取用户自定义标签（localStorage）
chipsDragBind();  // chips 鼠标拖拽滑动
renderChips();
renderCards();
renderTOTP();
renderTags();
tickTOTP();
engine();