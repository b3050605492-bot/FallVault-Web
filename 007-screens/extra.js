// 资源路径适配：桌面/bundle 用 ../（资源在 web 同级）；沙盒(云更新) 资源已随包下载到 007-screens 同级子目录
const IS_SANDBOX = /\/Documents\//.test(String(document.location.href));
const RES_BASE = IS_SANDBOX ? 'assets/' : '../assets/';
const RES_BZ = IS_SANDBOX ? 'bz/' : '../bz/';
// ===== 云更新（web 层热更新，无需重装 IPA）=====
// 版本对外恒定 v1（用户只看到 v1 = 最新）；更新判定用内部 rev：内置 FV_REV 与云端 manifest.rev 比较
const FV_LOCAL_VER = 1;    // 对外显示版本（恒 1，v1 永远是最新）
const FV_REV = 28;         // 内置资源 rev（发布脚本每次自动 +1 并回写此处）
// 更新通道：GitHub API 优先（实时无缓存，未认证 60 次/小时足够）→ 失败自动切 jsDelivr CDN（最长 12h 缓存兜底）
const FV_GH = 'https://api.github.com/repos/b3050605492-bot/FallVault-Web/contents/007-screens/';
const FV_CDN = 'https://cdn.jsdelivr.net/gh/b3050605492-bot/FallVault-Web@main/007-screens/';
function fvCurrentRev() { return Math.max(+ (localStorage.getItem('fvRev') || 0), FV_REV); }
function hasUpdateBridge() {
  return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.updateSave);
}
async function fvFetchText(file) {   // 文本（manifest 用）
  const u8 = await fvFetchBytes(file);
  return new TextDecoder('utf-8').decode(u8);
}
async function fvFetchBytes(file) {   // 二进制安全（图片/壁纸也走这里）
  try {
    const r1 = await fetch(FV_GH + file + '?ref=main', { headers: { 'Accept': 'application/vnd.github.raw+json' } });
    if (r1.ok) return new Uint8Array(await r1.arrayBuffer());
  } catch (e) {}
  const r2 = await fetch(FV_CDN + file + '?_=' + Date.now());
  if (r2.ok) return new Uint8Array(await r2.arrayBuffer());
  throw new Error('无法连接更新服务器');
}
function fvToB64(u8) {
  let bin = ''; const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  return btoa(bin);
}
let fvConfirmBox = null;
function fvConfirm(msg, onOk, onCancel) {
  if (fvConfirmBox) fvConfirmBox.remove();
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
  box.innerHTML = `<div style="width:78%;background:#1c1e28;border-radius:18px;padding:20px 18px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.08)">
    <div style="font-size:15px;font-weight:700;margin-bottom:8px">${msg}</div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button id="fvC1" style="flex:1;padding:11px 0;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;font-size:14px;border:0">取消</button>
      <button id="fvC2" style="flex:1;padding:11px 0;border-radius:12px;background:linear-gradient(135deg,#64D2FF,#0A84FF);color:#fff;font-size:14px;font-weight:700;border:0">确定</button>
    </div></div>`;
  document.body.appendChild(box);
  box.querySelector('#fvC1').onclick = () => { box.remove(); if (onCancel) onCancel(); };
  box.querySelector('#fvC2').onclick = () => { box.remove(); if (onOk) onOk(); };
  fvConfirmBox = box;
}
let fvUpdating = false;
async function checkForUpdate(silent) {
  if (fvUpdating) return;
  if (!hasUpdateBridge()) { if (!silent) showToast('云更新仅真机 App 可用'); return; }
  try {
    const m = JSON.parse(await fvFetchText('manifest.json'));
    if (!m || !m.rev) throw new Error('manifest 无效');
    if (m.rev <= fvCurrentRev()) { if (!silent) showToast('已是最新版本 v1'); return; }
    fvConfirm('发现新版本 v1' + (m.msg ? '<br><span style="font-size:12px;color:rgba(255,255,255,.55)">' + m.msg + '</span><br>' : '') + '<span style="font-size:11px;color:rgba(255,255,255,.4)">下载后重启 App 生效</span>', () => fvDoUpdate(m), null);
  } catch (e) {
    if (!silent) showToast('检查更新失败：' + e.message);
  }
}
async function fvDoUpdate(m) {
  fvUpdating = true;
  const files = Object.keys(m.files || {});
  if (!files.length) { showToast('更新包为空'); fvUpdating = false; return; }
  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      showToast('下载更新 ' + (i + 1) + '/' + files.length + '：' + f);
      const u8 = await fvFetchBytes(f);
      await fvSendFile(f, fvToB64(u8));
    }
    localStorage.setItem('fvRev', String(m.rev));
    showToast('已更新到最新版，请重启 App 生效');
  } catch (e) {
    showToast('更新失败：' + e.message + '（可重试或重启）');
  }
  fvUpdating = false;
}
function fvSendFile(f, b64) {
  return new Promise(res => {
    const timer = setTimeout(() => { window.__fvUpdateDone = null; res(); }, 15000);
    window.__fvUpdateDone = (name) => {
      if (name === f || String(name).indexOf('ERR') === 0) { clearTimeout(timer); window.__fvUpdateDone = null; res(); }
    };
    window.webkit.messageHandlers.updateSave.postMessage({ file: f, data: b64 });
  });
}
window.addEventListener('load', () => { setTimeout(() => { try { checkForUpdate(true); } catch (e) {} }, 2500); });
// 完整版附加逻辑：锁屏 / 账号详情 / 新建编辑 / 密码生成器 / 壁纸切换
// 依赖 screens.js 里的 CARDS、tabbar 等

// ===== 通用 Toast =====
function showToast(text, ms) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), ms || 1700);
}

let clipTimer = null;
function copyVal(text, label) {
  showToast('已复制 ' + label);
  if (navigator.clipboard) navigator.clipboard.writeText(String(text)).catch(() => {});
  // 剪贴板自动清理：30 秒后清空，防止密码残留在剪贴板被别的 App 读到
  clearTimeout(clipTimer);
  clipTimer = setTimeout(() => {
    if (navigator.clipboard) navigator.clipboard.writeText('').catch(() => {});
    showToast('已自动清空剪贴板');
  }, 30000);
}

// ===== 备份提醒 =====
// 备份成功后记录时间（加密导出 / GitHub 备份 / 恢复成功后都算）
function markBackedUp() {
  const now = String(Date.now());
  try {
    localStorage.setItem('fvLastBackup', now);
    localStorage.setItem('fvLastRemind', now);   // 备份成功视同已提醒，7 天周期重算
  } catch (e) {}
}
// 解锁后检查：超过 7 天没备份（或从没备份过）→ 提醒（7 天周期只提醒一次，不每次打开都弹）
function backupReminder() {
  const t = Number(localStorage.getItem('fvLastBackup') || 0);
  const lastRemind = Number(localStorage.getItem('fvLastRemind') || 0);
  if (lastRemind && Date.now() - lastRemind < 7 * 864e5) return;   // 7 天内提醒过 → 不再打扰
  if (!t) {
    try { localStorage.setItem('fvLastRemind', String(Date.now())); } catch (e) {}
    showToast('还没有备份过 · 建议去「设置 → 加密备份」', 4000);
    return;
  }
  if (Date.now() - t > 7 * 864e5) {
    try { localStorage.setItem('fvLastRemind', String(Date.now())); } catch (e) {}
    showToast('已超过 7 天没备份 · 建议去「设置 → 加密备份」', 4000);
  }
}

// 打开网站：App 里交给系统浏览器
// ① 原生壳注册了 openExternal 处理器 → 直接调起 Safari
// ② 浏览器 / 预览窗 → window.open 新标签
function openSite(url) {
  const raw = String(url || '').trim();
  if (!raw || raw === '—') { showToast('这条没有填网站地址'); return; }
  const full = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  try {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.openExternal) {
      window.webkit.messageHandlers.openExternal.postMessage(full);
      return;
    }
  } catch (e) {}
  window.open(full, '_blank');
}

// App 里禁掉长按菜单与右键（"像软件不像网页"）—— 输入框除外
document.addEventListener('contextmenu', e => {
  const t = e.target;
  const editable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  if (document.documentElement.classList.contains('app') && !editable) e.preventDefault();
}, false);

// ===== 底栏加号：弹动动画 + 触感反馈，然后才开新建页 =====
// 底栏加号（Figma 版）：未触发=+，触发=展开三瓣扇叶 + X 变色
function fabNew() {
  const fab = document.getElementById('fabBtn');
  const outer = document.getElementById('fabOuter');
  const opening = !outer.classList.contains('open');
  if (fab) { fab.classList.remove('tap'); void fab.offsetWidth; fab.classList.add('tap'); }
  try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
  if (opening) {
    outer.classList.add('open');
    fab.classList.add('open');
  } else {
    outer.classList.remove('open');
    fab.classList.remove('open');
  }
}
// 三个扇叶按钮：收起 + 跳转
function fabNew3(what) {
  const outer = document.getElementById('fabOuter');
  const fab = document.getElementById('fabBtn');
  if (outer) outer.classList.remove('open');
  if (fab) fab.classList.remove('open');
  setTimeout(() => {
    if (what === 'account') openEditor(null);
    else if (what === 'tag') openTagEditor('');
    else if (what === 'card') { switchVault('card'); openBankForm(null); }
  }, 260);
}

// ===== 编辑页「收藏」开关（edFav 已有载入/保存逻辑，这里补上点击） =====
function toggleEditFav() {
  edFav = !edFav;
  const b = document.getElementById('eFavBtn');
  if (b) b.classList.toggle('on', edFav);
  try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) {}
  showToast(edFav ? '已加入收藏' : '已取消收藏');
}

// 免验证功能已删除
// 导出（备份文件 / TOTP 文本）：让用户自己选保存位置
function nativeSave(filename, content, mime) {
  if (!hasNativeFiles()) return false;
  try {
    window.webkit.messageHandlers.saveFile.postMessage({ name: filename, text: content, mime: mime || 'application/octet-stream' });
    return true;
  } catch (e) { return false; }
}
// 原生「文件」App 选完文件 → Swift 回传内容
window.__fvImported = function (name, text) {
  try {
    if (typeof onRestoreContent === 'function') onRestoreContent(name, text);
    else showToast('已选择：' + name);
  } catch (e) {}
};

// ===== 锁屏（首次设置主密码 / 解锁 + 可选 Face ID） =====
let lockFails = 0;        // 连续错误次数
let lockUntil = 0;        // 临时锁定到期时间戳
let lockTimer = null;     // 锁定倒计时定时器
const LOCK_MAX = 3;       // 最多尝试次数
const LOCK_SEC = 10;      // 锁定时长（秒）
let faceBusy = false;     // Face ID 演示动画进行中（防连点叠放）

// --- 演示状态（首次设置 / Face ID 开关），仅存本机 ---
let fvPwSet = false;      // 是否已设置主密码
let fvFace = false;       // 是否启用（且已录入）Face ID
let fvPwHash = '';        // 主密码摘要（不存明文；真机版由 Keychain 承担）
let faceDescStore = null; // 已录入的人脸特征（128 维向量，不存原图）
try {
  const s = JSON.parse(localStorage.getItem('fvDemo') || '{}');
  fvPwSet = !!s.pwSet; fvFace = !!s.face; fvPwHash = s.pwHash || '';
  faceDescStore = s.faceDesc || null;
  if (fvFace && !faceDescStore && !hasNativeFaceId()) fvFace = false;   // 桌面演示：没录过人脸不算开启；真机系统 Face ID 没有特征向量，豁免
} catch (e) {}
function saveDemo() {
  try { localStorage.setItem('fvDemo', JSON.stringify({ pwSet: fvPwSet, face: fvFace, pwHash: fvPwHash, faceDesc: faceDescStore })); } catch (e) {}
}
// 简单摘要函数（演示用）
function weakHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(36); }

// 显示锁屏并初始化：未设置主密码 → 首次设置模式；已设置 → 解锁模式
// Face ID 未开启时，解锁界面完全不显示人脸识别
function lockInit(autoFace) {
  const lock = document.getElementById('lockScreen');
  const wrap = document.getElementById('pwWrap');
  const msg = document.getElementById('lockMsg');
  const faceBox = document.getElementById('faceBox');
  const label = document.getElementById('faceLabel');
  const inp = document.getElementById('unlockPw');
  clearInterval(lockTimer);
  faceCloseCam();
  lockFails = 0; lockUntil = 0; faceBusy = false;
  lock.style.display = '';
  lock.classList.remove('hide', 'scanning', 'success', 'fail');
  wrap.classList.remove('err', 'ok', 'locked');
  msg.classList.remove('show');
  faceBox.classList.remove('show-actions');
  label.textContent = 'Face ID 解锁';
  inp.value = ''; inp.type = 'password'; inp.disabled = false;
  document.getElementById('pwEye').innerHTML = (typeof EYE !== 'undefined') ? EYE : '';

  // ① 首次使用：还没有主密码 → 先设置
  if (!fvPwSet) {
    lock.classList.add('mode-setup');
    lock.classList.remove('mode-unlock');
    document.getElementById('lockSub').textContent = '首次使用 · 请先设置主密码';
    document.getElementById('newPw').value = '';
    document.getElementById('newPw2').value = '';
    document.getElementById('setupMsg').classList.remove('show');
    document.getElementById('pwWrapNew').classList.remove('err');
    document.getElementById('pwWrapConfirm').classList.remove('err');
    document.getElementById('newFaceSw').classList.toggle('on', fvFace);
    setTimeout(() => document.getElementById('newPw').focus(), 320);
    return;
  }

  // ② 已设置主密码 → 解锁模式
  lock.classList.remove('mode-setup');
  lock.classList.add('mode-unlock');
  document.getElementById('lockSub').textContent = fvFace ? '使用主密码或 Face ID 解锁' : '输入主密码解锁';
  faceBox.style.display = fvFace ? '' : 'none';   // 没开 Face ID 就不显示
  updateFaceRow();
  setTimeout(() => inp.focus(), 320);             // 自动聚焦
  if (autoFace && fvFace) setTimeout(faceIdAuto, 900);
}

// ===== 首次设置主密码 =====
function doSetup() {
  const p1 = document.getElementById('newPw').value.trim();
  const p2 = document.getElementById('newPw2').value.trim();
  const w1 = document.getElementById('pwWrapNew');
  const w2 = document.getElementById('pwWrapConfirm');
  const msg = document.getElementById('setupMsg');
  w1.classList.remove('err'); w2.classList.remove('err'); msg.classList.remove('show');
  void w1.offsetWidth;

  if (p1.length < 4) {
    w1.classList.add('err');
    msg.textContent = '主密码至少 4 位';
    msg.classList.add('show');
    setTimeout(() => w1.classList.remove('err'), 1300);
    return;
  }
  if (p1 !== p2) {
    w2.classList.add('err');
    msg.textContent = '两次输入不一致，请重新确认';
    msg.classList.add('show');
    setTimeout(() => w2.classList.remove('err'), 1300);
    return;
  }
  fvPwHash = weakHash(p1);
  fvPwSet = true;
  fvFace = document.getElementById('newFaceSw').classList.contains('on');
  saveDemo();
  updateFaceRow();
  showToast(fvFace ? '主密码已设置 · Face ID 已开启' : '主密码已设置');
  w1.classList.add('ok');
  setTimeout(finishUnlock, 620);
}

// 首次设置里的 Face ID 开关：iOS 壳 → 系统 Face ID；桌面演示 → 先录入人脸
function toggleNewFace(btn) {
  if (btn.classList.contains('on')) {
    btn.classList.remove('on');
    fvFace = false; faceDescStore = null; saveDemo(); updateFaceRow();
    return;
  }
  if (hasNativeFaceId()) {
    window.__fvFaceIdCheck = function (r) {
      window.__fvFaceIdCheck = null;
      if (r && r.ok) {
        btn.classList.add('on');
        fvFace = true; saveDemo(); updateFaceRow();
        showToast('Face ID 解锁已开启');
      } else if (r && !r.enrolled) {
        showToast('请先在系统设置里录入面容 ID', 3200);
      } else {
        showToast('此设备不支持面容 / 指纹', 3200);
      }
    };
    try { window.webkit.messageHandlers.faceIdCheck.postMessage(null); } catch (e) {}
    return;
  }
  startEnroll('setup');
}

// 设置页：开关 Face ID
function toggleFaceId() {
  // iOS 壳：直接用系统 Face ID —— 只检查系统是否已录入面容，不需要自己录脸
  if (hasNativeFaceId()) {
    if (fvFace) {                        // 已开 → 关闭
      fvFace = false;
      saveDemo();
      updateFaceRow();
      showToast('Face ID 解锁已关闭');
      return;
    }
    window.__fvFaceIdCheck = function (r) {
      window.__fvFaceIdCheck = null;
      if (r && r.ok) {
        fvFace = true;
        saveDemo();
        updateFaceRow();
        showToast('Face ID 解锁已开启');
      } else if (r && !r.enrolled) {
        showToast('请先在系统设置里录入面容 ID', 3200);
      } else {
        showToast('此设备不支持面容 / 指纹', 3200);
      }
    };
    try { window.webkit.messageHandlers.faceIdCheck.postMessage(null); } catch (e) {}
    return;
  }
  // 桌面演示：开启 → 先录脸
  if (!fvFace) { startEnroll('settings'); return; }
  fvFace = false;
  faceDescStore = null;
  saveDemo();
  updateFaceRow();
  showToast('Face ID 解锁已关闭');
}

// 同步设置页的状态文字
function updateFaceRow() {
  const el = document.getElementById('faceIdState');
  if (el) el.textContent = fvFace ? '已开启' : '已关闭';
}

// 重置演示数据（清掉主密码 → 重新走首次设置）
function resetDemo() {
  fvPwSet = false; fvFace = false; fvPwHash = ''; faceDescStore = null;
  try { localStorage.removeItem('fvDemo'); } catch (e) {}
  faceCloseCam();
  closeDetail(); closeEditor();
  lockInit(false);
  showToast('已重置 · 请重新设置主密码');
}

// =====================================================================
// 人脸识别（face-api.js 本地模型 · 真实摄像头）
//   录入：打开 Face ID 开关 → 摄像头 → 连续 3 帧检出 → 存 128 维特征
//   识别：锁屏自动扫脸 → 与录入特征比对（欧氏距离 < 0.55）
//   摄像头不可用 / 未录入 → 自动回退到演示动画
// =====================================================================
let faceModelsOk = false;       // 模型加载完成
let faceModelLoading = null;    // 加载中的 Promise（防重复）
let faceStream = null;          // 摄像头流
let faceLoopTimer = null;       // 检测循环
let faceEnrollMode = false;     // 是否处于录入模式
let enrollFrames = 0;           // 连续检出帧数
let enrollTarget = 'settings';  // 录入入口：settings / setup

