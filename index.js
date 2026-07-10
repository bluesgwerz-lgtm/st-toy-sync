// Toy Sync — SillyTavern 第三方扩展
// AI 回复中的 ‹toy:模式› 标记 → Intiface Central (buttplug.io) → 任意受支持的设备
// 备选后端：HTTP 模式服务器（自定义硬件桥接用）
//
// 扩展 JS 运行在"查看酒馆的浏览器"里，云酒馆同样适用：
// ws://127.0.0.1:12345 指向的是用户自己设备上的 Intiface Central。

(() => {
    const EXT = 'toy-sync';

    const MODES = [
        'wave', 'pulse', 'tease', 'edge', 'deep',
        'devour', 'chaos', 'storm', 'gentle', 'climb',
        'breathe', 'heartbeat', 'gspot', 'alternate', 'denial', 'random',
        'stop',
    ];

    // 兼容 ‹toy:xxx› 与 <toy:xxx>
    const MARKER = /[‹<]toy:([a-z]+)[›>]/gi;

    const DEFAULTS = {
        enabled: true,
        hideMarkers: true,
        backend: 'intiface',            // 'intiface' | 'http'
        intifaceUrl: 'ws://127.0.0.1:12345',
        httpUrl: 'http://localhost:9090',
    };

    const ctx = SillyTavern.getContext();
    if (!ctx.extensionSettings[EXT]) ctx.extensionSettings[EXT] = {};
    const settings = ctx.extensionSettings[EXT];
    for (const key of Object.keys(DEFAULTS)) {
        if (settings[key] === undefined) settings[key] = DEFAULTS[key];
    }

    const clamp = x => Math.max(0, Math.min(1, x));

    let curMode = 'stop'; // 顶栏状态灯 + 面板"当前模式"共用

    function setModeDisplay(mode) {
        curMode = mode;
        $('#toysync_mode').text('当前模式：' + mode);
        updateTopIcon();
    }

    /* ================= Buttplug 客户端（协议 v3，手写最小实现） ================= */

    const bp = {
        ws: null,
        msgId: 0,
        devices: new Map(),   // DeviceIndex -> {index,name,scalars,rotates,linears,last,nextLinear,linPos}
        pingTimer: null,
        reconnectTimer: null,
        wanted: false,        // 用户意图：true 表示断线要自动重连
    };

    function bpStatus(text) {
        $('#toysync_status').text(text);
        updateTopIcon(); // 连接状态变化要同步到顶栏状态灯
    }

    function bpSend(type, payload = {}) {
        if (!bp.ws || bp.ws.readyState !== 1) return;
        const id = ++bp.msgId;
        bp.ws.send(JSON.stringify([{ [type]: { Id: id, ...payload } }]));
    }

    function bpConnect() {
        bp.wanted = true;
        clearTimeout(bp.reconnectTimer);
        if (bp.ws) { try { bp.ws.onclose = null; bp.ws.close(); } catch (e) { } }

        let ws;
        try {
            ws = new WebSocket(settings.intifaceUrl.trim());
        } catch (e) {
            bpStatus('地址无效：' + e.message);
            return;
        }
        bp.ws = ws;
        bpStatus('连接中…');

        ws.onopen = () => bpSend('RequestServerInfo', { ClientName: 'ST Toy Sync', MessageVersion: 3 });
        ws.onmessage = ev => {
            let msgs;
            try { msgs = JSON.parse(ev.data); } catch (e) { return; }
            for (const m of msgs) bpHandle(m);
        };
        ws.onclose = () => {
            bp.devices.clear();
            refreshDeviceList();
            clearInterval(bp.pingTimer);
            if (bp.wanted) {
                bpStatus('已断开，3 秒后重连…');
                bp.reconnectTimer = setTimeout(bpConnect, 3000);
            } else {
                bpStatus('未连接');
            }
        };
        ws.onerror = () => { }; // 统一走 onclose
    }

    function bpDisconnect() {
        bp.wanted = false;
        clearTimeout(bp.reconnectTimer);
        engineStop();
        if (bp.ws) { try { bp.ws.close(); } catch (e) { } }
        bpStatus('未连接');
    }

    function bpHandle(m) {
        if (m.ServerInfo) {
            const maxPing = m.ServerInfo.MaxPingTime || 0;
            if (maxPing > 0) {
                bp.pingTimer = setInterval(() => bpSend('Ping'), Math.max(maxPing / 2, 250));
            }
            bpStatus('已连接 ' + (m.ServerInfo.ServerName || 'buttplug server'));
            bpSend('RequestDeviceList');
        } else if (m.DeviceList) {
            bp.devices.clear();
            for (const d of m.DeviceList.Devices || []) bpAddDevice(d);
        } else if (m.DeviceAdded) {
            bpAddDevice(m.DeviceAdded);
        } else if (m.DeviceRemoved) {
            bp.devices.delete(m.DeviceRemoved.DeviceIndex);
            refreshDeviceList();
        } else if (m.Error) {
            console.warn(`[${EXT}] buttplug error:`, m.Error.ErrorMessage);
        }
    }

    function bpAddDevice(d) {
        const msgs = d.DeviceMessages || {};
        bp.devices.set(d.DeviceIndex, {
            index: d.DeviceIndex,
            name: d.DeviceName || ('设备 ' + d.DeviceIndex),
            scalars: (msgs.ScalarCmd || []).map((f, i) => ({ index: i, type: f.ActuatorType })),
            rotates: (msgs.RotateCmd || []).length,
            linears: (msgs.LinearCmd || []).length,
            last: {},
            nextLinear: 0,
            linPos: 0.2,
        });
        refreshDeviceList();
    }

    function refreshDeviceList() {
        const el = $('#toysync_devices');
        if (!el.length) return;
        if (!bp.devices.size) {
            el.html('<small>未发现设备。在 Intiface Central 里连接玩具后会自动出现在这里。</small>');
            return;
        }
        const rows = [...bp.devices.values()].map(d => {
            const caps = [
                ...d.scalars.map(s => s.type),
                ...(d.rotates ? ['Rotate'] : []),
                ...(d.linears ? ['Linear'] : []),
            ].join(' / ') || '无可用通道';
            return `<div>🧸 ${d.name} <small>(${caps})</small></div>`;
        });
        el.html(rows.join(''));
    }

    /* ================= 节奏引擎 =================
       四通道输出，全部 0..1：
       v 震动 · t 伸缩/往复 · r 旋转 · s 吮吸/收缩
       通道按设备能力自适应：Vibrate←max(v,s)  Oscillate←t  Rotate←r
       Constrict←s  LinearCmd←t(往复行程)。设备缺哪个通道就自动忽略。 */

    const PULSE_ARR = [0, 0, 0, 0, .31, .59, .9, 1, 1, .9, .59, .31, 0, 0, 0, 0, 0, .31, .59, .9, 1, 1, .9, .59, .31, 0, 0, 0, 0, 0, 0, 0];
    const TEASE_ARR = [.1, .1, .1, .1, .1, .1, .1, .12, .14, .16, .2, .27, .39, .63, .86, 1, 1, .86, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .1, .1, .1, .1, .1, .1];
    const DEEP_T = [0, .14, .29, .43, .57, .71, .86, 1, 1, 1, 1, 1, .86, .71, .57, .43, .29, .14];
    const DEEP_R = [0, .16, .31, .47, .63, .78, .78, .63, .47, .31, .16, 0];
    // 砰...砰砰...停——双跳后长歇，区别于 pulse 的连续双峰
    const HEART_ARR = [0, 0, .71, 1, .78, .31, 0, 0, .63, .94, .71, .24, 0, 0, 0, 0, 0, 0, 0, 0];

    const PATTERNS = {
        wave: {
            tick: 100, f: s => ({
                v: (Math.sin(s * .04) + 1) * .43,
                t: 0,
                r: (Math.sin(s * .03) + 1) * .31,
                s: (Math.sin(s * .04) + 1) * .22,
            })
        },
        pulse: {
            tick: 100, f: s => {
                const v = PULSE_ARR[s % PULSE_ARR.length];
                return { v, t: 0, r: 0, s: v * .5 };
            }
        },
        tease: {
            tick: 130, f: s => {
                const v = TEASE_ARR[s % TEASE_ARR.length];
                return { v, t: 0, r: 0, s: v * .6 };
            }
        },
        edge: {
            tick: 100, f: s => {
                const c = s % 100;
                if (c < 50) return { v: c * .02, t: c / 50, r: 0, s: c * .012 };
                if (c < 55) return { v: 1, t: 1, r: 0, s: .59 };
                return { v: 0, t: 0, r: 0, s: 0 };
            }
        },
        deep: {
            tick: 180, f: s => {
                const t = DEEP_T[s % DEEP_T.length];
                const r = DEEP_R[s % DEEP_R.length];
                return { v: t * .82, t, r, s: r * .4 };
            }
        },
        devour: {
            tick: 100, f: s => {
                const suck = (Math.sin(s * .06) + 1) * .47;
                const v = (Math.cos(s * .08) + 1) * .35;
                return { v: Math.max(v, suck * .7), t: 0, r: 0, s: suck };
            }
        },
        chaos: {
            tick: 100, f: function (s) {
                if (s % 3 === 0) {
                    this._c = { v: Math.random(), t: Math.random(), r: Math.random(), s: Math.random() * .86 };
                }
                return this._c || { v: 0, t: 0, r: 0, s: 0 };
            }
        },
        storm: { tick: 500, f: () => ({ v: 1, t: 1, r: .86, s: .86 }) },
        gentle: {
            tick: 100, f: s => ({
                v: .157 + Math.sin(s * .02) * .078,
                t: 0,
                r: .118 + Math.sin(s * .015) * .059,
                s: .137 + Math.sin(s * .025) * .078,
            })
        },
        climb: {
            tick: 100, f: s => {
                const p = Math.min((s % 200) / 200, 1);
                return { v: p, t: p, r: p * .78, s: p * .78 };
            }
        },
        breathe: {
            tick: 100, f: s => {
                const ph = s % 80;
                const p = ph < 40 ? ph / 40 : 1 - (ph - 40) / 40;
                const v = .078 + p * .47;
                return { v, t: 0, r: .059 + p * .314, s: v * .4 };
            }
        },
        heartbeat: {
            tick: 120, f: s => {
                const v = HEART_ARR[s % HEART_ARR.length];
                return { v, t: 0, r: v * .6, s: v * .4 };
            }
        },
        gspot: {
            // 旋转主导的定点研磨，刻意不用往复；无旋转马达的设备只感到低幅震动，属预期
            tick: 100, f: s => ({
                v: .118 + Math.sin(s * .02) * .078,
                t: 0,
                r: .549 + Math.sin(s * .025) * .235,
                s: 0,
            })
        },
        alternate: {
            // 三角波交叉渐变：v/t/r 一侧与 s 一侧此消彼长
            tick: 100, f: s => {
                const ph = s % 100;
                const a = ph < 50 ? ph / 50 : 1 - (ph - 50) / 50;
                return { v: .118 + a * .86, t: a * .86, r: a * .71, s: (1 - a) * .78 };
            }
        },
        denial: {
            tick: 100, f: s => {
                const c = s % 80;
                if (c < 60) { const p = c / 60; return { v: p * p, t: p, r: p * .78, s: p * .71 }; }
                if (c < 65) return { v: 1, t: 1, r: .78, s: .78 };
                return { v: 0, t: 0, r: 0, s: 0 };
            }
        },
        random: {
            // 随机值保持随机时长（0.5~2.5s），区别于 chaos 的每 0.3s 高频乱跳
            tick: 100, f: function (s) {
                if (s === 0 || !this._r || s >= this._r.until) {
                    this._r = {
                        v: .118 + Math.random() * .86,
                        t: Math.random(),
                        r: Math.random() * .71,
                        s: Math.random() * .78,
                        until: s + 5 + Math.round(Math.random() * 20),
                    };
                }
                return this._r;
            }
        },
    };

    const engine = { timer: null, step: 0, mode: 'stop' };

    function engineStop() {
        clearInterval(engine.timer);
        engine.timer = null;
        engine.mode = 'stop';
        engine.step = 0;
        bpSend('StopAllDevices');
        bp.devices.forEach(d => { d.last = {}; d.nextLinear = 0; });
        setModeDisplay('stop');
    }

    function enginePlay(mode) {
        if (mode === 'stop') return engineStop();
        const p = PATTERNS[mode];
        if (!p) return;
        clearInterval(engine.timer);
        engine.step = 0;
        engine.mode = mode;
        engine.timer = setInterval(() => {
            dispatch(p.f(engine.step));
            engine.step++;
        }, p.tick);
        setModeDisplay(mode);
    }

    function dispatch(ch) {
        if (!bp.ws || bp.ws.readyState !== 1) return;
        const now = Date.now();
        for (const d of bp.devices.values()) {
            const scalars = [];
            for (const f of d.scalars) {
                let val = 0;
                if (f.type === 'Vibrate') val = Math.max(ch.v, ch.s);
                else if (f.type === 'Oscillate') val = ch.t;
                else if (f.type === 'Rotate') val = ch.r;
                else if (f.type === 'Constrict') val = ch.s;
                val = Math.round(clamp(val) * 100) / 100;
                if (d.last['s' + f.index] !== val) {
                    d.last['s' + f.index] = val;
                    scalars.push({ Index: f.index, Scalar: val, ActuatorType: f.type });
                }
            }
            if (scalars.length) bpSend('ScalarCmd', { DeviceIndex: d.index, Scalars: scalars });

            if (d.rotates > 0) {
                const val = Math.round(clamp(ch.r) * 100) / 100;
                if (d.last.rot !== val) {
                    d.last.rot = val;
                    bpSend('RotateCmd', { DeviceIndex: d.index, Rotations: [{ Index: 0, Speed: val, Clockwise: true }] });
                }
            }

            if (d.linears > 0) {
                if (ch.t > 0.02 && now >= d.nextLinear) {
                    // 行程 0.2↔0.8 往复，t 越大往复越快
                    const dur = Math.round(1800 - clamp(ch.t) * 1400);
                    d.linPos = d.linPos >= 0.8 ? 0.2 : 0.8;
                    bpSend('LinearCmd', { DeviceIndex: d.index, Vectors: [{ Index: 0, Duration: dur, Position: d.linPos }] });
                    d.nextLinear = now + dur;
                } else if (ch.t <= 0.02) {
                    d.nextLinear = 0;
                }
            }
        }
    }

    /* ================= HTTP 后端（进阶：自定义硬件桥接） ================= */

    async function sendHttp(mode, isRetry = false) {
        const base = settings.httpUrl.replace(/\/+$/, '');
        try {
            await fetch(`${base}/set?mode=${encodeURIComponent(mode)}`, { mode: 'no-cors', cache: 'no-store' });
        } catch (err) {
            if (!isRetry) return sendHttp(mode, true);
            console.warn(`[${EXT}] HTTP 发送失败 (${mode})`, err);
        }
    }

    /* ================= 模式入口 ================= */

    function applyMode(mode) {
        console.log(`[${EXT}] → ${mode}`);
        if (settings.backend === 'http') sendHttp(mode);
        else enginePlay(mode);
        setModeDisplay(mode);
    }

    function applyStop() {
        if (settings.backend === 'http') sendHttp('stop');
        else engineStop();
        setModeDisplay('stop');
    }

    /* ================= 标记提取 ================= */

    function extractMode(text) {
        let mode = null;
        for (const m of text.matchAll(MARKER)) {
            const name = m[1].toLowerCase();
            if (MODES.includes(name)) mode = name; // 多个标记时最后一个生效
        }
        return mode;
    }

    function onMessageReceived(messageId) {
        if (!settings.enabled) return;
        const msg = ctx.chat[messageId];
        if (!msg || msg.is_user || msg.is_system) return;
        const mode = extractMode(msg.mes || '');
        if (mode) applyMode(mode);
    }

    function stripMarkersFrom(el) {
        if (el && /[‹<]toy:/i.test(el.innerHTML)) {
            el.innerHTML = el.innerHTML.replace(MARKER, '');
        }
    }

    function onMessageRendered(messageId) {
        if (!settings.hideMarkers) return;
        stripMarkersFrom(document.querySelector(`#chat .mes[mesid="${messageId}"] .mes_text`));
    }

    function onChatChanged() {
        if (!settings.hideMarkers) return;
        document.querySelectorAll('#chat .mes .mes_text').forEach(stripMarkersFrom);
    }

    /* ================= 屏幕常亮 + 回前台恢复 ================= */

    let wakeLock = null;

    async function acquireWake() {
        if (!('wakeLock' in navigator)) return;
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        } catch (e) { }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (settings.enabled && settings.backend === 'intiface') {
            if (!wakeLock && bp.devices.size) acquireWake();
            // 后台期间定时器被限流，节奏可能冻结：回前台把当前模式从头重启
            if (engine.mode !== 'stop') enginePlay(engine.mode);
        }
    });

    /* ================= 顶栏状态灯 / 急停 =================
       灰=禁用 · 橙=已启用但未连上后端 · 正常色=待机 · 粉色跳动=播放中
       单击=立即全停（禁用状态也照发，急停永远可用）
       双击或长按≈0.6秒=启用⇄禁用 */

    function setEnabled(on) {
        settings.enabled = on;
        if (!on) applyStop(); // 关总开关必停机
        $('#toysync_enabled').prop('checked', on);
        ctx.saveSettingsDebounced();
        updateTopIcon();
        toastr.info(on ? '已启用' : '已禁用', 'Toy Sync');
    }

    function updateTopIcon() {
        const el = $('#toysync_icon');
        if (!el.length) return;
        // http 后端 no-cors 探不到存活，不标未连接色
        const connected = settings.backend !== 'intiface' || (bp.ws && bp.ws.readyState === 1);
        el.toggleClass('toy-off', !settings.enabled);
        el.toggleClass('toy-warn', settings.enabled && !connected);
        el.toggleClass('toy-active', settings.enabled && connected && curMode !== 'stop');
        let state;
        if (!settings.enabled) state = '已禁用';
        else if (!connected) state = '未连接 Intiface';
        else state = curMode;
        el.attr('title', `Toy Sync：${state}\n单击=立即全停 · 双击/长按=启用⇄禁用`);
    }

    function addTopIcon() {
        const holder = $('#top-settings-holder');
        if (!holder.length) return; // 顶栏结构对不上就放弃图标，不影响核心功能

        $('head').append(`<style>
            #toysync_icon.toy-off { opacity: .35; }
            #toysync_icon.toy-warn { color: #e6a23c; }
            #toysync_icon.toy-active { color: #ff6b81; animation: toysync-pulse 1.1s ease-in-out infinite; }
            @keyframes toysync-pulse { 50% { transform: scale(1.25); opacity: .7; } }
        </style>`);
        holder.append(`
        <div id="toysync_drawer" class="drawer">
            <div class="drawer-toggle">
                <div id="toysync_icon" class="drawer-icon fa-solid fa-heart-pulse fa-fw closedIcon interactable" tabindex="0"></div>
            </div>
        </div>`);

        const el = $('#toysync_icon');
        let pressTimer = null, longPressed = false;
        el.on('pointerdown', () => {
            longPressed = false;
            pressTimer = setTimeout(() => { longPressed = true; setEnabled(!settings.enabled); }, 600);
        });
        el.on('pointerup pointerleave pointercancel', () => clearTimeout(pressTimer));
        el.on('click', () => {
            if (longPressed) { longPressed = false; return; } // 长按抬手附带的 click，吃掉
            applyStop();
            toastr.info('已全部停止', 'Toy Sync');
        });
        el.on('dblclick', () => setEnabled(!settings.enabled)); // 双击前的两次单击各触发一次停止，无害
        el.on('contextmenu', e => e.preventDefault()); // 手机长按不弹系统菜单
        updateTopIcon();
    }

    /* ================= 设置面板 ================= */

    function addSettingsUI() {
        const html = `
        <div class="toy-sync-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>🔗 Toy Sync</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label class="checkbox_label">
                        <input type="checkbox" id="toysync_enabled"><span>启用</span>
                    </label>
                    <label class="checkbox_label">
                        <input type="checkbox" id="toysync_hide"><span>隐藏消息里的标记</span>
                    </label>
                    <label for="toysync_backend">控制后端</label>
                    <select id="toysync_backend" class="text_pole">
                        <option value="intiface">Intiface Central（推荐，支持数百款设备）</option>
                        <option value="http">HTTP 模式服务器（进阶，自定义硬件）</option>
                    </select>

                    <div id="toysync_intiface_block">
                        <label for="toysync_ws">Intiface 地址</label>
                        <input type="text" id="toysync_ws" class="text_pole" placeholder="ws://127.0.0.1:12345">
                        <div class="flex-container">
                            <input type="button" class="menu_button" id="toysync_connect" value="连接">
                            <input type="button" class="menu_button" id="toysync_disconnect" value="断开">
                        </div>
                        <div class="st" id="toysync_status">未连接</div>
                        <div id="toysync_devices"><small>未发现设备</small></div>
                    </div>

                    <div id="toysync_http_block">
                        <label for="toysync_http">服务器地址</label>
                        <input type="text" id="toysync_http" class="text_pole" placeholder="http://localhost:9090">
                        <input type="button" class="menu_button" id="toysync_test" value="测试连接">
                    </div>

                    <div id="toysync_mode">当前模式：stop</div>
                    <input type="button" class="menu_button" id="toysync_stop" value="⏹ 全部停止" style="width:100%">
                </div>
            </div>
        </div>`;
        $('#extensions_settings2').append(html);

        $('#toysync_enabled').prop('checked', settings.enabled).on('change', function () {
            setEnabled(this.checked);
        });
        $('#toysync_hide').prop('checked', settings.hideMarkers).on('change', function () {
            settings.hideMarkers = this.checked;
            ctx.saveSettingsDebounced();
        });
        $('#toysync_backend').val(settings.backend).on('change', function () {
            applyStop(); // 切后端前先停旧后端
            settings.backend = this.value;
            toggleBlocks();
            updateTopIcon(); // "未连接"判定依赖后端类型
            ctx.saveSettingsDebounced();
        });
        $('#toysync_ws').val(settings.intifaceUrl).on('input', function () {
            settings.intifaceUrl = $(this).val().trim();
            ctx.saveSettingsDebounced();
        });
        $('#toysync_http').val(settings.httpUrl).on('input', function () {
            settings.httpUrl = $(this).val().trim();
            ctx.saveSettingsDebounced();
        });
        $('#toysync_connect').on('click', () => { bpConnect(); acquireWake(); });
        $('#toysync_disconnect').on('click', bpDisconnect);
        $('#toysync_test').on('click', testHttp);
        $('#toysync_stop').on('click', applyStop);

        toggleBlocks();
    }

    function toggleBlocks() {
        $('#toysync_intiface_block').toggle(settings.backend === 'intiface');
        $('#toysync_http_block').toggle(settings.backend === 'http');
    }

    async function testHttp() {
        const base = settings.httpUrl.replace(/\/+$/, '');
        try {
            await fetch(`${base}/state`, { cache: 'no-store' });
            toastr.success('已连接', 'Toy Sync');
        } catch {
            try {
                await fetch(`${base}/state`, { mode: 'no-cors', cache: 'no-store' });
                toastr.info('服务器可达（未配 CORS 头，不影响控制）', 'Toy Sync');
            } catch {
                toastr.error('连接失败，检查服务器是否在跑、地址是否正确', 'Toy Sync');
            }
        }
    }

    /* ================= 启动 ================= */

    jQuery(() => {
        addSettingsUI();
        addTopIcon();
        ctx.eventSource.on(ctx.eventTypes.MESSAGE_RECEIVED, onMessageReceived);
        ctx.eventSource.on(ctx.eventTypes.CHARACTER_MESSAGE_RENDERED, onMessageRendered);
        ctx.eventSource.on(ctx.eventTypes.CHAT_CHANGED, onChatChanged);
        console.log(`[${EXT}] 已加载`);
    });
})();