// 载入本地模型
function faceLoadModels() {
  if (faceModelsOk) return Promise.resolve(true);
  if (faceModelLoading) return faceModelLoading;
  if (!window.faceapi) return Promise.resolve(false);
  faceModelLoading = (async () => {
    try {
      const base = 'vendor/models';
      await faceapi.nets.tinyFaceDetector.loadFromUri(base);
      await faceapi.nets.faceLandmark68Net.loadFromUri(base);
      await faceapi.nets.faceRecognitionNet.loadFromUri(base);
      faceModelsOk = true;
      return true;
    } catch (e) {
      console.warn('人脸模型加载失败:', e);
      return false;
    }
  })();
  return faceModelLoading;
}

// 打开摄像头
// 原生壳（iOS）优先：走 Swift 的 AVCaptureSession —— 权限用 AVCaptureDevice.requestAccess，
// iOS 会记住选择（只弹一次），且帧由 Swift 推来（window.__fvFrameSrc），不占 getUserMedia。
async function faceOpenCam(videoEl) {
  // ① 原生模式
  try {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cameraOn) {
      window.__fvCamNative = true;
      window.__fvFrameSrc = null;
      const target = videoEl || document.querySelector('.cam-wrap video, .face-cam');
      const r = target ? target.getBoundingClientRect() : { x: 0, y: 0, width: 200, height: 200 };
      window.webkit.messageHandlers.cameraOn.postMessage({
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
      });
      if (target) target.style.opacity = '0';          // 隐藏 HTML 视频，Swift 预览层会盖在原位
      // 等第一帧（最长 6 秒，含用户首次授权弹窗时间）
      const start = Date.now();
      while (!window.__fvFrameSrc && Date.now() - start < 6000) {
        await new Promise(res => setTimeout(res, 120));
      }
      if (!window.__fvFrameSrc) {                       // 用户拒绝或超时
        window.__fvCamNative = false;
        if (target) target.style.opacity = '';
        return false;
      }
      return true;
    }
  } catch (e) { /* 继续走 Web 方案 */ }

  // ② Web 兜底（桌面预览 / 无原生桥）
  try {
    faceStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 320 } },
      audio: false
    });
    videoEl.srcObject = faceStream;
    await videoEl.play().catch(() => {});
    return true;
  } catch (e) {
    return false;
  }
}

// 关闭摄像头 + 停循环
function faceCloseCam() {
  if (faceStream) { faceStream.getTracks().forEach(t => t.stop()); faceStream = null; }
  const v1 = document.getElementById('faceVideo');
  const v2 = document.getElementById('enrollVideo');
  if (v1) { v1.srcObject = null; v1.style.opacity = ''; }
  if (v2) { v2.srcObject = null; v2.style.opacity = ''; }
  if (window.__fvCamNative) {
    window.__fvCamNative = false;
    window.__fvFrameSrc = null;
    try { window.webkit.messageHandlers.cameraOff.postMessage(null); } catch (e) {}
  }
  const btn = document.getElementById('faceBtn');
  if (btn) btn.classList.remove('cam-on');
  clearInterval(faceLoopTimer); faceLoopTimer = null;
}

// 从视频帧提取人脸特征（Array(128) 或 null）
// 原生摄像头模式：帧由 Swift 推到 window.__fvFrameSrc（base64 JPEG），加载成 Image 再检测
async function faceGrabDescriptor(videoEl) {
  if (!faceModelsOk) return null;
  try {
    let src = videoEl;
    if (window.__fvCamNative && window.__fvFrameSrc) {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res; img.onerror = rej;
        img.src = window.__fvFrameSrc;
      });
      if (!img.naturalWidth) return null;
      src = img;
    }
    const det = await faceapi
      .detectSingleFace(src, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.40 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    return det ? Array.from(det.descriptor) : null;
  } catch (e) { return null; }
}

// 特征比对（欧氏距离）
function faceMatch(desc) {
  if (!faceDescStore || !desc) return false;
  const n = Math.min(faceDescStore.length, desc.length);
  let sum = 0;
  for (let i = 0; i < n; i++) { const d = faceDescStore[i] - desc[i]; sum += d * d; }
  return Math.sqrt(sum) < 0.55;
}

// ---- 录入流程 ----
async function startEnroll(target) {
  enrollTarget = target || 'settings';
  const modal = document.getElementById('faceEnroll');
  const status = document.getElementById('enrollStatus');
  const wrap = document.querySelector('.cam-wrap');
  const btn = document.getElementById('enrollAction');
  modal.classList.add('show');
  wrap.classList.remove('ok');
  btn.textContent = '开始录入';
  faceEnrollMode = true;
  enrollFrames = 0;
  status.className = 'fm-status';
  status.textContent = '正在加载模型…';

  const ok = await faceLoadModels();
  if (!ok) {
    status.className = 'fm-status err';
    status.textContent = '模型加载失败（检查 vendor/models）';
    faceEnrollMode = false;
    return;
  }
  const camOk = await faceOpenCam(document.getElementById('enrollVideo'));
  if (!camOk) {
    status.className = 'fm-status err';
    status.textContent = '摄像头不可用 — 改用演示模式';
    setTimeout(() => {
      cancelEnroll();
      fvFace = true; faceDescStore = null; saveDemo(); updateFaceRow();
      document.getElementById('newFaceSw').classList.add('on');
      showToast('摄像头不可用 · Face ID 用演示模式');
    }, 1500);
    return;
  }
  status.textContent = '把脸放进取景框…';
  btn.textContent = '重新扫描';
  faceEnrollLoop();
}

// 人脸录入循环
// ⚠️ 关键：绝不能用 setInterval(async ...) —— 它不会等 await，
// 在手机上单次检测要 300~800ms，而循环每 320ms 塞一个新任务 → 任务堆叠 → 主线程堵死 → 界面完全点不动。
// 改成「跑完才排下一次」的递归 setTimeout，并用 busy 标志兜底防重入。
let faceLoopBusy = false;
function faceEnrollLoop() {
  clearTimeout(faceLoopTimer);
  faceLoopTimer = null;
  enrollFrames = 0;
  faceLoopBusy = false;

  const tick = async () => {
    if (!faceEnrollMode) return;
    if (faceLoopBusy) { faceLoopTimer = setTimeout(tick, 400); return; }
    faceLoopBusy = true;
    try {
      const status = document.getElementById('enrollStatus');
      const wrap = document.querySelector('.cam-wrap');
      if (!status) return;
      const desc = await faceGrabDescriptor(document.getElementById('enrollVideo'));
      if (!faceEnrollMode) return;                       // 期间被关掉了
      if (!desc) {
        enrollFrames = 0;
        status.className = 'fm-status';
        status.textContent = '没有检测到人脸…';
        wrap.classList.remove('ok');
        return;
      }
      enrollFrames++;
      if (enrollFrames < 3) {
        status.textContent = '检测到人脸 · 保持不动 (' + enrollFrames + '/3)';
        return;
      }
      // 录入成功
      faceDescStore = desc;
      fvFace = true;
      saveDemo();
      updateFaceRow();
      clearTimeout(faceLoopTimer); faceLoopTimer = null;
      faceEnrollMode = false;
      wrap.classList.add('ok');
      status.className = 'fm-status ok';
      status.textContent = '✓ 录入成功，Face ID 已开启';
      document.getElementById('enrollAction').textContent = '完成';
      setTimeout(() => {
        document.getElementById('faceEnroll').classList.remove('show');
        faceCloseCam();
        if (enrollTarget === 'setup') document.getElementById('newFaceSw').classList.add('on');
        showToast('Face ID 已录入并开启');
      }, 1100);
    } catch (e) {
      const st = document.getElementById('enrollStatus');
      if (st) { st.className = 'fm-status'; st.textContent = '识别出错，请重试'; }
    } finally {
      faceLoopBusy = false;
      if (faceEnrollMode) faceLoopTimer = setTimeout(tick, 420);   // 跑完一轮才排下一轮
    }
  };
  faceLoopTimer = setTimeout(tick, 150);
}

function enrollAction() {
  const modal = document.getElementById('faceEnroll');
  if (!modal.classList.contains('show')) { startEnroll('settings'); return; }
  enrollFrames = 0;   // 已在界面里 → 重新扫描
  const status = document.getElementById('enrollStatus');
  status.className = 'fm-status';
  status.textContent = '把脸放进取景框…';
  document.querySelector('.cam-wrap').classList.remove('ok');
}

function cancelEnroll() {
  faceEnrollMode = false;
  clearInterval(faceLoopTimer); faceLoopTimer = null;
  enrollFrames = 0;
  document.getElementById('faceEnroll').classList.remove('show');
  faceCloseCam();
}

// ---- 锁屏识别 ----
// 已录入 → 真实扫脸；未录入 → 演示动画
async function faceScanReal() {
  const lock = document.getElementById('lockScreen');
  const label = document.getElementById('faceLabel');
  const btn = document.getElementById('faceBtn');
  lock.classList.add('scanning');
  label.textContent = '正在识别…';
  const ok = await faceLoadModels();
  if (!ok) { lock.classList.remove('scanning'); label.textContent = 'Face ID 解锁'; return; }
  const camOk = await faceOpenCam(document.getElementById('faceVideo'));
  if (!camOk) {
    // 摄像头不可用 → 演示动画
    lock.classList.remove('scanning');
    lock.classList.add('fail');
    label.textContent = 'Face ID 无法识别';
    setTimeout(() => lock.classList.remove('fail'), 700);
    document.getElementById('faceBox').classList.add('show-actions');
    return;
  }
  btn.classList.add('cam-on');
  let tries = 0;
  clearTimeout(faceLoopTimer);
  faceLoopTimer = null;
  // ⚠️ 同录入循环：递归 setTimeout，跑完一轮才排下一轮，绝不堆叠任务
  const tick = async () => {
    const lk = document.getElementById('lockScreen');
    if (!lk || lk.classList.contains('hide') || lk.classList.contains('success')) {
      faceLoopTimer = null; return;                       // 已解锁 / 已关 → 停
    }
    if (faceLoopBusy) { faceLoopTimer = setTimeout(tick, 400); return; }
    faceLoopBusy = true;
    try {
      tries++;
      const desc = await faceGrabDescriptor(document.getElementById('faceVideo'));
      if (!desc) { return; }                              // 没检测到脸 → 下一轮再试
      if (faceMatch(desc)) {
        // 识别成功
        faceLoopTimer = null;
        lk.classList.remove('scanning');
        lk.classList.add('success');
        label.textContent = '已识别';
        setTimeout(() => { faceCloseCam(); finishUnlock(); }, 640);
        return;
      }
      label.textContent = '不是本人 · 再看一次';
      if (tries > 22) {                                   // ≈10 秒没成功 → 转为失败提示
        faceLoopTimer = null;
        faceCloseCam();
        lk.classList.remove('scanning');
        lk.classList.add('fail');
        label.textContent = 'Face ID 无法识别';
        setTimeout(() => lk.classList.remove('fail'), 700);
        document.getElementById('faceBox').classList.add('show-actions');
        return;
      }
    } catch (e) {
      // 检测异常 → 等一下再试，不崩界面
    } finally {
      faceLoopBusy = false;
      if (faceLoopTimer !== null || !document.getElementById('lockScreen')) return;
      const lk2 = document.getElementById('lockScreen');
      if (lk2 && !lk2.classList.contains('hide') && !lk2.classList.contains('success') && tries <= 22) {
        faceLoopTimer = setTimeout(tick, 420);
      }
    }
  };
  faceLoopTimer = setTimeout(tick, 150);
}

// 演示动画（没录入人脸时用）
function faceScanDemo() {
  const lock = document.getElementById('lockScreen');
  const label = document.getElementById('faceLabel');
  lock.classList.add('scanning');
  label.textContent = '正在识别…';
  setTimeout(() => {
    lock.classList.remove('scanning');
    lock.classList.add('fail');
    label.textContent = 'Face ID 无法识别';
    setTimeout(() => lock.classList.remove('fail'), 700);
    document.getElementById('faceBox').classList.add('show-actions');
  }, 950);
}

// 打开时的自动识别：已录入人脸 → 真实扫脸；未录入 → 演示动画
// ===== 系统 Face ID（iOS 壳：LocalAuthentication，比 face-api 快得多、更准）=====
function hasNativeFaceId() {
  try { return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.faceIdAuth); } catch (e) { return false; }
}
// Swift 验证结果回调
window.__fvFaceIdResult = function (r) {
  const lock = document.getElementById('lockScreen');
  if (!lock) return;
  if (r && r.ok) {
    lock.classList.remove('scanning', 'fail');
    lock.classList.add('success');
    document.getElementById('faceLabel').textContent = '已识别';
    setTimeout(finishUnlock, 420);
    return;
  }
  lock.classList.remove('scanning');
  const reason = r ? r.reason : 'fail';
  if (reason === 'cancel') {
    // 用户主动取消系统弹窗 → 安静回到可点状态
    document.getElementById('faceLabel').textContent = 'Face ID 解锁';
    document.getElementById('faceBox').classList.remove('show-actions');
    return;
  }
  if (reason === 'no-enroll') {
    document.getElementById('faceLabel').textContent = '未录入面容 ID';
    showToast('请先在系统设置里录入面容 ID', 3000);
    document.getElementById('faceBox').classList.add('show-actions');
    return;
  }
  if (reason === 'no-biometry') {
    document.getElementById('faceLabel').textContent = '设备不支持面容';
    showToast('此设备不支持面容 / 指纹', 3000);
    document.getElementById('faceBox').classList.add('show-actions');
    return;
  }
  // fail：验证未通过
  lock.classList.add('fail');
  document.getElementById('faceLabel').textContent = '再试一次';
  setTimeout(() => lock.classList.remove('fail'), 700);
  document.getElementById('faceBox').classList.add('show-actions');
};
// 请求系统验证（锁屏按钮 / 自动尝试共用）
function nativeFaceAuth() {
  const lock = document.getElementById('lockScreen');
  lock.classList.add('scanning');
  document.getElementById('faceLabel').textContent = '正在识别…';
  try { window.webkit.messageHandlers.faceIdAuth.postMessage(null); }
  catch (e) { lock.classList.remove('scanning'); }
}

function faceIdAuto() {
  const lock = document.getElementById('lockScreen');
  if (!lock || lock.classList.contains('hide')) return;
  if (hasNativeFaceId()) { nativeFaceAuth(); return; }   // iOS 壳 → 系统 Face ID
  if (faceDescStore) faceScanReal(); else faceScanDemo();
}

// 点击 Face ID 圆钮：iOS 壳 → 系统 Face ID；桌面演示 → 真实扫脸/演示动画链
function faceIdTry() {
  const lock = document.getElementById('lockScreen');
  if (!lock || lock.classList.contains('hide')) return;
  document.getElementById('faceBox').classList.remove('show-actions');
  lock.classList.remove('fail', 'success');
  document.getElementById('faceLabel').textContent = 'Face ID 解锁';
  if (hasNativeFaceId()) { nativeFaceAuth(); return; }   // iOS 壳 → 系统 Face ID
  if (faceDescStore) { faceScanReal(); return; }   // 真实识别
  if (faceBusy) return;
  faceBusy = true;
  const label = document.getElementById('faceLabel');
  lock.classList.add('fail');
  label.textContent = '再试一次';
  setTimeout(() => {
    lock.classList.remove('fail');
    lock.classList.add('scanning');
    label.textContent = '正在识别…';
    setTimeout(() => {
      lock.classList.remove('scanning');
      lock.classList.add('success');
      label.textContent = '已识别';
      setTimeout(() => { faceBusy = false; finishUnlock(); }, 640);
    }, 900);
  }, 950);
}

// 改用主密码
function usePassword() {
  document.getElementById('faceBox').classList.remove('show-actions');
  document.getElementById('faceLabel').textContent = 'Face ID 解锁';
  faceCloseCam();
  document.getElementById('unlockPw').focus();
}

// 密码显示 / 隐藏
function toggleLockPw() {
  const inp = document.getElementById('unlockPw');
  const btn = document.getElementById('pwEye');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.innerHTML = show ? EYE_OFF : EYE;
  inp.focus();
}

// 解锁完成（淡出并隐藏锁屏）
function finishUnlock() {
  const lock = document.getElementById('lockScreen');
  clearInterval(lockTimer);
  faceCloseCam();
  lockFails = 0; lockUntil = 0;
  lock.classList.add('hide');
  document.getElementById('pwWrap').classList.remove('ok', 'err', 'locked');
  document.getElementById('lockMsg').classList.remove('show');
  setTimeout(() => { lock.style.display = 'none'; }, 650);
  setTimeout(backupReminder, 1200);   // 解锁后检查备份状态
}

// 重新锁定（设置页"立即锁定"）
function relockApp() {
  lockInit(true);
}

// ===== 主密码验证（演示规则：≥4 位 = 正确；连错 3 次临时锁定 10 秒） =====
function unlockPw() {
  const lock = document.getElementById('lockScreen');
  const wrap = document.getElementById('pwWrap');
  const msg = document.getElementById('lockMsg');
  const inp = document.getElementById('unlockPw');
  if (lockUntil > Date.now()) return;              // 锁定中，忽略提交
  if (wrap.classList.contains('ok')) return;       // 已通过验证，避免重复提交
  const v = inp.value.trim();

  wrap.classList.remove('err', 'ok');
  msg.classList.remove('show');
  void wrap.offsetWidth; // 重置 shake 动画，保证可重复播放

  if (weakHash(v) !== fvPwHash) {
    lockFails++;
    wrap.classList.add('err');
    if (lockFails >= LOCK_MAX) {
      // ③ 连错达上限 → 临时锁定
      lockUntil = Date.now() + LOCK_SEC * 1000;
      wrap.classList.add('locked');
      inp.disabled = true;
      startLockCountdown();
    } else {
      // ① 错误：变红 + 抖动 + 剩余次数提示
      msg.textContent = '主密码错误 · 还可尝试 ' + (LOCK_MAX - lockFails) + ' 次';
      msg.classList.add('show');
      setTimeout(() => wrap.classList.remove('err'), 1300);
      setTimeout(() => { if (lockUntil <= Date.now()) msg.classList.remove('show'); }, 2600);
    }
    return;
  }

  // ② 正确：变绿 + 勾弹出 → 解锁
  lockFails = 0;
  wrap.classList.add('ok');
  setTimeout(finishUnlock, 620);
}

// 锁定倒计时（到点自动解锁输入框）
function startLockCountdown() {
  const wrap = document.getElementById('pwWrap');
  const msg = document.getElementById('lockMsg');
  const inp = document.getElementById('unlockPw');
  clearInterval(lockTimer);
  const tick = () => {
    const left = Math.ceil((lockUntil - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(lockTimer);
      wrap.classList.remove('locked');
      inp.disabled = false;
      msg.classList.remove('show');
      lockFails = 0; lockUntil = 0;
      inp.focus();
      return;
    }
    msg.textContent = '尝试次数过多 · 请 ' + left + ' 秒后再试';
    msg.classList.add('show');
  };
  tick();
  lockTimer = setInterval(tick, 200);
}

// ===== 账号详情页 =====
let currentIdx = null;
let passShown = false;

// 图标（与桌面版同款 lucide）
const EYE = icon('eye', { w: 14 });
const EYE_OFF = icon('eye-off', { w: 14 });
const COPY = icon('copy', { w: 13 });

function openDetail(name) {
  const idx = CARDS.findIndex(c => c.t === name);
  if (idx < 0) return;
  currentIdx = idx;
  passShown = false;
  renderDetail(idx);
  document.getElementById('detailScreen').classList.add('show');
}

function closeDetail() {
  document.getElementById('detailScreen').classList.remove('show');
}

function renderDetail(idx) {
  const c = CARDS[idx];
  document.getElementById('detailTitle').textContent = c.t;

  const st = passStrength(c.pass);
  const hist = HIST[c.t] || [];

  // 验证码：实时取自 TOTP 引擎（与列表/验证码页同一相位）
  const ti = c.totp ? TOTP_ITEMS.find(x => x.key === c.totp) : null;
  if (ti && !ti.code) ti.code = randCode();
  const totpRow = ti ? `
    <div class="drow">
      <span class="dk">验证码</span>
      <span class="dv mono" id="dcode-${ti.key}" style="color:#64D2FF;font-weight:700;font-size:16px;letter-spacing:2.5px">${ti.code}</span>
      <span id="dsec-${ti.key}" style="font-size:12px;color:rgba(255,255,255,.35);align-self:center">30</span>
      <div class="cp" onclick="copyVal(document.getElementById('dcode-${ti.key}').textContent,'验证码')">${COPY}</div>
    </div>` : '';

  document.getElementById('detailBody').innerHTML = `
    <div class="dhero">
      ${c.icon
        ? `<div class="bigico" style="background:rgba(255,255,255,.12)"><img src="${c.icon}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>`
        : `<div class="bigico" style="background:${c.c}">${c.t[0]}</div>`}
      <div class="dn">${c.t}</div>
      <div class="dc" onclick="toggleFav()" style="cursor:pointer">
        ${icon('star', { w: 12, cls: 'sfav' + (c.fav ? ' on' : '') })}
        <span>${c.fav ? '已收藏 · 列表置顶' : '点按收藏'}</span>
      </div>
    </div>

    <div class="group">
      <div class="drow"><span class="dk">分类</span><span class="dv">${c.cat || '未分类'}</span></div>
      <div class="drow"><span class="dk">账号</span><span class="dv">${c.user || c.s}</span>
        <div class="cp" onclick="copyVal('${c.user || c.s}','账号')">${COPY}</div></div>
      <div class="drow"><span class="dk">密码</span><span class="dv mono" id="dPass">••••••••••</span>
        <div class="vi" onclick="togglePass()">${EYE}</div>
        <div class="cp" onclick="copyVal('${c.pass || ''}','密码')">${COPY}</div></div>
      ${totpRow}
      <div class="drow"><span class="dk">网站</span><span class="dv sitelink" style="color:#64D2FF" onclick="openSite('${(c.site || '').replace(/'/g, "\\'")}')">${c.site || '—'} <span class="out">↗</span></span>
        <div class="cp" onclick="copyVal('${c.site || ''}','网站')">${COPY}</div></div>
    </div>

    <div class="dsec">备注</div>
    <div class="group">
      <div class="drow"><span class="dv" style="color:rgba(255,255,255,.75);white-space:normal">${c.note || '无备注'}</span></div>
    </div>

    <div class="dsec">安全</div>
    <div class="group">
      <div class="drow" style="flex-direction:column;align-items:stretch;gap:9px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="dk">密码强度</span><span class="dv" style="color:${st.c};font-weight:600">${st.l} · ${st.t}</span>
        </div>
        <div class="sbar"><i style="width:${st.pct}%;background:${st.c};box-shadow:0 0 12px ${st.c}66"></i></div>
      </div>
      <div class="drow" onclick="showHistory()" style="cursor:pointer"><span class="dk">密码历史</span>
        <span class="dv" style="color:rgba(255,255,255,.5)">${hist.length} 条记录</span>
        <svg class="chev2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></div>
      <div class="drow"><span class="dk">创建时间</span><span class="dv" style="color:rgba(255,255,255,.5)">2025-11-02</span></div>
      <div class="drow"><span class="dk">最近修改</span><span class="dv" style="color:rgba(255,255,255,.5)">30 天前</span></div>
    </div>

    <div class="danger" onclick="delEntry()">${icon('trash-2', { w: 15 })}<span>删除此账号</span></div>
  `;
}

// 密码强度分级（对标桌面版 zxcvbn 的四档 + 破解时间）
function passStrength(p) {
  p = p || '';
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (p.length >= 16) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  const T = [
    { l: '很弱', c: '#FF453A', t: '瞬间破解', pct: 14 },
    { l: '弱', c: '#FF9F0A', t: '几分钟破解', pct: 30 },
    { l: '中等', c: '#FFD60A', t: '约 3 年破解', pct: 52 },
    { l: '强', c: '#30D158', t: '约 3 世纪破解', pct: 74 },
    { l: '很强', c: '#30D158', t: '约 200 万年破解', pct: 88 },
    { l: '极强', c: '#0A84FF', t: '数万亿年破解', pct: 100 },
  ];
  const i = Math.min(Math.floor(s * 0.9), 5);
  return Object.assign({ score: s }, T[i]);
}

// 收藏切换（列表置顶）
function toggleFav() {
  const c = CARDS[currentIdx];
  c.fav = !c.fav;
  renderDetail(currentIdx);
  renderCards();
  showToast(c.fav ? '已收藏 · 列表置顶' : '已取消收藏');
}

// 详情页里的历史/自定义字段演示数据
const HIST = {
  'Github': [{ p: 'gh_#Lucky9921', d: '2026-08-01' }, { p: 'gh_Lucky2024!', d: '2025-11-02' }, { p: 'github2023', d: '2024-06-15' }],
  '哔哩哔哩': [{ p: 'Bili@2026#x8f', d: '2026-03-12' }, { p: 'bili2024pass', d: '2025-01-08' }],
  'Steam': [{ p: 'Steam!vault77', d: '2026-05-20' }],
};
const CUSTOM = {
  'Github': [{ k: '密保问题', v: '母亲的生日' }, { k: '恢复邮箱', v: 'fall***@qq.com' }, { k: '安全密钥', v: 'YubiKey 5C' }],
  'Steam': [{ k: '家庭监护 PIN', v: '••••' }],
};
// 密码历史抽屉
function showHistory() {
  const c = CARDS[currentIdx];
  const hist = HIST[c.t] || [];
  const box = document.getElementById('histList');
  if (!hist.length) {
    box.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(255,255,255,.4);font-size:13px">暂无历史记录</div>';
  } else {
    box.innerHTML = hist.map((h, i) => `
      <div class="drow" style="${i ? 'border-top:0.5px solid rgba(255,255,255,.07)' : ''}">
        <span class="dv mono" style="font-size:13px;letter-spacing:1px">${h.p}</span>
        <span style="font-size:11px;color:rgba(255,255,255,.4);margin-left:auto">${h.d}</span>
        <div class="cp" onclick="copyVal('${h.p}','历史密码')">${COPY}</div>
      </div>`).join('');
  }
  document.getElementById('histSheet').classList.add('show');
}

function closeHistory() {
  document.getElementById('histSheet').classList.remove('show');
}

function togglePass() {
  const c = CARDS[currentIdx];
  const el = document.getElementById('dPass');
  if (!el) return;
  passShown = !passShown;
  el.textContent = passShown ? (c.pass || '—') : '••••••••••';
  el.style.color = passShown ? '#fff' : '';
  el.style.letterSpacing = passShown ? '1.5px' : '2px';
  const vi = el.parentElement.querySelector('.vi');
  if (vi) vi.innerHTML = passShown ? EYE_OFF : EYE;
}

function delEntry() {
  if (currentIdx === null) return;
  const name = CARDS[currentIdx].t;
  CARDS.splice(currentIdx, 1);
  // 同步移除验证码页对应项
  const ti = (typeof TOTP_ITEMS !== 'undefined') ? TOTP_ITEMS.findIndex(x => x.t === name) : -1;
  if (ti >= 0) TOTP_ITEMS.splice(ti, 1);
  closeDetail();
  renderChips();
  renderCards();
  if (typeof renderTOTP === 'function') renderTOTP();
  showToast('已删除「' + name + '」');
}

// ===== 新建 / 编辑 =====
let editIdx = null;
let edFav = false, edCat = '未分类', edIcon = null, edPassShown = false;

// 分类选项：与密码库顶部 chips / 标签页 同一数据源（动态）
function eCatList() {
  return ['未分类', ...new Set(CARDS.map(c => c.cat).filter(Boolean))];
}

function openEditor(idx) {
  editIdx = (idx === null || idx === undefined) ? null : idx;
  const isNew = editIdx === null;
  document.getElementById('editorTitle').textContent = isNew ? '新建账号' : '编辑账号';
  const f = (id) => document.getElementById(id);

  if (!isNew) {
    const c = CARDS[editIdx];
    f('fName').value = c.t; f('fUser').value = c.user || ''; f('fPass').value = c.pass || '';
    f('fSite').value = c.site || ''; f('fNote').value = c.note || '';
    f('fTotp').value = c.totp ? '（此账号已配置 2FA，密钥已加密保存）' : '';
    edFav = !!c.fav;
    edCat = c.cat || '未分类';
    edIcon = c.icon || null;
  } else {
    ['fName', 'fUser', 'fPass', 'fSite', 'fNote', 'fTotp'].forEach(id => f(id).value = '');
    edFav = false; edCat = '未分类'; edIcon = null;
  }
  edPassShown = false;
  f('fPass').type = 'password';
  document.getElementById('eEyeBtn').innerHTML = EYE;
  document.getElementById('eTotpHint').style.display = f('fTotp').value.trim() ? 'block' : 'none';
  renderEditor();
  updStrength();
  document.getElementById('editorScreen').classList.add('show');
}

function renderEditor() {
  const f = (id) => document.getElementById(id);
  // 分类（单选：与密码库 chips 同步）
  f('eCats').innerHTML = eCatList().map(c =>
    `<button class="chip2${c === edCat ? ' on' : ''}" onclick="pickCat('${c}')">${c}</button>`).join('');
  // 图标预览
  const img = f('eIconImg'), ph = f('eIconPh');
  if (edIcon) { img.src = edIcon; img.style.display = 'block'; ph.style.display = 'none'; }
  else { img.style.display = 'none'; ph.style.display = 'block'; }
  // 收藏
  f('eFavBtn').classList.toggle('on', edFav);
  renderEdHist();
}

// —— 图标：本地图片上传（FileReader 实时预览） ——
function pickIcon() { document.getElementById('eIconFile').click(); }
function onIconPicked(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => { edIcon = r.result; renderEditor(); showToast('图标已选择 · 保存后生效'); };
  r.readAsDataURL(file);
}

// —— 网站图标（跟随 PC 端逻辑：输入域名取 favicon） ——
function fetchFav() {
  const v = document.getElementById('fSite').value.trim();
  if (!v) { showToast('请先填写网站地址'); return; }
  const dom = v.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/\s]/)[0];
  edIcon = 'https://' + dom + '/favicon.ico';
  renderEditor();
  showToast('已获取网站图标：' + dom);
}

// —— 分类 ——
function pickCat(c) { edCat = c; renderEditor(); }

// —— 密码历史（编辑已有账号时显示） ——
function renderEdHist() {
  const wrap = document.getElementById('eHistWrap');
  if (editIdx === null) { wrap.style.display = 'none'; return; }
  const hist = HIST[CARDS[editIdx].t] || [];
  wrap.style.display = hist.length ? 'block' : 'none';
  document.getElementById('eHist').innerHTML = hist.slice(0, 5).map(h => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 2px;font-size:11.5px;color:rgba(255,255,255,.45)">
      <span style="font-family:monospace">••••${h.p.slice(-4)}</span>
      <span style="margin-left:auto;color:rgba(255,255,255,.3)">${h.d}</span>
    </div>`).join('');
}

// —— 密码显隐 / 实时强度 ——
function toggleEditPass() {
  edPassShown = !edPassShown;
  document.getElementById('fPass').type = edPassShown ? 'text' : 'password';
  document.getElementById('eEyeBtn').innerHTML = edPassShown ? EYE_OFF : EYE;
}
function updStrength() {
  const p = document.getElementById('fPass').value;
  const wrap = document.getElementById('eStrWrap');
  if (!p) { wrap.style.display = 'none'; return; }
  const st = passStrength(p);
  wrap.style.display = 'flex';
  const bar = document.getElementById('eStrBar');
  bar.style.width = st.pct + '%'; bar.style.background = st.c;
  const lb = document.getElementById('eStrLabel');
  lb.textContent = st.l + ' · ' + st.t; lb.style.color = st.c;
}

function closeEditor() {
  document.getElementById('editorScreen').classList.remove('show');
}

function saveEntry() {
  const f = (id) => document.getElementById(id).value.trim();
  const name = f('fName');
  if (!name) { showToast('请填写标题'); return; }
  const data = {
    t: name,
    s: (f('fUser') || name) + (f('fSite') ? ' · ' + f('fSite') : ''),
    user: f('fUser'), pass: f('fPass'), site: f('fSite'),
    cat: edCat, note: f('fNote'), fav: edFav, icon: edIcon || '',
  };
  if (editIdx === null) {
    data.c = COLORS[CARDS.length % COLORS.length];
    CARDS.push(data);
    showToast('已创建「' + name + '」');
  } else {
    const old = CARDS[editIdx];
    Object.assign(old, data, { c: old.c, totp: old.totp });
    showToast('已保存「' + name + '」');
  }
  closeEditor();
  renderChips(); renderCards(); renderTags();
  if (editIdx !== null && document.getElementById('detailScreen').classList.contains('show')) renderDetail(editIdx);
}

const COLORS = ['#FB7299', '#24292F', '#2A6DA5', '#1677FF', '#3D9BFF', '#30D158', '#BF5AF2', '#FF9F0A'];

// ===== 密码生成器 =====
let genVal = '';

function openGen() {
  genRun();
  document.getElementById('genOverlay').classList.add('show');
}

function closeGen() {
  document.getElementById('genOverlay').classList.remove('show');
}

function genRun() {
  const len = parseInt(document.getElementById('genRange').value) || 16;
  const up = document.getElementById('swUpper').classList.contains('on');
  const num = document.getElementById('swNum').classList.contains('on');
  const sym = document.getElementById('swSym').classList.contains('on');
  let chars = 'abcdefghijkmnpqrstuvwxyz';
  if (up) chars += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  if (num) chars += '23456789';
  if (sym) chars += '!@#$%^&*-_+=?';
  genVal = Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  document.getElementById('genCode').textContent = genVal;
}

function genUse() {
  document.getElementById('fPass').value = genVal;
  closeGen();
  if (typeof updStrength === 'function') updStrength();
  showToast('已填入生成的密码');
}

// ===== 壁纸切换 =====
const WALLPAPERS = [
  { n: 'BZ2', f: 'bz2.jpg' },
  { n: '黑色', f: 'iPhone%2014%20Wallpaper%20Black%20Mekan0.com.png' },
];
let wallIdx = 0;

function cycleWall() {
  wallIdx = (wallIdx + 1) % WALLPAPERS.length;
  wallFancy(WALLPAPERS[wallIdx].f, WALLPAPERS[wallIdx].n);
}

// ===== 免验证时长页 =====
// 免验证功能已删除（2026-09 用户要求）

// ===== GitHub 备份页 =====
function openBackup() {
  try {
    const cfg = JSON.parse(localStorage.getItem('fvGh') || '{}');
    document.getElementById('ghRepo').value = cfg.repo || '';
    document.getElementById('ghToken').value = cfg.token || '';   // 原型演示；真机版从钥匙串读
  } catch (e) {}
  const m = document.getElementById('ghMsg'); if (m) m.textContent = '';
  document.getElementById('screenBackup').classList.add('show');
}
function closeBackup() {
  document.getElementById('screenBackup').classList.remove('show');
}
function saveGhConfig() {
  const repo = document.getElementById('ghRepo').value.trim();
  const token = document.getElementById('ghToken').value.trim();
  const m = document.getElementById('ghMsg');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { m.style.color = '#FF6961'; m.textContent = '仓库地址格式应为 用户名/仓库名'; return; }
  if (token.length < 20) { m.style.color = '#FF6961'; m.textContent = '令牌看起来太短，请检查'; return; }
  try { localStorage.setItem('fvGh', JSON.stringify({ repo: repo, token: token })); } catch (e) {}
  m.style.color = '#30D158'; m.textContent = '配置已保存（令牌只存本机）✓';
  showToast('GitHub 配置已保存');
}
function ghConfig() {
  try { return JSON.parse(localStorage.getItem('fvGh') || '{}'); } catch (e) { return {}; }
}
function restoreFromGh() {
  const cfg = ghConfig();
  if (!cfg.repo || !cfg.token) { showToast('请先填写并保存仓库与令牌'); return; }
  showToast('正在从 ' + cfg.repo + ' 拉取…');
  setTimeout(() => showToast('已从云端恢复最新备份（演示）'), 1200);
}
let backing = false;
function doBackup() {
  if (backing) return;
  const cfg = ghConfig();
  const info = document.getElementById('lastBackupInfo');
  if (!cfg.repo || !cfg.token) { showToast('请先填写并保存仓库与令牌'); return; }
  backing = true;
  const steps = ['正在加密数据库…', '正在上传 .fvault…', '完成 ✓'];
  let i = 0;
  info.textContent = steps[0];
  info.style.color = '#64D2FF';
  const t = setInterval(() => {
    i++;
    info.textContent = steps[i];
    if (i >= steps.length - 1) {
      clearInterval(t);
      info.style.color = '#30D158';
      setTimeout(() => { info.textContent = '刚刚'; info.style.color = 'rgba(255,255,255,.6)'; }, 1600);
      markBackedUp();
      showToast('已备份到 ' + cfg.repo + '（演示）');
      backing = false;
    }
  }, 700);
}

// ===== 锁定应用 =====
function lockNow() {
  relockApp();
  closeDetail(); closeEditor();
  showToast('已锁定');
}

// ===== 修改主密码 =====
function openChpw() {
  ['chpwOld', 'chpwNew', 'chpwNew2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const m = document.getElementById('chpwMsg'); if (m) m.textContent = '';
  document.getElementById('screenChpw').classList.add('show');
}
function closeChpw() { document.getElementById('screenChpw').classList.remove('show'); }
function saveChpw() {
  const oldP = document.getElementById('chpwOld').value;
  const p1 = document.getElementById('chpwNew').value.trim();
  const p2 = document.getElementById('chpwNew2').value.trim();
  const m = document.getElementById('chpwMsg');
  if (weakHash(oldP) !== fvPwHash) { m.style.color = '#FF6961'; m.textContent = '当前主密码不正确'; return; }
  if (p1.length < 4) { m.style.color = '#FF6961'; m.textContent = '新主密码至少 4 位'; return; }
  if (p1 !== p2) { m.style.color = '#FF6961'; m.textContent = '两次输入的新密码不一致'; return; }
  fvPwHash = weakHash(p1); fvPwSet = true; saveDemo();
  m.style.color = '#30D158'; m.textContent = '主密码已更新 ✓';
  showToast('主密码已更新');
  setTimeout(closeChpw, 800);
}

// ===== 加密备份（导出 .fvault）=====
function openExport() {
  document.getElementById('exportCount').textContent = CARDS.length + ' 条';
  document.getElementById('exportTotp').textContent = TOTP_ITEMS.length + ' 条';
  const m = document.getElementById('exportMsg'); if (m) m.textContent = '';
  document.getElementById('screenExport').classList.add('show');
}
function closeExport() { document.getElementById('screenExport').classList.remove('show'); }
function doExport() {
  const p1 = document.getElementById('exportPw').value.trim();
  const p2 = document.getElementById('exportPw2').value.trim();
  const m = document.getElementById('exportMsg');
  if (p1.length < 4) { m.style.color = '#FF6961'; m.textContent = '备份密码至少 4 位'; return; }
  if (p1 !== p2) { m.style.color = '#FF6961'; m.textContent = '两次输入的备份密码不一致'; return; }
  m.style.color = '#64D2FF'; m.textContent = '正在加密…';
  setTimeout(async () => {
    // 原型：base64 占位（真机版走 AES-256-GCM）；TOTP 密钥一律不落明文
    const payload = {
      v: 1, ts: Date.now(), cards: CARDS,
      totp: TOTP_ITEMS.map(t => ({ t: t.t, s: t.s, cat: t.cat, fav: t.fav, secret: '[REDACTED]' })),
      tags: TAGS,
    };
    const enc = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const blob = new Blob([enc], { type: 'application/octet-stream' });
    const fname = 'FallVault_' + new Date().toISOString().slice(0, 10) + '.fvault';
    // ① iOS App 里：调系统「文件」App，让用户自己挑保存位置（iCloud / 我的 iPhone / 其它）
    if (nativeSave(fname, enc, 'application/octet-stream')) {
      m.style.color = '#30D158'; m.textContent = '已保存到你选的位置 ✓';
      document.getElementById('exportHint').textContent = '刚刚导出';
      markBackedUp();
      showToast('备份已保存');
      return;
    }
    // ② 桌面浏览器：系统「另存为」对话框
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fname,
          types: [{ description: 'FallVault 备份', accept: { 'application/octet-stream': ['.fvault'] } }],
        });
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        m.style.color = '#30D158'; m.textContent = '已保存到你选的位置 ✓';
        document.getElementById('exportHint').textContent = '刚刚导出';
        markBackedUp();
        showToast('备份已保存');
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') { m.style.color = '#FF9F0A'; m.textContent = '已取消保存'; return; }
        // 其他异常 → 走回退方案
      }
    }
    // ② 回退：直接下载（iOS 会存进「文件」App 的下载项，之后可在文件里移动）
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    m.style.color = '#30D158'; m.textContent = '已导出 ✓（保存在「文件」App 的下载项）';
    document.getElementById('exportHint').textContent = '刚刚导出';
    markBackedUp();
    showToast('备份已导出');
  }, 900);
}

// ===== 恢复备份 =====
let restoreFileObj = null;
function openRestore() {
  restoreFileObj = null;
  document.getElementById('restoreFile').textContent = '选择 .fvault';
  document.getElementById('restorePw').value = '';
  const m = document.getElementById('restoreMsg'); if (m) m.textContent = '';
  document.getElementById('screenRestore').classList.add('show');
}
function closeRestore() { document.getElementById('screenRestore').classList.remove('show'); }
function pickRestoreFile() {
  if (hasNativeFiles()) {                              // iOS：调系统「文件」App
    try { window.webkit.messageHandlers.pickFile.postMessage('fvault'); return; } catch (e) {}
  }
  document.getElementById('restoreInput').click();     // 浏览器兜底
}
function onRestoreFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  restoreFileObj = f;
  document.getElementById('restoreFile').textContent = f.name;
}
// 原生「文件」App 选完 → Swift 回传内容
function onRestoreContent(name, text) {
  restoreFileObj = { name: name, text: text };
  const kb = Math.max(1, Math.round((text || '').length / 1024));
  document.getElementById('restoreFile').textContent = name + '（已读取约 ' + kb + ' KB）';
  showToast('已选择：' + name);
}
function doRestore() {
  const m = document.getElementById('restoreMsg');
  const pw = document.getElementById('restorePw').value.trim();
  if (!restoreFileObj) { m.style.color = '#FF6961'; m.textContent = '请先选择 .fvault 文件'; return; }
  if (pw.length < 4) { m.style.color = '#FF6961'; m.textContent = '请输入备份密码'; return; }
  m.style.color = '#64D2FF'; m.textContent = '正在解密…';
  setTimeout(() => {
    m.style.color = '#30D158'; m.textContent = '恢复完成 ✓（演示：已合并 ' + CARDS.length + ' 条账号）';
    document.getElementById('restoreHint').textContent = '已恢复';
    showToast('备份已恢复（演示）');
  }, 1100);
}

// ===== TOTP 导出 / 导入 =====
function openTotpIO() {
  document.getElementById('totpExportList').innerHTML = '';
  document.getElementById('totpImportBox').value = '';
  document.getElementById('screenTotpIO').classList.add('show');
}
function closeTotpIO() { document.getElementById('screenTotpIO').classList.remove('show'); }
function exportTotp() {
  const box = document.getElementById('totpExportList');
  const lines = TOTP_ITEMS.map(it =>
    'otpauth://totp/' + encodeURIComponent(it.t) + '?secret=[REDACTED]&issuer=FallVault&algorithm=SHA1&digits=6&period=30'
  );
  box.innerHTML = TOTP_ITEMS.map(it =>
    '<div class="drow"><span class="dk">' + it.t + '</span><span class="dv" style="color:#64D2FF;font-size:11px">otpauth://totp/' + encodeURIComponent(it.t) + '?...</span></div>'
  ).join('');
  // App 里：调系统「文件」App 让用户自己挑保存位置
  if (nativeSave('FallVault_TOTP.txt', lines.join('\n'), 'text/plain')) {
    showToast('已选择位置保存（密钥已隐藏）');
    return;
  }
  showToast('已生成 ' + TOTP_ITEMS.length + ' 条链接（密钥已隐藏）');
}
function importTotp() {
  const raw = document.getElementById('totpImportBox').value.trim();
  if (!raw) { showToast('请粘贴 otpauth:// 链接'); return; }
  const lines = raw.split(/\s+/).filter(s => s.indexOf('otpauth://') === 0);
  if (!lines.length) { showToast('没有识别到有效的 otpauth:// 链接'); return; }
  showToast('已导入 ' + lines.length + ' 条（演示）');
}

// ===== 更改壁纸 =====
let pendingWall = null;   // 待应用的自定义壁纸（dataURL）
function openWall() {
  pendingWall = null;
  renderWallGrid();
  document.getElementById('screenWall').classList.add('show');
}
function closeWall() { document.getElementById('screenWall').classList.remove('show'); }
function renderWallPreview() { /* 预览改由裁剪框承担（openCrop） */ }
function renderWallGrid() {
  document.getElementById('wallGrid').innerHTML = WALLPAPERS.map((w, i) =>
    '<div class="wall-thumb' + (i === wallIdx ? ' sel' : '') + '" data-i="' + i + '" onclick="setWall(' + i + ')" title="' + w.n + '"><img src="' + WALL_CDN + w.f + '" onerror="this.src=\'' + RES_BZ + w.f + '\'" alt=""></div>'
  ).join('');
}
function pickWallFile() { document.getElementById('wallInput').click(); }
// 上传的壁纸统一优化：按手机比例居中裁剪 → 缩放 → 压成 JPEG
// 理由：原图（相机照片可达 4000px）直接当 dataURL 会撑爆 localStorage、渲染卡顿，而且比例不对时会被 cover 裁歪
const WALL_TW = 828;                                     // 目标宽（≈ 手机 2x 分辨率，清晰又不臃肿）
const WALL_TH = Math.round(WALL_TW * 690 / 340);         // 目标高 = 手机原型比例（340×690）
// 核心：任意尺寸图 → 按手机比例居中裁剪 → 缩放 → JPEG。横图竖图都不变形、不撑爆存储
function optimizeWallImage(img, cb) {
  try {
    const tAspect = WALL_TW / WALL_TH;
    const sAspect = img.width / img.height;
    let sw, sh, sx, sy;
    if (sAspect > tAspect) {                              // 原图更宽 → 左右居中裁
      sh = img.height; sw = Math.round(sh * tAspect);
      sx = Math.round((img.width - sw) / 2); sy = 0;
    } else {                                              // 原图更高 → 上下居中裁
      sw = img.width; sh = Math.round(sw / tAspect);
      sx = 0; sy = Math.round((img.height - sh) / 2);
    }
    const c = document.createElement('canvas');
    c.width = WALL_TW; c.height = WALL_TH;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, WALL_TW, WALL_TH);
    cb(c.toDataURL('image/jpeg', 0.82));                  // 压缩：通常 80~250KB
  } catch (e) { cb(null); }
}
function onWallFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => openCrop(r.result);   // 选好图片 → 打开裁剪框让用户调位置
  r.readAsDataURL(f);
}

// ===== 壁纸裁剪框：拖动 / 缩放 / 应用 =====
let cropImgURL = null;                    // 正在编辑的图片（dataURL）
let cropNat = { w: 0, h: 0 };             // 原图尺寸
let cropBase = 1;                         // "铺满框"所需的基础缩放（cover）
let cropScale = 1;                        // 用户额外缩放（滑杆 1.00 ~ 4.00）
let cropOff = { x: 0, y: 0 };             // 图片左上角相对框的偏移（屏幕 px）
let cropDrag = null;

function cropStageSize() {
  const st = document.getElementById('cropStage');
  const r = st.getBoundingClientRect();
  return { w: r.width || 260, h: r.height || 528 };
}
function cropClamp() {                    // 图片必须始终盖满框 → 偏移限制在 [框-图, 0]
  const s = cropStageSize();
  const w = cropNat.w * cropBase * cropScale;
  const h = cropNat.h * cropBase * cropScale;
  cropOff.x = Math.max(Math.min(0, s.w - w), Math.min(0, cropOff.x));
  cropOff.y = Math.max(Math.min(0, s.h - h), Math.min(0, cropOff.y));
}
function cropRender() {
  const img = document.getElementById('cropImg');
  const k = cropBase * cropScale;
  img.style.width = (cropNat.w * k) + 'px';
  img.style.height = (cropNat.h * k) + 'px';
  img.style.transform = 'translate(' + cropOff.x + 'px,' + cropOff.y + 'px)';
  const z = document.getElementById('cropZoom');
  if (z) z.value = Math.round(cropScale * 100);
}
function openCrop(dataURL) {
  cropImgURL = dataURL;
  const ov = document.getElementById('cropOverlay');
  ov.classList.add('show');
  const img = document.getElementById('cropImg');
  img.onload = () => {
    cropNat = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
    const s = cropStageSize();
    cropBase = Math.max(s.w / cropNat.w, s.h / cropNat.h);   // cover：短边铺满
    cropScale = 1;
    cropOff = { x: (s.w - cropNat.w * cropBase) / 2, y: (s.h - cropNat.h * cropBase) / 2 };
    cropClamp(); cropRender();
  };
  img.src = dataURL;
  cropBind();
}
function closeCrop() {
  document.getElementById('cropOverlay').classList.remove('show');
  cropImgURL = null;
}
function resetCrop() {
  const s = cropStageSize();
  cropScale = 1;
  cropOff = { x: (s.w - cropNat.w * cropBase) / 2, y: (s.h - cropNat.h * cropBase) / 2 };
  cropClamp(); cropRender();
}
function zoomCrop(v) {
  const s = cropStageSize();
  const oldK = cropBase * cropScale;
  const next = Math.max(1, (parseInt(v, 10) || 100) / 100);
  const cx = s.w / 2, cy = s.h / 2;                        // 以框中心为锚点缩放
  const ix = (cx - cropOff.x) / oldK;
  const iy = (cy - cropOff.y) / oldK;
  cropScale = next;
  const nk = cropBase * cropScale;
  cropOff.x = cx - ix * nk;
  cropOff.y = cy - iy * nk;
  cropClamp(); cropRender();
}
function cropBind() {
  const st = document.getElementById('cropStage');
  if (st.dataset.bound === '1') return;
  st.dataset.bound = '1';
  st.addEventListener('pointerdown', e => {
    cropDrag = { x: e.clientX, y: e.clientY, ox: cropOff.x, oy: cropOff.y };
    try { st.setPointerCapture(e.pointerId); } catch (err) {}
  });
  st.addEventListener('pointermove', e => {
    if (!cropDrag) return;
    cropOff.x = cropDrag.ox + (e.clientX - cropDrag.x);
    cropOff.y = cropDrag.oy + (e.clientY - cropDrag.y);
    cropClamp(); cropRender();
  });
  const end = () => { cropDrag = null; };
  st.addEventListener('pointerup', end);
  st.addEventListener('pointercancel', end);
  st.addEventListener('wheel', e => {                      // 桌面滚轮缩放
    e.preventDefault();
    const z = document.getElementById('cropZoom');
    const nv = Math.max(100, Math.min(400, (parseInt(z.value, 10) || 100) + (e.deltaY < 0 ? 12 : -12)));
    z.value = nv; zoomCrop(nv);
  }, { passive: false });
}
function applyCrop() {
  if (!cropImgURL || !cropNat.w) { showToast('请先选择图片'); return; }
  const s = cropStageSize();
  const k = cropBase * cropScale;
  const img = document.getElementById('cropImg');
  const outW = _cropCb ? _cropCb.w : WALL_TW;
  const outH = _cropCb ? _cropCb.h : WALL_TH;
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // 框左上角对应到"原图坐标系"的位置，裁出可见区域
  ctx.drawImage(img, -cropOff.x / k, -cropOff.y / k, s.w / k, s.h / k, 0, 0, outW, outH);
  const out = c.toDataURL('image/jpeg', 0.85);
  if (_cropCb) {
    const cb = _cropCb; _cropCb = null;
    closeCrop();
    cb.fn(out);
    return;
  }
  pendingWall = out;
  try { localStorage.setItem('fvWallCustom', out); } catch (e) {}
  applyWallpaper('url(' + out + ')', '自定义');
  closeCrop(); closeWall();
  showToast('壁纸已应用 ✓');
}
function setWall(i) {
  wallIdx = i;
  wallFancy(WALLPAPERS[i].f, WALLPAPERS[i].n);
  renderWallGrid();
}
// 壁纸一律走这：网络（jsDelivr）优先 → 失败/6秒超时 → 本地 bz/。背景与染色都用它
function wallFancy(f, name) {
  const net = WALL_CDN + f;
  const local = RES_BZ + f;
  let used = false;
  const useLocal = () => {
    if (used) return; used = true;
    applyWallpaper(local, name);
    applyTint(local);
  };
  const useNet = () => {
    if (used) return; used = true;
    applyWallpaper(net, name);
    applyTint(net);          // 染色也走网络图（crossOrigin ✓）
  };
  const t = new Image();
  t.onload = useNet;
  t.onerror = useLocal;
  t.src = net;
  setTimeout(useLocal, 6000);   // 6 秒拿不到网络图 → 本地兜底
}
function applyWallpaper(img, name) {
  const phone = document.getElementById('phone');
  phone.style.setProperty('--wallpaper', img);
  phone.style.backgroundImage = 'linear-gradient(180deg, rgba(0,0,0,.30) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,.55) 100%), ' + img;
  document.getElementById('wallHint').textContent = name;
  applyTint(img);   // 提取壁纸主色 → 给玻璃染色
  showToast('壁纸：' + name);
}

// ===== 壁纸主色提取 → 玻璃染色（--tint）=====
// 把壁纸画到 8×8 的 canvas 求平均色，再按饱和度做"提色"：
// 越灰的壁纸推得越狠，避免染色完全看不出来；彩色壁纸只轻微加强。
function extractWallTint(src, cb) {
  const m = /^url\(['"]?([^'")]+)['"]?\)$/.exec(String(src).trim());
  const url = m ? m[1] : String(src).trim();
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const N = 8;
      const c = document.createElement('canvas');
      c.width = N; c.height = N;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, N, N);
      const d = ctx.getImageData(0, 0, N, N).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 8) continue;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      if (!n) { cb(null); return; }
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = (mx - mn) / 255;
      const boost = sat < 0.1 ? 1.75 : (sat < 0.25 ? 1.4 : 1.15);
      const push = v => Math.max(0, Math.min(255, Math.round((v - 128) * boost + 128)));
      cb([push(r), push(g), push(b)]);
    } catch (e) { cb(null); }
  };
  img.onerror = () => cb(null);
  img.src = url;
}

function applyTint(src) {
  const phone = document.getElementById('phone');
  if (!phone) return;
  extractWallTint(src, rgb => {
    if (!rgb) { phone.style.removeProperty('--tint'); window.__tint = ''; return; }
    phone.style.setProperty('--tint', rgb[0] + ',' + rgb[1] + ',' + rgb[2]);
    window.__tint = rgb.join(',');
  });
}

// ===== TOTP 时间偏移校正 =====
function openTotpOffset() {
  const r = document.getElementById('totpOffsetRange');
  if (r) r.value = totpOffset;
  document.getElementById('totpOffsetVal').textContent = totpOffset + ' 秒';
  document.getElementById('screenTotpOffset').classList.add('show');
}
function closeTotpOffset() { document.getElementById('screenTotpOffset').classList.remove('show'); }
function setTotpOffset(v) {
  totpOffset = parseInt(v, 10) || 0;
  document.getElementById('totpOffsetVal').textContent = (totpOffset > 0 ? '+' : '') + totpOffset + ' 秒';
  document.getElementById('totpOffsetHint').textContent = (totpOffset > 0 ? '+' : '') + totpOffset + ' 秒';
  TOTP_ITEMS.forEach(it => { it.lastCycle = -1; });   // 强制立刻换码，方便看效果
}
function resetTotpOffset() {
  setTotpOffset(0);
  const r = document.getElementById('totpOffsetRange'); if (r) r.value = 0;
  showToast('时间偏移已重置');
}

// ===== 设置项交互（演示反馈） =====
function settingTap(name) {
  showToast('「' + name + '」演示项');
}

// ===== 启动 =====
// 资源路径修正：沙盒(云更新后)下 logo 图标在 assets/ 子目录而非 ../assets/
(function fixLogo(){
  try { const lg = document.querySelector('#lockScreen img') || document.querySelector('.appicon img');
        if (lg) lg.src = RES_BASE + 'fallvault-logo.png'; } catch (e) {}
})();
// 打开即呈现锁屏：自动聚焦密码框 + 自动尝试一次 Face ID
applyTint(WALL_CDN + 'bz2.jpg');   // 启动默认壁纸（网络优先，异常时 tint 清除不影响显示）   // 启动时按默认壁纸给玻璃染色
lockInit(true);
// 预热人脸模型：第一次 Face ID 验证要加载 3 个模型（约 8MB），
// 冷加载会让首次识别"卡"几秒；这里启动后后台异步加载，首次验证时模型已在内存
setTimeout(() => { faceLoadModels().catch(() => {}); }, 900);

// 解锁输入框回车 → 密码验证
document.getElementById('unlockPw').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') unlockPw();
});

// 2FA 密钥输入 → 显示提示
const ftEl = document.getElementById('fTotp');
if (ftEl) ftEl.addEventListener('input', () => {
  document.getElementById('eTotpHint').style.display = ftEl.value.trim() ? 'block' : 'none';
});

// 自检（URL 带 ?debug=1 时启用：自动测试关键交互并输出到顶部）
if (location.search.includes('debug')) {
  // 自检期间捕获任何未处理错误，直接显示到顶部（便于定位崩溃点）
  window.addEventListener('error', e => {
    const p = document.querySelector('.hdr p');
    if (p) p.textContent += ' || JS-ERROR: ' + e.message + ' @' + (e.lineno || '?');
  });
  setTimeout(() => {
    const st = [
      'setChip=' + (typeof setChip === 'function'),
      'openTag=' + (typeof openTag === 'function'),
      'passStrength=' + (typeof passStrength === 'function'),
      'toggleFav=' + (typeof toggleFav === 'function'),
    ].join(' | ');

    // 1) 标签筛选 + 动画（pop / FLIP 滑动 / 交错入场 / data-t）
    const chipByName = n => {
      const t = TAGS.find(x => x.name === n);
      return t ? document.querySelector('.chips .chip[data-t="' + t.id + '"]') : null;
    };
    chipByName('工作')?.click();   // 工作（2 张从"全部"留存 → 走 FLIP）
    const filtered = document.querySelectorAll('#list .card').length;
    const hasPop = !!document.querySelector('.chips .chip.pop');
    const flipCount = document.querySelectorAll('#list .card[style*="translateY"]').length;
    chipByName('游戏')?.click();   // 游戏（Steam 新出现 → 走 enter）
    const enterCount = document.querySelectorAll('#list .card.enter').length;
    const dataT = document.querySelectorAll('#list .card[data-t]').length;
    chipByName('收藏')?.click();   // 收藏标签（哔哩哔哩 + Github）
    const favCount = document.querySelectorAll('#list .card').length;
    chipByName('全部')?.click();   // 全部
    const all = document.querySelectorAll('#list .card').length;

    // 1b) 标签系统：新建 → 改名 → 换图标 → 换颜色 → 标签页渲染 → 跳转 → 验证码筛选 → 删除
    const tagCount0 = TAGS.length;
    openTagEditor('');                                    // 新建
    document.getElementById('tagNameInput').value = '测试标签';
    pickTagIcon('car');
    pickTagColor('#AF52DE');                              // 选颜色
    saveTagEditor();
    const colorCells = document.querySelectorAll('#tagColorGrid .color-cell').length;
    const tagAdded = TAGS.length === tagCount0 + 1 && TAGS.some(t => t.name === '测试标签' && t.icon === 'car' && t.color === '#AF52DE');
    const testTagId = (TAGS.find(t => t.name === '测试标签') || {}).id;
    openTagEditor(testTagId);                             // 改名 + 换图标 + 换色
    document.getElementById('tagNameInput').value = '测试改名';
    pickTagIcon('plane');
    pickTagColor('#00C7BE');
    saveTagEditor();
    const tagRenamed = TAGS.some(t => t.name === '测试改名' && t.icon === 'plane' && t.color === '#00C7BE');
    renderTags();
    const tagCards = document.querySelectorAll('#tagList .tag-card').length;
    const tagIcons = document.querySelectorAll('#tagList .tag-ic svg').length;
    const tagEdits = document.querySelectorAll('#tagList .tag-edit').length;
    const tagFixed = document.querySelectorAll('#tagList .tag-fixed').length;
    const noAddRow = !document.querySelector('#tagList .tag-add');                  // 底部"新建标签"行已移除
    const plusBtn = document.querySelector('#page-tags .title-row .search-btn');    // 右上角应是 + 号
    const tagPlusOk = !plusBtn;   // 用户要求：标签页不显示新建+号（新建入口移到底栏扇叶）
    const chipIconColored = (() => {                                                // chip 图标应跟随标签色
      const el = document.querySelector('#vaultChips .chip[data-t="' + testTagId + '"] .chip-ic');
      return !!el && (el.style.getPropertyValue('--tc') || '').toUpperCase() === '#00C7BE';
    })();
    openTag(TAGS.find(t => t.name === '工作').id);        // 标签页点击 → 跳密码库 + 选中
    const jumped = selected === 0 && tagById(activeTagId).name === '工作' && document.querySelectorAll('#list .card').length === 1;
    setChip('fav', true);                                 // 验证码页标签筛选（只作用于验证码那组）
    const totpFav = document.querySelectorAll('#totpList .totp-card').length;
    setChip('all', true);
    const totpAll = document.querySelectorAll('#totpList .totp-card').length;
    const totpChipCount = document.querySelectorAll('#totpChips .chip').length;
    openTagEditor(TAGS.find(t => t.name === '测试改名').id);  // 删除
    deleteTag();
    const tagDeleted = !TAGS.some(t => t.name === '测试改名') && TAGS.length === tagCount0;

    // 1i) 标签页跳转 / 切页重置：跳转只高亮密码库那组；切换页面后顶部标签恢复「全部」
    const workId2 = TAGS.find(t => t.name === '工作').id;
    setSelected(0);
    openTag(workId2);
    const vcOnCnt = document.querySelectorAll('#vaultChips .chip.on').length;
    const vcOnEl = document.querySelector('#vaultChips .chip.on');
    const totpStillAll = document.querySelectorAll('#totpChips .chip.on').length === 1 &&
                         (document.querySelector('#totpChips .chip.on') || {}).dataset.t === 'all';
    const jumpOnlyVault = vcOnCnt === 1 && !!vcOnEl && vcOnEl.dataset.t === workId2 && totpStillAll;
    setSelected(1);   // 切到验证码页 → 标签应恢复「全部」
    const switchResetOK = activeTagId === 'all' &&
                          document.querySelectorAll('#totpChips .chip.on').length === 1 &&
                          (document.querySelector('#totpChips .chip.on') || {}).dataset.t === 'all';
    setSelected(0);   // 回密码库 → 同样恢复「全部」
    const backResetOK = activeTagId === 'all' &&
                        document.querySelectorAll('#vaultChips .chip.on').length === 1 &&
                        (document.querySelector('#vaultChips .chip.on') || {}).dataset.t === 'all';

    // 1j) 设置页：11 项齐全 + 子页存在 + 关键校验与交互
    const setItems = [...document.querySelectorAll('#settingsList .row .k')].map(e => e.textContent);
    const needItems = ['修改主密码', '免验证时长', '锁定应用', '加密备份', '恢复备份', 'TOTP 导出 / 导入', 'GitHub 备份', '更改壁纸', 'TOTP 时间偏移校正'];
    const setAll = needItems.every(n => setItems.includes(n));
    const subPages = ['screenChpw', 'screenExport', 'screenRestore', 'screenTotpIO', 'screenWall', 'screenTotpOffset', 'screenGrace', 'screenBackup'];
    const subOK = subPages.every(id => !!document.getElementById(id));
    const origHashNow = fvPwHash;                     // 临时设成已知密码来测校验（测完恢复）
    fvPwHash = weakHash('test1234');
    openChpw();
    document.getElementById('chpwOld').value = 'zzz';
    document.getElementById('chpwNew').value = 'abcd1234';
    document.getElementById('chpwNew2').value = 'abcd1234';
    saveChpw();
    const chpwRejectOld = document.getElementById('chpwMsg').textContent.indexOf('当前主密码不正确') >= 0;
    document.getElementById('chpwOld').value = 'test1234';
    document.getElementById('chpwNew').value = 'ab';
    document.getElementById('chpwNew2').value = 'ab';
    saveChpw();
    const chpwRejectShort = document.getElementById('chpwMsg').textContent.indexOf('至少 4 位') >= 0;
    document.getElementById('chpwNew').value = 'abcd1234';
    document.getElementById('chpwNew2').value = 'xyz999';
    saveChpw();
    const chpwRejectMismatch = document.getElementById('chpwMsg').textContent.indexOf('不一致') >= 0;
    document.getElementById('chpwNew2').value = 'abcd1234';
    saveChpw();
    const chpwChanged = fvPwHash === weakHash('abcd1234');
    fvPwHash = origHashNow; saveDemo();               // 恢复原主密码摘要
    closeChpw();
    openWall();                                       // 壁纸网格 + 应用
    const wallThumbs = document.querySelectorAll('#wallGrid .wall-thumb').length;
    setWall(1);
    const wallApplied = document.getElementById('wallHint').textContent === WALLPAPERS[1].n;
    setWall(0);                                       // 还原
    applyTint(WALL_CDN + 'bz2.jpg');   // 启动默认壁纸（网络优先，异常时 tint 清除不影响显示）                // 还原染色（setWall 的取色是异步的，不补这一句会被上一次的黑色壁纸覆盖）
    // 自定义壁纸必须用 url() 包裹（否则 CSS 判无效 → 上传后无效果）
    const testDataURL = 'data:image/png;base64,iVBORw0KGgo=';
    applyWallpaper('url(' + testDataURL + ')', '自定义');
    const customWallOK = (document.getElementById('phone').style.getPropertyValue('--wallpaper') || '').indexOf('url(data:image/png') === 0;
    setWall(0);
    closeWall();
    openTotpOffset(); setTotpOffset(-7);              // TOTP 偏移
    const offsetOK = totpOffset === -7 && document.getElementById('totpOffsetHint').textContent.indexOf('-7') >= 0;
    resetTotpOffset();
    closeTotpOffset();
    openExport();                                     // 导出页数据
    const exportOK = document.getElementById('exportCount').textContent.indexOf('条') >= 0;
    closeExport();
    // GitHub 备份：仓库格式校验 + 令牌校验 + 保存 + 教程步骤
    openBackup();
    document.getElementById('ghRepo').value = 'bad format';
    document.getElementById('ghToken').value = 'x'.repeat(30);
    saveGhConfig();
    const ghRejectRepo = document.getElementById('ghMsg').textContent.indexOf('用户名/仓库名') >= 0;
    document.getElementById('ghRepo').value = 'myuser/vault-backup';
    document.getElementById('ghToken').value = 'short';
    saveGhConfig();
    const ghRejectToken = document.getElementById('ghMsg').textContent.indexOf('太短') >= 0;
    document.getElementById('ghToken').value = 'github_pat_abcdefghijklmnopqrstuvwxyz';
    saveGhConfig();
    const ghSaved = ghConfig().repo === 'myuser/vault-backup';
    const ghTutorial = document.querySelectorAll('#screenBackup .tut-step').length;
    closeBackup();
    localStorage.removeItem('fvGh');                  // 清理测试配置

    // 1k) 布局完整性：列表是 flex 列，子元素必须不被压扁（行高足够、无重叠、无零高元素）
    const listKids = [...document.querySelectorAll('#settingsList > *')];
    const kidHeights = listKids.map(el => Math.round(el.getBoundingClientRect().height));
    const noSquash = kidHeights.every(h => h >= 12);   // 分组标题约 17px、行 44px；被 flex 压扁时会掉到 0~10px
    const setRowsTall = [...document.querySelectorAll('#settingsList .row')].every(r => r.getBoundingClientRect().height >= 36);

    // 1l) App 全屏模式滚动：注入 .app → 设置页列表必须「内容超出且能滚到底、最后一行在 tab 栏上方」
    document.documentElement.classList.add('app');
    const sl = document.getElementById('settingsList');
    const appScrollable = sl.scrollHeight > sl.clientHeight;      // 内容超出容器（min-height:0 生效）
    sl.scrollTop = 99999;                                          // 滚到底
    const appScrolled = sl.scrollTop > 0;                          // 真的滚动了
    const rows = sl.querySelectorAll('.row');
    const lastRow = rows[rows.length - 1];
    const tabTop = document.getElementById('tabbar').getBoundingClientRect().top;
    const appLastClear = lastRow.getBoundingClientRect().bottom <= tabTop;   // 最后一行完整在 tab 上方
    sl.scrollTop = 0;
    document.documentElement.classList.remove('app');
    const tagRowsTall = [...document.querySelectorAll('#tagList .tag-card')].every(r => r.getBoundingClientRect().height >= 40);
    const layoutOK = noSquash && setRowsTall && tagRowsTall;
    const appScrollOK = appScrollable && appScrolled && appLastClear;   // App 全屏下设置页能滚到底、末行不被 tab 挡

    // 1c) chips 滑块：选中不推动整页 + 内容可滑 + 鼠标拖拽有效
    const docScrollBefore = document.documentElement.scrollLeft;
    const lastChipEl = document.querySelector('#vaultChips .chip:last-child');
    if (lastChipEl) lastChipEl.click();   // 点最后一个标签（最容易把页面推走；不写死名字，标签数量会变）
    const docScrollAfter = document.documentElement.scrollLeft;
    const pageNotPushed = docScrollAfter === 0 && docScrollBefore === 0;
    const vcBox = document.getElementById('vaultChips');
    const chipsScrollable = vcBox.scrollWidth > vcBox.clientWidth;
    let dragMoved = 'N/A', dragBound = false, dragDebug = '';
    try {
      const vcR = vcBox.getBoundingClientRect();
      // 合成 PointerEvent 的 clientX 在部分 WebView 里读不到 → 用 defineProperty 强制写入
      const mk = (type, x) => {
        const ev = new PointerEvent(type, { bubbles: true, cancelable: true });
        try { Object.defineProperty(ev, 'clientX', { value: x, configurable: true }); } catch (e) {}
        try { Object.defineProperty(ev, 'clientY', { value: vcR.top + 15, configurable: true }); } catch (e) {}
        try { Object.defineProperty(ev, 'buttons', { value: 1, configurable: true }); } catch (e) {}   // 按下状态（否则被"松手兜底"误判）
        return ev;
      };
      vcBox.dispatchEvent(mk('pointerdown', vcR.left + 200));
      window.dispatchEvent(mk('pointermove', vcR.left + 180));   // 先动 20px（> 8px 阈值）→ 进入拖动态
      dragBound = vcBox.classList.contains('dragging');   // 拖动中应挂上 dragging
      const beforeSL = vcBox.scrollLeft;
      window.dispatchEvent(mk('pointermove', vcR.left + 110));
      dragMoved = vcBox.scrollLeft > 0;
      dragDebug = Math.round(beforeSL) + '→' + Math.round(vcBox.scrollLeft);
      window.dispatchEvent(mk('pointerup', vcR.left + 110));
    } catch (e) { dragMoved = 'ERR'; }
    // 强制回到「全部」（直接改状态 + 重渲染，不依赖点击查找）
    activeTagId = 'all'; renderChips(); renderCards(); renderTOTP(); renderTags();

    // 1d) chips 两端模糊遮罩（滚到边界应自动隐藏对应侧）+ 锁屏分层（模糊壁纸层，不透应用内容）
    const vcRail = vcBox.parentElement;
    const prevSB = vcBox.style.scrollBehavior;
    vcBox.style.scrollBehavior = 'auto';   // 瞬时滚动（smooth 是异步的，读不到最终位置）
    vcBox.scrollLeft = 0; syncChipEdges();
    const edgeRightOn = vcRail.classList.contains('edge-r') && !vcRail.classList.contains('edge-l');
    vcBox.scrollLeft = vcBox.scrollWidth; syncChipEdges();
    const edgeLeftOn = vcRail.classList.contains('edge-l') && !vcRail.classList.contains('edge-r');
    vcBox.scrollLeft = 0; syncChipEdges();
    vcBox.style.scrollBehavior = prevSB;
    const lockEl2 = document.getElementById('lockScreen');
    const lockBgEl = lockEl2.querySelector('.lock-bg');
    const lockBgCS = lockBgEl ? getComputedStyle(lockBgEl) : null;
    const lockHasWallLayer = !!lockBgCS && lockBgCS.backgroundImage.indexOf('bz2.jpg') >= 0;
    const lockBgBlur = lockBgCS ? (lockBgCS.filter || '').match(/blur\((\d+(?:\.\d+)?)px\)/) : null;
    const lockNoBackdrop = !(getComputedStyle(lockEl2).backdropFilter || '').includes('blur');   // 关键：不再糊背后内容
    const lockSeeThrough = !!lockBgBlur && parseFloat(lockBgBlur[1]) <= 24;                       // 壁纸模糊 → 隐隐约约

    // 1e) chips 可点击性诊断：残留状态 + 模拟真实点击序列（pointerdown→up→click）
    const dbgChip = document.querySelector('#vaultChips .chip[data-t="t3"]');
    const dbgBox = document.getElementById('vaultChips');
    const chipState = 'dragging=' + dbgBox.classList.contains('dragging') + ' pe=' + (dbgChip ? getComputedStyle(dbgChip).pointerEvents : '?');
    let realClickOK = 'no-chip';
    if (dbgChip) {
      activeTagId = 'all'; renderChips(); renderCards(); renderTOTP();
      const dcr = dbgChip.getBoundingClientRect();
      const mkev = (type, x, y) => { const e = new PointerEvent(type, { bubbles: true, cancelable: true }); try { Object.defineProperty(e, 'clientX', { value: x }); Object.defineProperty(e, 'clientY', { value: y }); } catch (err) {} return e; };
      dbgChip.dispatchEvent(mkev('pointerdown', dcr.left + 5, dcr.top + 5));
      window.dispatchEvent(mkev('pointerup', dcr.left + 5, dcr.top + 5));
      dbgChip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      realClickOK = tagById(activeTagId).id === 't3';
    }
    activeTagId = 'all'; renderChips(); renderCards(); renderTOTP(); renderTags();

    // 1f) 复现「标签点不了」：手抖点击（位移几像素）+ 拖动后立刻点击
    const mkE = (type, x, y, btns) => { const e = new PointerEvent(type, { bubbles: true, cancelable: true }); try { Object.defineProperty(e, 'clientX', { value: x, configurable: true }); Object.defineProperty(e, 'clientY', { value: y, configurable: true }); Object.defineProperty(e, 'buttons', { value: btns === undefined ? 1 : btns, configurable: true }); } catch (err) {} return e; };
    activeTagId = 'all'; renderChips(); renderCards(); renderTOTP();
    // ① 手抖点击：按下后手滑 5px 再松手（真实鼠标点击很常见）
    const chipT2 = document.querySelector('#vaultChips .chip[data-t="t2"]');
    const tr2 = chipT2.getBoundingClientRect();
    chipT2.dispatchEvent(mkE('pointerdown', tr2.left + 10, tr2.top + 5));
    window.dispatchEvent(mkE('pointermove', tr2.left + 15, tr2.top + 5));
    window.dispatchEvent(mkE('pointerup', tr2.left + 15, tr2.top + 5));
    chipT2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: tr2.left + 15, clientY: tr2.top + 5 }));
    const shakyClickOK = tagById(activeTagId).id === 't2';
    // ② 拖动后立刻点另一个标签（用位置取，不写死 id —— 标签数量会随演示数据变化）
    activeTagId = 'all'; renderChips(); renderCards(); renderTOTP();
    const allChips = [...document.querySelectorAll('#vaultChips .chip')];
    const chipT4 = allChips[allChips.length - 1];
    const r4 = chipT4.getBoundingClientRect();
    chipT4.dispatchEvent(mkE('pointerdown', r4.left + 60, r4.top + 5));
    window.dispatchEvent(mkE('pointermove', r4.left - 60, r4.top + 5));
    window.dispatchEvent(mkE('pointerup', r4.left - 60, r4.top + 5));
    const chipT1 = allChips[1];   // 取第二个（收藏）——第一个是「全部」，点了状态不变，测不出效果
    const r1 = chipT1.getBoundingClientRect();
    chipT1.dispatchEvent(mkE('pointerdown', r1.left + 10, r1.top + 5));
    window.dispatchEvent(mkE('pointerup', r1.left + 10, r1.top + 5));
    chipT1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r1.left + 10, clientY: r1.top + 5 }));
    const afterDragClickOK = activeTagId === chipT1.dataset.t;   // 拖动后点谁就该选中谁
    activeTagId = 'all'; renderChips(); renderCards(); renderTOTP(); renderTags();

    // 1g) 关键保证：拖动中 / 拖动后标签依然可点（旧版就是死在这 —— dragging 让 chip pointer-events:none）
    activeTagId = 'all'; renderChips(); renderCards(); renderTOTP();
    const chipX = document.querySelector('#vaultChips .chip[data-t="t2"]');
    const rx = chipX.getBoundingClientRect();
    vcBox.dispatchEvent(mkE('pointerdown', rx.left + 50, rx.top + 5));
    window.dispatchEvent(mkE('pointermove', rx.left - 60, rx.top + 5));   // 真拖 110px → dragging 挂上
    const dragOnPe = getComputedStyle(chipX).pointerEvents;               // 拖动中 chip 仍必须可点
    const dragNotBlocking = vcBox.classList.contains('dragging') && dragOnPe !== 'none';
    window.dispatchEvent(mkE('pointerup', rx.left - 60, rx.top + 5));
    chipX.dispatchEvent(mkE('pointerdown', rx.left + 5, rx.top + 5));     // 拖动后立刻点标签
    window.dispatchEvent(mkE('pointerup', rx.left + 5, rx.top + 5));
    chipX.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: rx.left + 5, clientY: rx.top + 5 }));
    const dragThenClickOK = tagById(activeTagId).id === 't2';
    activeTagId = 'all'; renderChips(); renderCards(); renderTOTP(); renderTags();

    // 1h) 松手事件丢失（在窗口外松手 / WebView 不派发 pointerup）：绝不残留任何阻塞点击的状态
    activeTagId = 'all'; renderChips(); renderCards(); renderTOTP();
    vcBox.dispatchEvent(mkE('pointerdown', rx.left + 50, rx.top + 5));
    window.dispatchEvent(mkE('pointermove', rx.left - 60, rx.top + 5));      // 拖动 → dragging
    window.dispatchEvent(mkE('pointermove', rx.left - 60, rx.top + 5, 0));   // buttons=0 → 鼠标已松开（pointerup 丢失）
    const lostUpClean = getComputedStyle(chipX).pointerEvents !== 'none';    // 关键：任何时候都不阻塞点击
    activeTagId = 'all'; renderChips(); renderCards(); renderTOTP(); renderTags();

    // 2) (免验证功能已删除)

    // 3) 详情页：收藏切换 + 强度条 + 密码历史
    openDetail('Github');
    const detailName = document.getElementById('detailTitle').textContent;
    const favBefore = CARDS.find(c => c.t === 'Github').fav;
    toggleFav();
    const favAfter = CARDS.find(c => c.t === 'Github').fav;
    toggleFav(); // 还原
    const sbar = document.querySelector('#detailBody .sbar i');
    const strength = sbar ? sbar.style.width : '无';
    showHistory();
    const histCount = document.querySelectorAll('#histList .drow').length;
    closeHistory();
    closeDetail();

    // 4) 收藏置顶验证：把 Steam 设为收藏 → 应排到最前
    const steam = CARDS.find(c => c.t === 'Steam');
    steam.fav = true;
    renderCards();
    const firstCard = document.querySelector('#list .card .meta .t').textContent;
    steam.fav = false;
    renderCards();

    // 5) 图标库
    const iconCount = Object.keys(LUCIDE).length;
    const barIcons = document.querySelectorAll('#tabbar .tb-slot .ic svg').length;

    // 6) 实时验证码：卡片码与引擎一致 + 小圆环/秒数在动（异步复测）
    const t0 = TOTP_ITEMS.find(x => x.key === 't0');
    const mEl = document.getElementById('mcode-t0');
    const mcodeOK = !!mEl && mEl.textContent === t0.code;
    const mbar1 = document.querySelector('#mring-t0 .mbar');
    const off1 = mbar1 ? mbar1.getAttribute('stroke-dashoffset') : 'NOEL';
    const secEl1 = document.getElementById('sec-t0');
    const s1 = secEl1 ? secEl1.textContent : 'NO';
    const dcodeExist = !!document.getElementById('dcode-t1');
    setTimeout(() => {
      const mbar2 = document.querySelector('#mring-t0 .mbar');
      const off2 = mbar2 ? mbar2.getAttribute('stroke-dashoffset') : 'NOEL';
      const secEl2 = document.getElementById('sec-t0');
      const s2 = secEl2 ? secEl2.textContent : 'NO';
      document.querySelector('.hdr p').textContent +=
        ' || 验证码实时: 卡片一致=' + mcodeOK + ' 圆环=' + String(off1).slice(0, 7) + '→' + String(off2).slice(0, 7)
        + ' 秒=' + s1 + '→' + s2 + ' 详情页码=' + dcodeExist;
    }, 1500);

    // 7) 编辑页（分类 / 历史 / 收藏 / 无标签无附件）
    openEditor(1);   // 编辑 Github
    const edCats = document.querySelectorAll('#eCats .chip2').length;
    const edCatsList = Array.from(document.querySelectorAll('#eCats .chip2')).map(x => x.textContent).join(',');
    const edHistDisp = document.getElementById('eHistWrap').style.display;
    const edFavOn = document.getElementById('eFavBtn').classList.contains('on');
    const noTagsUI = !document.getElementById('eTags');
    const noAttachUI = !document.getElementById('eAttach');
    closeEditor();
    // 新建 → 保存 → 清理
    openEditor();
    document.getElementById('fName').value = '测试新账号';
    document.getElementById('fUser').value = 'test@example.com';
    saveEntry();
    const newOK = CARDS.some(c => c.t === '测试新账号');
    const ni = CARDS.findIndex(c => c.t === '测试新账号');
    if (ni >= 0) CARDS.splice(ni, 1);
    renderChips();
    renderCards();
    renderTags();

    // 8) 左滑：多卡片测试（用户报告只有第一张有效）
    // 强制回到「全部」确保 5 张卡都在（直接改状态 + 重渲染，不依赖点击查找）
    activeTagId = 'all'; renderChips(); renderCards(); renderTOTP(); renderTags();
    const swWraps = document.querySelectorAll('#list .swipe-wrap');
    const swWrap = swWraps[0];
    const swActions = swWrap ? swWrap.querySelector('.swipe-actions') : null;
    const swBtns = swWrap ? swWrap.querySelectorAll('.swipe-actions .sw-btn').length : 0;
    const swIcons = swWrap ? swWrap.querySelectorAll('.swipe-actions .sw-btn svg').length : 0;
    const swBtnW = swWrap ? getComputedStyle(swWrap.querySelector('.sw-btn')).width : '?';
    const swWidth0 = swActions ? getComputedStyle(swActions).width : '?';

    let swipePartial = false, swipeFirst = false, swipeThird = false, swipeLast = false, swipeBack = false;
    let popStep1 = false, popStep2 = false, popStep3 = false;

    function peTo(card, type, x, y) {
      card.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true }));
    }
    // 对指定卡片模拟拖动 dist 像素后松手，返回是否展开
    function trySwipe(wrap, dist, release) {
      if (!wrap) return null;
      const card = wrap.querySelector('.card');
      const actions = wrap.querySelector('.swipe-actions');
      const r = card.getBoundingClientRect();
      peTo(card, 'pointerdown', r.left + 200, r.top + 20);
      peTo(card, 'pointermove', r.left + 200 - dist, r.top + 20);
      const midW = actions ? actions.style.width : '';
      if (release !== false) peTo(card, 'pointerup', r.left + 200 - dist, r.top + 20);
      return { open: wrap.classList.contains('sw-open'), midW, card };
    }
    const w0 = swWraps[0], w1 = swWraps[1], w2 = swWraps[2], wLast = swWraps[swWraps.length - 1];
    const rFirst = w0 ? trySwipe(w0, 180) : null;
    swipeFirst = !!(rFirst && rFirst.open && rFirst.card.style.transform.indexOf('-146') >= 0);
    if (w0) swipeReset(w0);
    const rThird = w2 ? trySwipe(w2, 180) : null;
    swipeThird = !!(rThird && rThird.open && rThird.card.style.transform.indexOf('-146') >= 0);
    if (w2) swipeReset(w2);
    const rLast = wLast ? trySwipe(wLast, 180) : null;
    swipeLast = !!(rLast && rLast.open);
    if (wLast) swipeReset(wLast);
    // 拖一点（不到一半）→ 按钮区应立刻显示 40px，松手回弹归零
    const rPart = w1 ? trySwipe(w1, 40, false) : null;
    swipePartial = !!(rPart && rPart.midW === '40px');
    if (rPart) peTo(rPart.card, 'pointerup', 0, 0);
    swipeBack = !!(w1 && !w1.classList.contains('sw-open') && w1.querySelector('.swipe-actions').style.width === '0px');
    if (w1) swipeReset(w1);
    // 逐个弹入：露出一点点就弹（拖 10px 编辑弹 / 60px 收藏也弹 / 110px 删除也弹）
    const wrapT = w0;
    if (wrapT) {
      const tCard = wrapT.querySelector('.card');
      const tBtns = wrapT.querySelectorAll('.sw-btn');
      const tb = (x) => peTo(tCard, 'pointermove', x, tCard.getBoundingClientRect().top + 20);
      const rr = tCard.getBoundingClientRect();
      peTo(tCard, 'pointerdown', rr.left + 200, rr.top + 20);
      tb(rr.left + 190);   // 只拖 10px
      popStep1 = tBtns[2].classList.contains('pop') && !tBtns[1].classList.contains('pop') && !tBtns[0].classList.contains('pop');
      tb(rr.left + 140);   // 拖 60px
      popStep2 = tBtns[2].classList.contains('pop') && tBtns[1].classList.contains('pop') && !tBtns[0].classList.contains('pop');
      tb(rr.left + 90);    // 拖 110px
      popStep3 = tBtns[0].classList.contains('pop') && tBtns[1].classList.contains('pop') && tBtns[2].classList.contains('pop');
      peTo(tCard, 'pointerup', rr.left + 90, rr.top + 20);
      swipeReset(wrapT);
    }

    // 9) 切页验证（毛玻璃优化：只切 active 类 + 不重建 DOM + 页面常驻渲染）
    const vaultCardsBefore = document.querySelectorAll('#list .card').length;
    const vaultCardsRef = document.querySelector('#list .card');
    setSelected(1);   // → 验证码
    const totpIsActive = document.getElementById('page-totp').classList.contains('active');
    const vaultStillRendered = getComputedStyle(document.getElementById('page-vault')).opacity;
    setSelected(0);   // → 密码库
    const vaultCardsAfter = document.querySelectorAll('#list .card').length;
    const sameNode = vaultCardsRef === document.querySelector('#list .card');   // DOM 未被重建
    const activeCount = document.querySelectorAll('.content.active').length;

    // 10) 详情页滚动实测
    openDetail('Github');
    const dbody = document.getElementById('detailBody');
    const dScrollH = dbody.scrollHeight;
    const dClientH = dbody.clientHeight;
    const dOverflow = getComputedStyle(dbody).overflowY;
    dbody.scrollTop = 400;
    const dAfter = dbody.scrollTop;
    const dRows = document.querySelectorAll('#detailBody .drow').length;
    const dSecs = Array.from(document.querySelectorAll('#detailBody .dsec')).map(x => x.textContent).join('/');
    closeDetail();

    // 11) 锁屏：首次设置主密码 → 解锁模式 → Face ID 显隐 → 错误计数 / 锁定
    const origPwSet = fvPwSet, origFace = fvFace, origHash = fvPwHash;   // 存原始演示状态
    // ① 首次设置：太短报错
    fvPwSet = false; fvFace = false; fvPwHash = '';
    lockInit(false);
    const setupShown = document.getElementById('lockScreen').classList.contains('mode-setup');
    document.getElementById('newPw').value = '12';
    document.getElementById('newPw2').value = '12';
    doSetup();
    const shortErr = document.getElementById('setupMsg').textContent.indexOf('至少 4 位') >= 0;
    // ② 两次不一致报错
    document.getElementById('newPw').value = 'abcd';
    document.getElementById('newPw2').value = 'abce';
    doSetup();
    const mismatchErr = document.getElementById('setupMsg').textContent.indexOf('不一致') >= 0;
    // ③ 正确设置 + 开启 Face ID
    document.getElementById('newPw').value = 'abcd';
    document.getElementById('newPw2').value = 'abcd';
    document.getElementById('newFaceSw').classList.add('on');
    doSetup();
    const setupOk = fvPwSet === true && fvFace === true;
    // ④ 解锁模式：密码显隐 + 错误计数 + 三次锁定
    lockInit(false);
    const unlockMode = document.getElementById('lockScreen').classList.contains('mode-unlock');
    const faceVisibleWhenOn = document.getElementById('faceBox').style.display !== 'none';
    const eyeHasIcon = !!document.querySelector('#pwEye svg');
    toggleLockPw();
    const pwShown = document.getElementById('unlockPw').type === 'text';
    toggleLockPw();
    const pwBackHidden = document.getElementById('unlockPw').type === 'password';
    const lockInp = document.getElementById('unlockPw');
    lockInp.value = 'wrong';
    unlockPw(); const failCount1 = lockFails === 1;
    unlockPw(); const failCount2 = lockFails === 2;
    unlockPw();
    const lockedNow = lockUntil > Date.now() && lockInp.disabled === true;
    const lockCountdownMsg = document.getElementById('lockMsg').textContent;
    lockUntil = 0; clearInterval(lockTimer); lockInp.disabled = false;
    document.getElementById('pwWrap').classList.remove('locked', 'err');
    document.getElementById('lockMsg').classList.remove('show');
    lockFails = 0;
    // ⑤ 正确密码 → 绿勾 + 解锁
    lockInp.value = 'abcd';
    unlockPw();
    const pwOkAnim = document.getElementById('pwWrap').classList.contains('ok');
    // ⑥ 布局一致性：设置模式 vs 解锁模式 的密码框宽度与中心线必须一致
    fvPwSet = false; lockInit(false);
    const rSetup = document.getElementById('pwWrapNew').getBoundingClientRect();
    fvPwSet = true; lockInit(false);
    const rUnlock = document.getElementById('pwWrap').getBoundingClientRect();
    const layoutSame = Math.abs(rSetup.width - rUnlock.width) < 2
      && Math.abs((rSetup.left + rSetup.width / 2) - (rUnlock.left + rUnlock.width / 2)) < 2;
    const lockW = Math.round(rUnlock.width);
    // ⑦ Face ID 关闭 → 面容区整个不显示
    fvFace = false;
    lockInit(false);
    const faceHiddenWhenOff = document.getElementById('faceBox').style.display === 'none';
    // 恢复原始演示状态（延时足够长，等所有 finishUnlock 定时器跑完再复位）
    fvPwSet = origPwSet; fvFace = origFace; fvPwHash = origHash;
    saveDemo(); updateFaceRow();
    setTimeout(() => { lockInit(false); }, 1500);

    document.querySelector('.hdr p').textContent =
      'SELFCHECK: ' + st + ' || 筛选"工作"=' + filtered + ' 收藏=' + favCount + ' 全部=' + all
      + ' || 标签: 新建=' + tagAdded + ' 改名=' + tagRenamed + ' 颜色表=' + colorCells + ' chip图标色=' + chipIconColored + ' 卡=' + tagCards + ' 图标=' + tagIcons + ' 编辑钮=' + tagEdits + ' 固定=' + tagFixed + ' 无新建行=' + noAddRow + ' 右上角加号=' + tagPlusOk + ' 跳转选中=' + jumped + ' 删除=' + tagDeleted + ' 跳转只高亮密码库=' + jumpOnlyVault + ' 切页恢复全部=' + switchResetOK + ' 回库恢复全部=' + backResetOK
      + ' || 验证码标签: chip=' + totpChipCount + ' 收藏筛选=' + totpFav + ' 全部=' + totpAll
      + ' || 设置: 项=' + setItems.length + '/' + needItems.length + '(' + setAll + ') 子页=' + subOK + ' 改密=' + chpwRejectOld + '/' + chpwRejectShort + '/' + chpwRejectMismatch + '/成功' + chpwChanged + ' 壁纸=' + wallThumbs + '/' + wallApplied + '/自定义' + customWallOK + ' TOTP偏移=' + offsetOK + ' 导出=' + exportOK + ' GitHub=' + ghRejectRepo + '/' + ghRejectToken + '/保存' + ghSaved + '/教程' + ghTutorial + '步'
      + ' || 布局: 不压扁=' + noSquash + ' 设置行高=' + setRowsTall + ' 标签卡高=' + tagRowsTall + '(' + kidHeights.join(',') + ')'
      + ' || App滚动: 可滚=' + appScrollable + ' 滚动了=' + appScrolled + ' 末行露tab上=' + appLastClear
      + ' || chips滑块: 不推整页=' + pageNotPushed + ' 可滑动=' + chipsScrollable + ' 监听响应=' + dragBound + ' 拖拽移动=' + dragMoved + '(' + dragDebug + ')'
      + ' 边缘遮罩: 右端=' + edgeRightOn + ' 左端=' + edgeLeftOn
      + ' || 锁屏: 壁纸层=' + lockHasWallLayer + ' 模糊=' + (lockBgBlur ? lockBgBlur[0] : '?') + ' 不糊内容=' + lockNoBackdrop + ' 透壁纸=' + lockSeeThrough
      + ' || chips点击: ' + chipState + ' 真实点击生效=' + realClickOK + ' 手抖点击=' + shakyClickOK + ' 拖动后点击=' + afterDragClickOK + ' 拖动中不阻塞=' + dragNotBlocking + ' 拖后即点=' + dragThenClickOK + ' 松手丢失无残留=' + lostUpClean
      + ' 详情页=' + detailName + ' 收藏切换=' + favBefore + '→' + favAfter + ' 强度条=' + strength
      + ' 历史条数=' + histCount + ' 置顶首卡=' + firstCard + ' 图标库=' + iconCount + ' 底栏图标=' + barIcons
      + ' || 动画: pop=' + hasPop + ' FLIP滑动=' + flipCount + ' 入场=' + enterCount + ' data-t=' + dataT
      + ' || 编辑页: 分类=' + edCats + '[' + edCatsList + '] 历史=' + edHistDisp + ' 收藏=' + edFavOn
      + ' 无标签UI=' + noTagsUI + ' 无附件UI=' + noAttachUI + ' 新建保存=' + newOK
      + ' || 左滑: 圆钮=' + swBtns + ' 图标=' + swIcons + ' 钮径=' + swBtnW + ' 初始宽=' + swWidth0
      + ' 首张=' + swipeFirst + ' 第三张=' + swipeThird + ' 末张=' + swipeLast
      + ' 拖一点即显示=' + swipePartial + ' 不到一半回弹=' + swipeBack
      + ' | 逐个弹入: 10px弹编辑=' + popStep1 + ' 60px弹收藏=' + popStep2 + ' 110px弹删除=' + popStep3
      + ' || 切页: 卡片数=' + vaultCardsBefore + '→' + vaultCardsAfter + ' DOM复用=' + sameNode
      + ' 验证码页active=' + totpIsActive + ' 隐藏页仍渲染(opacity)=' + vaultStillRendered + ' active数=' + activeCount
      + ' || 锁屏: 首设模式=' + setupShown + ' 短密码报错=' + shortErr + ' 不一致报错=' + mismatchErr + ' 设置成功=' + setupOk
      + ' 解锁模式=' + unlockMode + ' 开时显示面容=' + faceVisibleWhenOn + ' 关时隐藏面容=' + faceHiddenWhenOff
      + ' 布局一致=' + layoutSame + '(宽' + lockW + 'px)'
      + ' | 显隐按钮=' + eyeHasIcon + ' 切明文=' + pwShown + ' 切回密文=' + pwBackHidden
      + ' 错误计数=' + failCount1 + '/' + failCount2 + ' 三次锁定=' + lockedNow + ' 锁定提示=' + lockCountdownMsg.slice(0, 12) + ' 正确绿勾=' + pwOkAnim
      + ' || 人脸: faceapi=' + (typeof faceapi !== 'undefined') + ' 录入函数=' + (typeof startEnroll === 'function') + ' 已录特征=' + (!!faceDescStore)
      + ' || 详情页: 行=' + dRows + ' 区块=[' + dSecs + '] 内容高=' + dScrollH + ' 可视高=' + dClientH
      + ' overflow=' + dOverflow + ' 滚动位置=' + dAfter;
    // 1l) 壁纸染色（异步：canvas 取色要等图片加载）—— 等 1.4s 再量 --tint
    setTimeout(() => {
      const tc = (document.getElementById('phone').style.getPropertyValue('--tint') || '').trim();
      const parts = tc.split(',').map(Number);
      const tintOK = parts.length === 3 && parts.every(v => !isNaN(v) && v >= 0 && v <= 255) && tc !== '255,255,255';
      const gp = document.querySelector('.hdr p');
      if (gp) gp.textContent += ' || 染色: --tint=' + (tc || '(空)') + ' 生效=' + tintOK;
    }, 1400);
    // 1m) 壁纸裁剪框：元素齐全 + 弹开/关闭 + 缩放与拖动逻辑可用
    const cropEls = ['cropOverlay', 'cropStage', 'cropImg', 'cropZoom'].every(id => !!document.getElementById(id));
    const cropFns = typeof openCrop === 'function' && typeof applyCrop === 'function' && typeof zoomCrop === 'function';
    document.getElementById('cropOverlay').classList.add('show');
    const cropShown = document.getElementById('cropOverlay').classList.contains('show');
    closeCrop();
    const cropClosed = !document.getElementById('cropOverlay').classList.contains('show');
    // 缩放 & 拖动逻辑：直接构造状态验证（不依赖真实图片）
    cropNat = { w: 1000, h: 1000 };
    const s0 = cropStageSize();
    cropBase = Math.max(s0.w / 1000, s0.h / 1000);
    cropScale = 1; cropOff = { x: 0, y: 0 };
    zoomCrop(250);
    const zoomOK = Math.round(cropScale * 100) === 250;
    const offBefore = { x: cropOff.x, y: cropOff.y };
    cropDrag = { x: 0, y: 0, ox: cropOff.x, oy: cropOff.y };
    cropOff.x = cropDrag.ox + 80; cropOff.y = cropDrag.oy + 60;
    cropClamp(); cropRender();
    const dragOK = cropOff.x !== offBefore.x && cropOff.y !== offBefore.y;
    const clampOK = (() => {                        // 疯狂拖动也不能露白（越界被夹住）
      cropOff.x = 99999; cropOff.y = 99999; cropClamp();
      const r1 = cropOff.x === 0 && cropOff.y === 0;
      cropOff.x = -99999; cropOff.y = -99999; cropClamp();
      const s1 = cropStageSize();
      const k = cropBase * cropScale;
      const r2 = Math.abs(cropOff.x - (s1.w - 1000 * k)) < 1.5 && Math.abs(cropOff.y - (s1.h - 1000 * k)) < 1.5;
      return r1 && r2;
    })();
    cropDrag = null; cropNat = { w: 0, h: 0 }; cropScale = 1;
    document.querySelector('.hdr p').textContent += ' || 裁剪框: 元素' + cropEls + '/函数' + cropFns + ' 弹开' + cropShown + '关闭' + cropClosed + ' 缩放' + zoomOK + ' 拖动' + dragOK + ' 边界夹紧' + clampOK;
  }, 1000);
}


// 启动初始化（必须放在模块声明之后 —— const/let 有 TDZ 死区，提前调用会抛 ReferenceError）

// =====================================================================
// 银行卡卡片（密码库页「密码 | 卡片」分段切换 · 上下滑动切换的卡片画廊）
//   卡面配色由 FallVault 设计（渐变色 + 光泽 + 芯片 + 卡组织标）
//   数据存 localStorage fvBankCards，随 .fvault 一起备份
// =====================================================================
const BANK_PALETTES = [
  { name: '招行红金', a: '#7E1B26', b: '#C93A4C', c: '#F0A35E' },
  { name: '建行蓝',   a: '#00376E', b: '#0A6BC0', c: '#63B7F0' },
  { name: '农行绿',   a: '#0A4A32', b: '#12855A', c: '#5FD39A' },
  { name: '工行红',   a: '#7A0B10', b: '#C4161C', c: '#F07A5A' },
  { name: '中行红',   a: '#8C1526', b: '#C42B43', c: '#F08A9A' },
  { name: '交行深蓝', a: '#0E1F52', b: '#2946A0', c: '#7C9AE8' },
  { name: '邮储绿蓝', a: '#0B5E3F', b: '#1B7EA6', c: '#7AD3E8' },
  { name: '雅黑金',   a: '#1C1C22', b: '#3A3A46', c: '#D8B26A' },
  { name: '紫罗兰',   a: '#3A1D5E', b: '#6A3AA0', c: '#C098E8' },
  { name: '橙霞',     a: '#8A3A10', b: '#D0702A', c: '#F0B86A' },
];
const ORG_LABEL = { unionpay: 'UnionPay', visa: 'VISA', mastercard: 'MasterCard', other: 'BANK CARD' };

let BANK_CARDS = [];
let bankSel = 0;          // 当前选中的卡（画廊中间）
let bankDrag = null;

function bankEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function bankMask(n) { return String(n || '').replace(/\s/g, '').slice(-4).padStart(4, '0'); }
function bankGroup(n) { return String(n || '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim(); }

function loadBankCards() {
  try { BANK_CARDS = JSON.parse(localStorage.getItem('fvBankCards') || '[]'); } catch (e) { BANK_CARDS = []; }
  if (!Array.isArray(BANK_CARDS)) BANK_CARDS = [];
}
function saveBankCards() { try { localStorage.setItem('fvBankCards', JSON.stringify(BANK_CARDS)); } catch (e) {} }
function seedBankCards() {
  if (localStorage.getItem('fvBankSeed') === '1') return;
  localStorage.setItem('fvBankSeed', '1');
  if (BANK_CARDS.length) return;
  BANK_CARDS = [
    { id: 'k1', bank: '招商银行', org: 'unionpay', type: '储蓄卡', holder: 'ZHANG WEI', num: '6214830000003885', exp: '09/29', cvv: '789', pal: 0 },
    { id: 'k2', bank: '建设银行', org: 'visa', type: '信用卡', holder: 'ZHANG WEI', num: '4271000000002048', exp: '03/28', cvv: '364', pal: 1 },
    { id: 'k3', bank: '农业银行', org: 'unionpay', type: '储蓄卡', holder: 'ZHANG WEI', num: '6228480000001102', exp: '11/30', cvv: '902', pal: 2 },
    { id: 'k4', bank: '中国银行', org: 'mastercard', type: '信用卡', holder: 'ZHANG WEI', num: '5187100000006677', exp: '06/27', cvv: '415', pal: 4 },
  ];
  saveBankCards();
}

// 卡面 HTML（画廊 / 预览共用）
function bankCardHtml(c, opts) {
  const o = opts || {};
  const pal = BANK_PALETTES[c.pal % BANK_PALETTES.length] || BANK_PALETTES[0];
  const num = o.reveal ? bankGroup(c.num) : ('•••• •••• •••• ' + bankMask(c.num));
  return `<div class="bcard2${o.cls ? ' ' + o.cls : ''}" data-id="${c.id}" style="background: linear-gradient(152deg, ${pal.a} 0%, ${pal.b} 62%, ${pal.c} 130%);">
    <div class="shine"></div>
    
    <div class="brow top"><span class="bankname">${bankEsc(c.bank || '银行')}</span>${orgBadge(c)}</div>
    <div class="brow num">${num}</div>
    <div class="brow bottom"><span>${bankEsc(c.holder || '—')} · ${bankEsc(c.type || '储蓄卡')}</span><b>${bankEsc(c.exp || 'MM/YY')}</b></div>
  </div>`;
}

const BANK_SP = 122;   // 卡片间距（照 Figma 107 基础上适配高卡）
// 渲染画廊：数量没变 → 只更新各卡 transform（transition 生效 → 弹性滑动过渡）；
// 数量变化（增删首次）→ 重建 DOM
function renderBankGallery() {
  bankRefreshGeo();
  const stage = document.getElementById('bankStage');
  if (!stage) return;
  if (bankSel < 0) bankSel = 0;
  if (bankSel >= BANK_CARDS.length) bankSel = Math.max(0, BANK_CARDS.length - 1);
  if (!BANK_CARDS.length) {
    stage.innerHTML = '<div class="bcard2 ghost-card" style="width:292px;height:180px;" onclick="openBankForm(null)">＋ 添加第一张银行卡</div>';
    return;
  }
  const live = stage.querySelectorAll('.bcard2');
  if (live.length !== BANK_CARDS.length) {
    stage.innerHTML = BANK_CARDS.map((c, i) => bankCardEl(c, i)).join('');   // 首次/增删 → 重建
    BANK_CARDS.forEach((c, i) => { const el = stage.querySelector(`.bcard2[data-i="${i}"]`); if (el) positionCard(el, i); });   // ⚠️ 重建后必须定位，否则全叠中间
  } else {
    BANK_CARDS.forEach((c, i) => {
      const el = stage.querySelector(`.bcard2[data-i="${i}"]`);
      if (!el) return;
      positionCard(el, i);
    });
  }
}
let bankH = 640;   // stage 实际高度（自适应缓存，resize/进入卡片页时更新）
function bankRefreshGeo() {
  const st = document.querySelector('.bank-stage');
  if (st) bankH = st.clientHeight || 640;
}
function bankMID()  { return -Math.min(58, bankH * 0.09); }   // 常规中间偏移（小屏收敛）
function bankTOP()  { return -Math.min(118, bankH * 0.17); }  // 第一张顶位（小屏收敛）
function bankCardY(off) {
  if (bankSel !== 0) return off * BANK_SP + bankMID();
  if (off === 0) return bankTOP();
  // 第二张只露下半张（偏移 = 卡高一半），之后恢复间距
  const half = 90;
  if (off === 1) return bankTOP() + half;
  return bankTOP() + half + (off - 1) * BANK_SP;
}
function positionCard(el, i) {
  const off = i - bankSel;
  const scale = off === 0 ? 1 : 0.9;
  el.style.transform = `translateY(${bankCardY(off)}px) scale(${scale})`;
  // 不透明 + 非中间卡模糊（blur 由 CSS class 控制，避免每帧字符串）
  el.style.opacity = Math.abs(off) > 2 ? 0 : 1;
  el.style.zIndex = 10 - Math.abs(off);
  el.classList.toggle('bc-blur', off !== 0);
}
function orgBadge(c) {
  const key = c.org === 'custom' ? 'custom' : (c.org || 'other');
  const label = c.orgLabel || ORG_LABEL[c.org] || 'BANK CARD';
  return `<span class="org-badge org-${key}"><i class="ob-ico"></i><b>${bankEsc(label)}</b></span>`;
}
function bankCardEl(c, i) {
  const pal = BANK_PALETTES[c.pal % BANK_PALETTES.length] || BANK_PALETTES[0];
  const face = c.face ? `<img class="bcb-img" src="${c.face}" alt="">` : '';
  const bg = c.face ? '' : `background: linear-gradient(152deg, ${pal.a} 0%, ${pal.b} 62%, ${pal.c} 130%);`;
  return `<div class="bcard2" data-i="${i}" style="${bg}" onclick="bankCardTap(${i})">
    ${face}
    <div class="bcb-ol"></div>
    <div class="shine"></div>
    <div class="brow top"><span class="bankname">${bankEsc(c.bank || '银行')}</span>${orgBadge(c)}</div>
    <div class="brow num">•••• •••• •••• ${bankMask(c.num)}</div>
    <div class="brow bottom"><span>${bankEsc(c.holder || '—')} · ${bankEsc(c.type || '储蓄卡')}</span><b>${bankEsc(c.exp || 'MM/YY')}</b></div>
  </div>`;
}

// 密码 / 卡片 视图切换（照 Figma：滑块滑到对应侧）
function switchVault(mode) {
  const slider = document.getElementById('vsegSlider');
  const pw = document.getElementById('vsegPw');
  const cd = document.getElementById('vsegCard');
  const isCard = mode === 'card';
  pw.classList.toggle('on', !isCard);
  cd.classList.toggle('on', isCard);
  if (slider) slider.style.transform = isCard ? 'translateX(119px)' : 'translateX(0)';
  document.getElementById('vaultSearch').style.display = isCard ? 'none' : '';
  document.getElementById('vaultChipsRail').style.display = isCard ? 'none' : '';
  document.getElementById('list').style.display = isCard ? 'none' : '';
  document.getElementById('bankView').classList.toggle('on', isCard);
  if (isCard) renderBankGallery();
}
let vaultMode = 'pw';

// 点卡片：中间的打开详情；上下的切换为中间
function bankCardTap(i) {
  if (i === bankSel) { bankDetail(); return; }
  bankSel = i;
  renderBankGallery();
  try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) {}
}

// 上下滑动切换（手势跟随 + 松手切卡）
(function bindBankSwipe() {
  const bind = () => {
    const stage = document.getElementById('bankStage');
    if (!stage || stage.dataset.bound) return;
    stage.dataset.bound = '1';
    let sy = 0, moved = 0;
    stage.addEventListener('pointerdown', e => { sy = e.clientY; moved = 0; bankDrag = true; });
    stage.addEventListener('pointermove', e => {
      if (!bankDrag) return;
      moved = e.clientY - sy;
      const cards = stage.querySelectorAll('.bcard2');
      cards.forEach(el => {
        const i = Number(el.dataset.i || 0);
        const off = i - bankSel;
        el.style.transition = 'none';   // 拖动跟手：瞬移
        el.style.transform = `translateY(${bankCardY(off) + moved * 0.55}px) scale(${off === 0 ? 1 : 0.9})`;
      });
    });
    const finish = () => {
      if (!bankDrag) return;
      bankDrag = false;
      const cards = stage.querySelectorAll('.bcard2');
      cards.forEach(el => { el.style.transition = ''; });   // 恢复过渡 → 松手后弹性滑到位
      if (Math.abs(moved) > 55) {
        if (moved < 0 && bankSel < BANK_CARDS.length - 1) bankSel++;        // 上滑 → 下一张
        else if (moved > 0 && bankSel > 0) bankSel--;                       // 下滑 → 上一张
        try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) {}
      }
      moved = 0;
      renderBankGallery();   // 原位更新 transform → CSS transition 从拖拽位置过渡，平滑弹到位
    };
    stage.addEventListener('pointerup', finish);
    stage.addEventListener('pointercancel', finish);
  };
  bind();
  window.__bindBankSwipe = bind;   // 页面重建后再绑
})();

// ===== 卡片详情 =====
function bankDetail() {
  const c = BANK_CARDS[bankSel];
  if (!c) return;
  document.getElementById('detailTitle').textContent = c.bank;
  const editBtn = document.getElementById('detailEditBtn');
  editBtn.onclick = () => openBankForm(c.id);
  const pal = BANK_PALETTES[c.pal % BANK_PALETTES.length] || BANK_PALETTES[0];
  const face = c.face ? `<img class="bcb-img" src="${c.face}" alt="">` : '';
  const bg = c.face ? '' : `background: linear-gradient(152deg, ${pal.a} 0%, ${pal.b} 62%, ${pal.c} 130%);`;
  const orgTxt = c.orgLabel || ORG_LABEL[c.org] || 'BANK CARD';
  document.getElementById('detailBody').innerHTML = `
    <div class="d-bigcard"><div class="bcard2" style="${bg} position:relative; margin:0; width:100%; height:176px; border-radius:14px;">
      ${face}<div class="bcb-ol"></div><div class="shine"></div>
      <div class="brow top"><span class="bankname">${bankEsc(c.bank || '银行')}</span>${orgBadge(c)}</div>
      <div class="brow num" id="dBNum" onclick="dBNumToggle()">•••• •••• •••• ${bankMask(c.num)}</div>
      <div class="brow bottom"><span>${bankEsc(c.holder || '—')} · ${bankEsc(c.type || '储蓄卡')}</span><b>${bankEsc(c.exp || 'MM/YY')}</b></div>
    </div></div>
    <div class="drow"><span class="dk">卡号</span><span class="dv" id="dBNumRow">•••• ${bankMask(c.num)}</span><button class="cp" onclick="copyVal('${c.num}','卡号')">${typeof COPY !== 'undefined' ? COPY : '复制'}</button></div>
    <div class="drow"><span class="dk">CVV 安全码</span><span class="dv" id="dBCvv">${c.cvv ? '•••' : '—'}</span>${c.cvv ? '<button class="cp" onclick="dBCvvToggle()">显示</button><button class="cp" onclick="dBCvvCopy()">' + (typeof COPY !== 'undefined' ? COPY : '复制') + '</button>' : ''}</div>
    <div class="drow"><span class="dk">持卡人</span><span class="dv">${bankEsc(c.holder || '—')}</span><button class="cp" onclick="copyVal('${bankEsc(c.holder || '')}','持卡人')">${typeof COPY !== 'undefined' ? COPY : '复制'}</button></div>
    <div class="drow"><span class="dk">有效期</span><span class="dv">${bankEsc(c.exp || '—')}</span><button class="cp" onclick="copyVal('${bankEsc(c.exp || '')}','有效期')">${typeof COPY !== 'undefined' ? COPY : '复制'}</button></div>
    <div class="drow"><span class="dk">卡组织</span><span class="dv">${bankEsc(orgTxt)}</span><button class="cp" onclick="copyVal('${bankEsc(orgTxt)}','卡组织')">${typeof COPY !== 'undefined' ? COPY : '复制'}</button></div>
    <div class="drow"><span class="dk">卡种</span><span class="dv">${bankEsc(c.type || '储蓄卡')}</span><button class="cp" onclick="copyVal('${bankEsc(c.type || '储蓄卡')}','卡种')">${typeof COPY !== 'undefined' ? COPY : '复制'}</button></div>
    <div class="drow" style="margin-top:10px;"><button class="egbtn cancel" style="width:100%; margin:0; color:#FF6961; border-color:rgba(255,105,97,.4);" onclick="delBankFromDetail()">删除这张卡片</button></div>
  `;
  closeDetail();   // 保险：确保非 show
  document.getElementById('detailScreen').classList.add('show');
}
let dBNumShown = false, dBCvvShown = false;
function dBNumToggle() {
  const c = BANK_CARDS[bankSel]; if (!c) return;
  dBNumShown = !dBNumShown;
  const el = document.getElementById('dBNum'), row = document.getElementById('dBNumRow');
  const full = bankGroup(c.num);
  if (el) el.textContent = dBNumShown ? full : ('•••• •••• •••• ' + bankMask(c.num));
  if (row) row.textContent = dBNumShown ? full : ('•••• ' + bankMask(c.num));
}
function dBCvvCopy() {
  const c = BANK_CARDS[bankSel]; if (!c || !c.cvv) return;
  copyVal(String(c.cvv), 'CVV');
}
function dBCvvToggle() {
  const c = BANK_CARDS[bankSel]; if (!c) return;
  dBCvvShown = !dBCvvShown;
  const el = document.getElementById('dBCvv');
  if (el) {
    el.textContent = dBCvvShown ? c.cvv : '•••';
    el.style.color = dBCvvShown ? '#FFD60A' : '';
  }
  setTimeout(() => { dBCvvShown = false; if (el) { el.textContent = '•••'; el.style.color = ''; } }, 8000);
}


let bfFace = '';   // 自传卡面图（dataURL）
// 有效期：只允许数字，满4位自动加 /（MM/DD），月 ≤12，日 ≤31
let bfExpBad = false;
function bfExpKey(ev) {
  const el = ev.target;
  let v = el.value.replace(/\D/g, '').slice(0, 4);
  if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
  el.value = v;
  bfExpBad = false;
  el.style.borderColor = '';
  if (v.length === 5) {
    const m = +v.slice(0, 2), d = +v.slice(3);
    if (m < 1 || m > 12) { bfExpBad = true; el.style.borderColor = '#FF6961'; showToast('月份不能超过 12'); }
    else if (d < 1 || d > 31) { bfExpBad = true; el.style.borderColor = '#FF6961'; showToast('日期不能超过 31'); }
  }
  if (typeof bfPreview === 'function') bfPreview();
}


// ===== 新建 / 编辑卡片 =====
function delBankFromDetail() {
  const c = BANK_CARDS[bankSel];
  if (!c) return;
  fvConfirm('确定删除「' + c.bank + '」这张卡片？删除后不可恢复', () => {
    BANK_CARDS = BANK_CARDS.filter(x => x.id !== c.id);
    saveBankCards();
    if (bankSel >= BANK_CARDS.length) bankSel = Math.max(0, BANK_CARDS.length - 1);
    closeDetail();
    renderBankGallery();
    showToast('卡片已删除');
  });
}
// 自传卡面图：相册选图 → 压缩 876×540 → dataURL 存 bfFace（保存时进卡片数据）
function onBfFacePicked(ev) {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    openCropEx(rd.result, 876, 540, (out) => {
      bfFace = out;
      bfPreview();
      showToast('已使用裁剪后的卡面图');
    });
  };
  rd.readAsDataURL(f);
}
let bfNumBad = false;
function bfNumKey(ev) {
  const el = ev.target;
  let v = el.value.replace(/\D/g, '').slice(0, 19);
  el.value = v.replace(/(\d{4})(?=\d)/g, '$1 ');
  bfNumBad = !(v.length >= 13 && v.length <= 19);
  el.style.borderColor = bfNumBad ? '#FF6961' : '';
  bfPreview();
}
function bfTypeChange() {
  const sel = document.getElementById('bfTypeSel');
  const custom = document.getElementById('bfTypeCustom');
  custom.style.display = sel.value === 'custom' ? '' : 'none';
  bfPreview();
}
function bfTypeLabelOf() {
  const sel = document.getElementById('bfTypeSel');
  if (!sel) return '储蓄卡';
  return sel.value === 'custom' ? (document.getElementById('bfTypeCustom').value.trim() || '其他卡') : sel.value;
}
// 通用裁剪：把现有壁纸裁剪器转给卡面用（横版比例 + 回调）
let _cropCb = null;
function openCropEx(dataURL, cw, ch, onDone) {
  _cropCb = { w: cw, h: ch, fn: onDone };
  const st = document.getElementById('cropStage');
  if (st) st.style.aspectRatio = cw + ' / ' + ch;
  document.querySelector('.crop-head').textContent = '调整卡面图片';
  document.querySelector('.crop-sub').textContent = '拖动图片移动位置 · 滑杆缩放';
  openCrop(dataURL);
}
let bfEditId = null, bfPal = 0, bfOrgVal = 'unionpay';
function openBankForm(id) {
  bfEditId = id || null;
  const c = bfEditId ? BANK_CARDS.find(x => x.id === bfEditId) : null;
  document.getElementById('bankFormTitle').textContent = c ? '编辑银行卡' : '新建银行卡';
  document.getElementById('bfBank').value = c ? c.bank : '';
  document.getElementById('bfNum').value = c ? c.num.replace(/(\d{4})(?=\d)/g, '$1 ') : '';
  document.getElementById('bfHolder').value = c ? c.holder : '';
  document.getElementById('bfExp').value = c ? c.exp : '';
  document.getElementById('bfCvv').value = c ? c.cvv : '';
  bfPal = c ? (c.pal || 0) : 0;
  const ts = document.getElementById('bfTypeSel');
  if (ts) ts.value = (c && c.type) ? (['储蓄卡','信用卡','借记卡','虚拟卡','贷记卡'].includes(c.type) ? c.type : 'custom') : '储蓄卡';
  const tc = document.getElementById('bfTypeCustom');
  if (tc) { tc.style.display = ts && ts.value === 'custom' ? '' : 'none'; tc.value = (c && c.type && !['储蓄卡','信用卡','借记卡','虚拟卡','贷记卡'].includes(c.type)) ? c.type : ''; }
  bfOrgVal = c ? (c.org || 'unionpay') : 'unionpay';
  bfOrgLabel = c && c.orgLabel ? c.orgLabel : '';
  const sel = document.getElementById('bfOrgSel');
  if (sel) sel.value = bfOrgVal === 'custom' ? 'custom' : (ORG_LABEL[bfOrgVal] ? bfOrgVal : 'custom');
  const custom = document.getElementById('bfOrgCustom');
  if (custom) { custom.style.display = bfOrgVal === 'custom' ? '' : 'none'; custom.value = bfOrgLabel; }
  renderBfColors();
  bfPreview();
  document.getElementById('bankForm').classList.add('show');
}
function closeBankForm() { document.getElementById('bankForm').classList.remove('show'); }
let bfOrgLabel = '';   // 自定义组织名
function bfOrgChange() {
  const sel = document.getElementById('bfOrgSel');
  bfOrgVal = sel.value;
  const custom = document.getElementById('bfOrgCustom');
  custom.style.display = bfOrgVal === 'custom' ? '' : 'none';
  if (bfOrgVal === 'custom') {
    bfOrgLabel = custom.value.trim() || 'BANK CARD';
  } else {
    bfOrgLabel = ORG_LABEL[bfOrgVal] || 'BANK CARD';
  }
  bfPreview();
}
function bfOrgLabelOf() {
  return bfOrgVal === 'custom' ? (document.getElementById('bfOrgCustom').value.trim() || 'BANK CARD') : (ORG_LABEL[bfOrgVal] || 'BANK CARD');
}
function renderBfColors() {
  const box = document.getElementById('bfColors');
  box.innerHTML = BANK_PALETTES.map((p, i) =>
    `<div class="bf-color${i === bfPal ? ' on' : ''}" style="background: linear-gradient(145deg, ${p.a}, ${p.b});" onclick="bfPal=${i};renderBfColors();bfPreview();" title="${p.name}"></div>`
  ).join('');
}
function bfPreview() {
  const box = document.getElementById('bfPreview');
  if (!box) return;
  const tmp = {
    id: bfEditId || 'tmp', pal: bfPal, org: bfOrgVal, type: '储蓄卡',
    bank: document.getElementById('bfBank').value || '银行名称',
    num: document.getElementById('bfNum').value.replace(/\s/g, '') || '0000000000000000',
    holder: (document.getElementById('bfHolder').value || '持卡人').toUpperCase(),
    exp: document.getElementById('bfExp').value || 'MM/YY',
    type: bfTypeLabelOf(),
  };
  const pal = BANK_PALETTES[bfPal % BANK_PALETTES.length];
  const faceImg = bfFace ? `<img class="bcb-img" src="${bfFace}" alt="">` : '';
  const bg = bfFace ? '' : `background: linear-gradient(152deg, ${pal.a} 0%, ${pal.b} 62%, ${pal.c} 130%);`;
  box.innerHTML = `<div class="bcard2" style="${bg}">
    ${faceImg}<div class="bcb-ol"></div>
    <div class="shine"></div>
    <div class="brow top"><span class="bankname">${bankEsc(tmp.bank)}</span><span class="org-badge org-${bfOrgVal === 'custom' ? 'custom' : bfOrgVal}"><i class="ob-ico"></i><b>${bankEsc(bfOrgLabelOf())}</b></span></div>
    <div class="brow num">${bankGroup(tmp.num) || '•••• •••• •••• ••••'}</div>
    <div class="brow bottom"><span>${bankEsc(tmp.holder)} · ${bankEsc(tmp.type)}</span><b>${bankEsc(tmp.exp)}</b></div>
  </div>`;
}
function saveBankForm() {
  const bank = document.getElementById('bfBank').value.trim();
  if (!bank) { showToast('请填写银行名称'); return; }
  if (bfExpBad) { showToast('有效期格式不对（月≤12 日≤31）'); return; }
  const num = document.getElementById('bfNum').value.replace(/\s/g, '');
  if (num.length < 13 || num.length > 19) { showToast('卡号需 13~19 位数字'); return; }
  const card = {
    id: bfEditId || ('k' + Date.now()),
    bank,
    org: bfOrgVal,
    orgLabel: bfOrgVal === 'custom' ? bfOrgLabelOf() : null,
    type: bfTypeLabelOf(),
    holder: document.getElementById('bfHolder').value.trim().toUpperCase(),
    num: /^\d{12,19}$/.test(num) ? num : (num || ''),
    exp: document.getElementById('bfExp').value.trim(),
    cvv: document.getElementById('bfCvv').value.trim(),
    pal: bfPal,
    face: bfFace || null,
  };
  const i = BANK_CARDS.findIndex(x => x.id === card.id);
  if (i >= 0) { BANK_CARDS[i] = card; showToast('卡片已更新'); }
  else { BANK_CARDS.push(card); bankSel = BANK_CARDS.length - 1; showToast('卡片已添加'); }
  saveBankCards();
  closeBankForm();
  renderBankGallery();
}

// 启动初始化（模块在文件末尾，声明已就位）
loadBankCards();
seedBankCards();

// 银行卡卡片页自检（模块定义在文件末尾）
if (location.search.includes('debug')) {
  setTimeout(() => {
    try {
      switchVault('card');
      const stage = document.getElementById('bankStage');
      const cards = document.querySelectorAll('#bankStage .bcard2');
      const sliderX = document.getElementById('vsegSlider').style.transform;
      const midBig = (() => {
        const mid = [...cards].find(el => Number(el.dataset.i) === bankSel);
        return mid ? mid.style.transform.includes('scale(1)') && !mid.style.transform.includes('scale(0.89)') : false;
      })();
      const upSmall = (() => {
        const up = [...cards].find(el => Number(el.dataset.i) === bankSel - 1);
        return up ? up.style.transform.includes('scale(0.89)') : 'N/A';
      })();
      // 模拟上滑切换
      const before = bankSel;
      const st = document.getElementById('bankStage');
      const rect = st.getBoundingClientRect();
      const mk = (type, y) => {
        const ev = new PointerEvent(type, { bubbles: true, cancelable: true });
        try { Object.defineProperty(ev, 'clientY', { value: y, configurable: true }); } catch (e) {}
        try { Object.defineProperty(ev, 'clientX', { value: rect.left + 150, configurable: true }); } catch (e) {}
        try { Object.defineProperty(ev, 'buttons', { value: 1, configurable: true }); } catch (e) {}
        return ev;
      };
      st.dispatchEvent(mk('pointerdown', rect.top + 300));
      st.dispatchEvent(mk('pointermove', rect.top + 200));   // 上滑 -100px
      st.dispatchEvent(mk('pointerup', rect.top + 200));
      const swiped = bankSel === before + 1;
      const formOK = (() => { openBankForm(null); const ok = !!document.getElementById('bankForm').classList.contains('show') && document.querySelectorAll('#bfColors .bf-color').length === 10; closeBankForm(); return ok; })();
      switchVault('pw');
      document.querySelector('.hdr p').textContent +=
        ' || 卡片页: 分段滑块=' + (sliderX.includes('119px') ? 'ok' : sliderX) + ' 画廊卡=' + cards.length + ' 中卡大=' + midBig + ' 上卡小=' + upSmall
        + ' 上滑切换=' + swiped + '(' + before + '→' + bankSel + ')' + ' 新建表单=' + formOK;
    } catch (e) {
      document.querySelector('.hdr p').textContent += ' || 卡片页自检异常: ' + e.message;
    }
  }, 2200);
}
