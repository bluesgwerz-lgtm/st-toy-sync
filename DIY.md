# DIY 后端：让不被支持的玩具也能用

Intiface 不认识你的玩具？这篇教你把**任意 BLE 蓝牙玩具**接进 Toy Sync——
自己反编译官方 APP 拿到协议，起一个本地小服务器，扩展切到 HTTP 后端即可。

> 本文所有型号名、UUID、指令字节都是**虚构示例**，仅用来演示格式。
> 你的设备几乎一定不一样，必须按第一步反编译出你自己的值。

---

## 先别急着拆：三条路选一条

| 你的情况 | 走哪条 | 难度 |
|---------|--------|------|
| 设备在 [iostindex.com](https://iostindex.com/) 列表里 | Intiface 直连，看 [USAGE.md](USAGE.md) 就行 | ★ |
| 不在列表，但字节格式和某个已支持型号一致 | Intiface 的 User Device Config 映射（不用写代码） | ★★ |
| 完全不被认识 | **本文的 DIY 后端** | ★★★ |

第三条路虽然最麻烦，但换来的是**四通道全功能**（震动/伸缩/旋转/吮吸），
往往比映射方案（常常只剩震动）体验更完整。

> **iOS 用户注意**：这条路和 Intiface 一样，在 iPhone/iPad 上单机不可用——
> iOS 浏览器不支持 Web Bluetooth。需要一台安卓手机或电脑来跑蓝牙那一端。

---

## 你需要准备的

- 一部**安卓**手机（跑蓝牙 + 本地服务器）
- 你的 BLE 蓝牙玩具（能被官方 APP 控制的那种）
- 你玩具品牌的官方 APP 安装包（`.apk`）
- 三个 App：**Termux**（[GitHub Releases](https://github.com/termux/termux-app/releases)）、
  **nRF Connect**（应用商店搜）、**APK 提取器**（应用商店搜）
- 一个能陪你聊天的 AI（帮你读反编译代码、改字节）

---

## 第一步：反编译官方 APP，拿到你的玩具协议

每个品牌的指令格式都不同，得从官方 APP 里"挖"出来。

### 1.1 拿到 APK

- 手机已装官方 APP → 用 **APK 提取器**导出 `.apk`
- 或去 [apkpure.com](https://apkpure.com) / [apkmirror.com](https://apkmirror.com) 搜品牌名下载

### 1.2 反编译

**在线**（省事，但要上传 APK）：[javadecompilers.com/apk](http://www.javadecompilers.com/apk)
上传 → 等反编译 → 下载解压。

**本地**（不想上传的话）：电脑装 [jadx-gui](https://github.com/skylot/jadx/releases)，
直接打开 APK，不联网。

### 1.3 搜关键词

在解压出的代码里全文搜：

| 搜 | 找什么 |
|----|--------|
| `FFE0` `FFE1` `FFE2` / `AE00` `AE01` `AE02` | BLE Service / 读写特征 UUID |
| `writeCharacteristic` | 发指令的代码，指令字节就在附近 |
| 成对出现的固定十六进制字节（常见于帧头/帧尾，你的设备值需自己确认） | 指令格式 |
| `vibrat` `thrust` `suck` `rotate` | 各功能对应的命令码 |
| `connect` `init` | 连接后要先发的握手序列 |

看不懂反编译代码？**把整个文件贴给 AI，让它帮你分析**，比自己翻快得多。

### 1.4 你要整理出这些

```
BLE Service UUID：      例如 0xFFE0
Write 特征 UUID：       例如 0xFFE1
Notify 特征 UUID：      例如 0xFFE2
指令格式：              例如 [帧头, CMD, ..., LEVEL, 帧尾]
各功能 CMD 值：         例如 震动=0xNN  吮吸=0xNN
强度范围：              例如 0-255 或 0-7
初始化序列：            连接后必须先发的握手指令
持续控制方式：          多数设备要每 ~100ms 重发当前指令，否则会自动停
```

### 1.5 示例（**虚构，切勿照抄**）

下面这套是编出来演示格式的，帮你理解"整理成什么样"——不是任何真实设备的协议：

```
UUID（示例）：
  Service 0xFFE0 / Write 0xFFE1 / Notify 0xFFE2

指令格式（示例，7 字节）：
  [0xHH, CMD, 0x00, 0x00, FLAG, LEVEL, 0xTT]
  0xHH = 你的帧头   0xTT = 你的帧尾

CMD 值（示例）：
  0xV1 → 震动（LEVEL = 强度）
  0xV2 → 伸缩（LEVEL = 级数）
  0xV3 → 旋转（LEVEL = 强度）
  0xV4 → 吮吸（LEVEL = 强度）

停止（示例）：把 LEVEL 位置 0 重发，如 [0xHH,0xV1,0x00,0x00,0x00,0x00,0xTT]

初始化序列（示例）：连接后按顺序发几条握手/复位帧，各隔 100~200ms
```

把你**真实**的反编译结果，连同下面第五步的 HTML 一起发给 AI，
让它替你把占位符换成真字节。

---

## 第二步：用 nRF Connect 验证设备

1. 玩具开机，指示灯闪烁
2. nRF Connect → **SCAN** → 找到你的设备（看名字或 MAC）
3. **CONNECT** → 确认能看到第一步找到的 Service UUID
4. 记下设备名和 MAC
5. **断开连接**（重要！蓝牙同一时刻只能被一个 App 占用）

---

## 第三步：Termux 环境（一次性）

```bash
pkg update
pkg install python
pip install bleak
termux-setup-storage
```

弹权限请求点**允许**。

---

## 第四步：本地服务器

Termux 里整段粘贴：

```bash
cat > server.py << 'PYEOF'
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
state = {'mode':'stop'}
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        p=urlparse(self.path);q=parse_qs(p.query)
        if p.path in ['/','/index.html']:
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers()
            self.wfile.write(open('/sdcard/Download/toy.html','rb').read())
        elif p.path=='/state':
            self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers()
            self.wfile.write(json.dumps(state).encode())
        elif p.path=='/set':
            if 'mode' in q:state['mode']=q['mode'][0]
            self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers()
            self.wfile.write(json.dumps(state).encode())
        else:
            self.send_response(404);self.end_headers()
    def log_message(self,*a):pass
print("控制服务器启动 -> http://localhost:9090")
HTTPServer(('',9090),H).serve_forever()
PYEOF
```

这个服务器只做一件事：记住"当前模式"，并把控制页面吐给浏览器。
真正驱动蓝牙的是下一步的 HTML。

---

## 第五步：控制页面

把下面的 HTML 存成 `toy.html`，放进手机 **Download 文件夹**
（WPS：新建文档 → 粘贴 → 另存为 `toy.html` → 存到 Download）。

> ⚠️ 顶部的 `CMD` / `STOP` / `SERVICE_UUIDS` / `INIT_SEQ` **全是占位示例**，
> 必须换成你第一步反编译出的真字节，否则连上了也不会动。
> 不会改？把你的反编译结果和这段 HTML 一起发给 AI。

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI 遥控器</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a2e;color:#fff;font-family:sans-serif;text-align:center;padding:15px;max-width:500px;margin:0 auto}
h2{color:#e94560;margin:10px 0}
.sec{background:#16213e;border-radius:15px;padding:15px;margin:10px 0}
.sec h3{color:#e94560;margin-bottom:10px;font-size:16px}
.btn{background:#e94560;color:#fff;border:none;padding:12px 24px;border-radius:20px;font-size:16px;margin:5px;cursor:pointer}
.btn.ok{background:#27ae60}
.stop-btn{background:#c0392b;padding:15px 40px;font-size:18px;border-radius:25px;margin:15px;border:none;color:#fff;cursor:pointer}
.sr{display:flex;align-items:center;margin:8px 0}
.sr label{width:50px;text-align:right;margin-right:10px;font-size:14px}
.sr input[type=range]{flex:1;accent-color:#e94560}
.sr span{width:40px;text-align:left;margin-left:8px;font-size:14px}
.mg{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:10px 0}
.mb{background:#0f3460;color:#fff;border:2px solid transparent;padding:10px 16px;border-radius:12px;font-size:13px;cursor:pointer}
.mb.active{border-color:#e94560;background:#e94560}
.st{font-size:13px;color:#aaa;margin:5px 0}
.tip{font-size:12px;color:#888;margin:8px 0;line-height:1.4}
</style>
</head>
<body>
<h2>AI 遥控器</h2>

<div class="sec">
<h3>设备连接</h3>
<p class="tip">先关闭 nRF Connect 和官方 APP，确保没有别的 App 连着玩具</p>
<button class="btn" id="btn1" onclick="conn(1)">连接设备 1</button>
<p class="st" id="s1">未连接</p>
<button class="btn" id="btn2" onclick="conn(2)">连接设备 2</button>
<p class="st" id="s2">未连接</p>
<p class="st" id="sWake">🔒 屏幕常亮：未启用（连接设备后自动开启）</p>
<p class="tip">只有一个设备？连设备 1 即可，设备 2 跳过</p>
</div>

<div id="ctl" style="display:none">
<div class="sec">
<h3 id="d1name">设备 1</h3>
<div class="sr"><label>震动</label><input type="range" min="0" max="255" value="0" oninput="set(1,'vib',this.value)" id="d1vib"><span id="d1vibT">0</span></div>
<div class="sr"><label>伸缩</label><input type="range" min="0" max="7" value="0" oninput="set(1,'thr',this.value)" id="d1thr"><span id="d1thrT">0</span></div>
<div class="sr"><label>旋转</label><input type="range" min="0" max="255" value="0" oninput="set(1,'rot',this.value)" id="d1rot"><span id="d1rotT">0</span></div>
<div class="sr"><label>吮吸</label><input type="range" min="0" max="255" value="0" oninput="set(1,'suc',this.value)" id="d1suc"><span id="d1sucT">0</span></div>
</div>

<div class="sec">
<h3 id="d2name">设备 2</h3>
<div class="sr"><label>震动</label><input type="range" min="0" max="255" value="0" oninput="set(2,'vib',this.value)" id="d2vib"><span id="d2vibT">0</span></div>
<div class="sr"><label>伸缩</label><input type="range" min="0" max="7" value="0" oninput="set(2,'thr',this.value)" id="d2thr"><span id="d2thrT">0</span></div>
<div class="sr"><label>旋转</label><input type="range" min="0" max="255" value="0" oninput="set(2,'rot',this.value)" id="d2rot"><span id="d2rotT">0</span></div>
<div class="sr"><label>吮吸</label><input type="range" min="0" max="255" value="0" oninput="set(2,'suc',this.value)" id="d2suc"><span id="d2sucT">0</span></div>
</div>

<div class="sec">
<h3 id="modeTitle">节奏模式</h3>
<div class="mg">
<button class="mb" data-mode="gentle" onclick="playP('gentle')">温存</button>
<button class="mb" data-mode="wave" onclick="playP('wave')">波浪</button>
<button class="mb" data-mode="breathe" onclick="playP('breathe')">呼吸</button>
<button class="mb" data-mode="heartbeat" onclick="playP('heartbeat')">心跳</button>
<button class="mb" data-mode="tease" onclick="playP('tease')">挑逗</button>
<button class="mb" data-mode="gspot" onclick="playP('gspot')">G点</button>
<button class="mb" data-mode="deep" onclick="playP('deep')">深入</button>
<button class="mb" data-mode="devour" onclick="playP('devour')">吞噬</button>
<button class="mb" data-mode="alternate" onclick="playP('alternate')">交替</button>
<button class="mb" data-mode="climb" onclick="playP('climb')">攀升</button>
<button class="mb" data-mode="edge" onclick="playP('edge')">焦灼</button>
<button class="mb" data-mode="denial" onclick="playP('denial')">禁止</button>
<button class="mb" data-mode="random" onclick="playP('random')">随机</button>
<button class="mb" data-mode="chaos" onclick="playP('chaos')">失控</button>
<button class="mb" data-mode="storm" onclick="playP('storm')">风暴</button>
<button class="mb" data-mode="pulse" onclick="playP('pulse')">脉冲</button>
</div>
</div>
<button class="stop-btn" onclick="doStop()">全部停止</button>
</div>

<script>
/*
 * ========================================
 * 在这里填你的玩具协议（下面全是占位示例！）
 * ========================================
 * 用第一步反编译出的真字节替换：
 *   SERVICE_UUIDS — 你的 BLE Service UUID
 *   CMD           — 每种功能的指令前缀（不含强度和帧尾）
 *   STOP          — 每种功能的停止指令
 *   INIT_SEQ      — 连接后的初始化/握手序列
 * 下面的 0xHH(帧头) 0xTT(帧尾) 0xV1..0xV4(命令码) 都是假的，必须替换。
 * 不会改？把反编译结果和这段代码一起发给 AI。
 */

// BLE Service UUID（依次尝试）——换成你的
const SERVICE_UUIDS = [0xFFE0, 0xAE00];

// 指令前缀，发送时会追加 [LEVEL, 帧尾]——换成你的字节
const HEAD = 0xHH, TAIL = 0xTT;            // 帧头 / 帧尾
const CMD = {
  vib: [HEAD, 0xV1, 0x00, 0x00, 0x01],   // 震动
  thr: [HEAD, 0xV2, 0x00, 0x00, 0x00],   // 伸缩
  rot: [HEAD, 0xV3, 0x00, 0x00, 0x00],   // 旋转
  suc: [HEAD, 0xV4, 0x00, 0x00, 0x00]    // 吮吸
};

// 停止指令（LEVEL 位置 0）——换成你的字节
const STOP = {
  vib: [HEAD, 0xV1, 0x00, 0x00, 0x00, 0x00, TAIL],
  thr: [HEAD, 0xV2, 0x00, 0x00, 0x00, 0x00, TAIL],
  rot: [HEAD, 0xV3, 0x00, 0x00, 0x00, 0x00, TAIL],
  suc: [HEAD, 0xV4, 0x00, 0x00, 0x00, 0x00, TAIL]
};

// 初始化序列（连接后按顺序发）——换成你的字节，没有就留空数组 []
const INIT_SEQ = [
  { cmd: [HEAD, 0xV1, 0x00, 0x00, 0x01, 0xFF, TAIL], delay: 200 },
  { cmd: [HEAD, 0xV1, 0x00, 0x00, 0x00, 0x00, TAIL], delay: 100 }
];

// 多数设备要每 ~100ms 重发当前指令，否则自动停
const SEND_INTERVAL = 100;

/* ======================================== */

let devs=[null,{w:null},{w:null}],timers=[null,{},{}],pt=null,remoteMode='stop';

async function conn(n){
try{
document.getElementById('s'+n).textContent='搜索中...选择你的设备';
let d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:SERVICE_UUIDS});
document.getElementById('s'+n).textContent='连接中...';
let g=await d.gatt.connect();
let s;
for(let uuid of SERVICE_UUIDS){try{s=await g.getPrimaryService(uuid);break}catch(e){}}
if(!s)throw new Error('找不到 BLE Service');
let cs=await s.getCharacteristics(),wc=null;
for(let c of cs){if(c.properties.notify)try{await c.startNotifications()}catch(e){}}
for(let c of cs){if(c.properties.write||c.properties.writeWithoutResponse){wc=c;break}}
if(!wc)throw new Error('找不到 Write 特征');
for(let step of INIT_SEQ){await wc.writeValueWithoutResponse(new Uint8Array(step.cmd));await sl(step.delay)}
devs[n]={w:wc};
document.getElementById('s'+n).textContent='已连接 '+d.name;
document.getElementById('btn'+n).className='btn ok';
document.getElementById('d'+n+'name').textContent='设备 '+n+'：'+d.name;
document.getElementById('ctl').style.display='block';
acquireWake();
}catch(e){document.getElementById('s'+n).textContent='失败: '+e.message}}

async function snd(n,cmd){if(devs[n]&&devs[n].w)try{await devs[n].w.writeValueWithoutResponse(new Uint8Array(cmd))}catch(e){}}
function loop(n,key,cmd){stopK(n,key);snd(n,cmd);let t=setInterval(()=>snd(n,cmd),SEND_INTERVAL);timers[n][key]=t}
function stopK(n,key){if(timers[n][key]){clearInterval(timers[n][key]);timers[n][key]=null}}

function set(n,type,v){
v=parseInt(v);ui('d'+n+type,v);
if(v>0){let c=[...CMD[type],v,TAIL];loop(n,type,c)}
else{stopK(n,type);snd(n,STOP[type])}}

function doStop(){
if(pt){clearInterval(pt);pt=null}
for(let n=1;n<=2;n++){Object.keys(timers[n]).forEach(k=>{if(timers[n][k])clearInterval(timers[n][k]);timers[n][k]=null});
Object.keys(STOP).forEach(k=>snd(n,STOP[k]))}
['d1vib','d1thr','d1rot','d1suc','d2vib','d2thr','d2rot','d2suc'].forEach(id=>{let e=document.getElementById(id);if(e)e.value=0});
['d1vibT','d1thrT','d1rotT','d1sucT','d2vibT','d2thrT','d2rotT','d2sucT'].forEach(id=>{let e=document.getElementById(id);if(e)e.textContent='0'});
document.querySelectorAll('.mb').forEach(b=>b.classList.remove('active'));
document.getElementById('modeTitle').textContent='节奏模式'}

function playP(name){
doStop();
document.querySelectorAll('.mb').forEach(b=>b.classList.toggle('active',b.dataset.mode===name));
let s=0,M=Math;
const P={
wave:()=>{document.getElementById('modeTitle').textContent='波浪';pt=setInterval(()=>{let v=M.round((M.sin(s*0.04)+1)*110);let r=M.round((M.sin(s*0.03)+1)*80);s++;set(1,'vib',v);set(1,'rot',r);set(2,'vib',M.round(v*0.5))},SEND_INTERVAL)},
pulse:()=>{document.getElementById('modeTitle').textContent='脉冲';let a=[0,0,0,0,80,150,230,255,255,230,150,80,0,0,0,0,0,80,150,230,255,255,230,150,80,0,0,0,0,0,0,0];pt=setInterval(()=>{let v=a[s%a.length];s++;set(1,'vib',v);set(2,'suc',M.round(v*0.5))},SEND_INTERVAL)},
tease:()=>{document.getElementById('modeTitle').textContent='挑逗';let a=[25,25,25,25,25,25,25,30,35,40,50,70,100,160,220,255,255,220,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,25,25,25,25,25,25];pt=setInterval(()=>{let v=a[s%a.length];s++;set(1,'vib',v);set(2,'vib',M.round(v*0.6))},130)},
edge:()=>{document.getElementById('modeTitle').textContent='焦灼';pt=setInterval(()=>{let c=s%100;let v=0,t=0,sc=0;if(c<50){v=M.round(c*5);t=M.min(M.round(c/7),7);sc=M.round(c*3)}else if(c<55){v=255;t=7;sc=150}else{v=0;t=0;sc=0}s++;set(1,'vib',v);set(1,'thr',t);set(2,'suc',sc)},SEND_INTERVAL)},
deep:()=>{document.getElementById('modeTitle').textContent='深入';let tv=[0,1,2,3,4,5,6,7,7,7,7,7,6,5,4,3,2,1];let rv=[0,40,80,120,160,200,200,160,120,80,40,0];pt=setInterval(()=>{let t=tv[s%tv.length];let r=rv[s%rv.length];s++;set(1,'thr',t);set(1,'rot',r);set(1,'vib',M.round(t*30));set(2,'suc',M.round(r*0.4))},180)},
devour:()=>{document.getElementById('modeTitle').textContent='吞噬';pt=setInterval(()=>{let sc=M.round((M.sin(s*0.06)+1)*120);let v=M.round((M.cos(s*0.08)+1)*90);s++;set(2,'suc',sc);set(2,'vib',v);set(1,'vib',M.round(sc*0.7))},SEND_INTERVAL)},
chaos:()=>{document.getElementById('modeTitle').textContent='失控';pt=setInterval(()=>{if(s%3===0){set(1,'vib',M.round(M.random()*255));set(1,'thr',M.round(M.random()*7));set(1,'rot',M.round(M.random()*220));set(2,'suc',M.round(M.random()*220));set(2,'vib',M.round(M.random()*220))}s++},SEND_INTERVAL)},
storm:()=>{document.getElementById('modeTitle').textContent='风暴';set(1,'vib',255);set(1,'thr',7);set(1,'rot',220);set(2,'suc',220);set(2,'vib',255)},
gentle:()=>{document.getElementById('modeTitle').textContent='温存';pt=setInterval(()=>{let v=M.round(40+M.sin(s*0.02)*20);let r=M.round(30+M.sin(s*0.015)*15);let sc=M.round(35+M.sin(s*0.025)*20);s++;set(1,'vib',v);set(1,'rot',r);set(2,'suc',sc)},SEND_INTERVAL)},
climb:()=>{document.getElementById('modeTitle').textContent='攀升';pt=setInterval(()=>{let p=M.min(s/200,1);s++;set(1,'vib',M.round(p*255));set(1,'thr',M.min(M.round(p*7),7));set(1,'rot',M.round(p*200));set(2,'suc',M.round(p*200));set(2,'vib',M.round(p*200));if(p>=1)s=0},SEND_INTERVAL)},
breathe:()=>{document.getElementById('modeTitle').textContent='呼吸';pt=setInterval(()=>{let phase=s%80;let v,r;if(phase<40){v=M.round(20+(phase/40)*120);r=M.round(15+(phase/40)*80)}else{let d=(phase-40)/40;v=M.round(140-d*120);r=M.round(95-d*80)}s++;set(1,'vib',v);set(1,'rot',r);set(2,'suc',M.round(v*0.4))},SEND_INTERVAL)},
heartbeat:()=>{document.getElementById('modeTitle').textContent='心跳';let a=[0,0,180,255,200,80,0,0,160,240,180,60,0,0,0,0,0,0,0,0];pt=setInterval(()=>{let v=a[s%a.length];s++;set(1,'vib',v);set(1,'rot',M.round(v*0.6));set(2,'vib',M.round(v*0.4))},120)},
gspot:()=>{document.getElementById('modeTitle').textContent='G点';pt=setInterval(()=>{let r=M.round(140+M.sin(s*0.025)*60);let v=M.round(30+M.sin(s*0.02)*20);s++;set(1,'rot',r);set(1,'vib',v);set(1,'thr',0)},SEND_INTERVAL)},
alternate:()=>{document.getElementById('modeTitle').textContent='交替';pt=setInterval(()=>{let phase=s%100;let a,b;if(phase<50){a=phase/50;b=1-a}else{b=(phase-50)/50;a=1-b}s++;set(1,'vib',M.round(a*220+30));set(1,'rot',M.round(a*180));set(1,'thr',M.min(M.round(a*6),7));set(2,'suc',M.round(b*200));set(2,'vib',M.round(b*180))},SEND_INTERVAL)},
denial:()=>{document.getElementById('modeTitle').textContent='禁止';pt=setInterval(()=>{let c=s%80;let v=0,t=0,r=0,sc=0;if(c<60){let p=c/60;v=M.round(p*p*255);t=M.min(M.round(p*7),7);r=M.round(p*200);sc=M.round(p*180)}else if(c<65){v=255;t=7;r=200;sc=200}s++;set(1,'vib',v);set(1,'thr',t);set(1,'rot',r);set(2,'suc',sc)},SEND_INTERVAL)},
random:()=>{document.getElementById('modeTitle').textContent='随机';let nc=0,cv=0,cr=0,cs=0,ct=0;pt=setInterval(()=>{if(s>=nc){cv=M.round(M.random()*220+30);cr=M.round(M.random()*180);cs=M.round(M.random()*200);ct=M.round(M.random()*7);nc=s+M.round(M.random()*20+5)}s++;set(1,'vib',cv);set(1,'rot',cr);set(1,'thr',ct);set(2,'suc',cs)},SEND_INTERVAL)}
};if(P[name])P[name]()}

function ui(id,v){let e=document.getElementById(id);if(e)e.value=v;let t=document.getElementById(id+'T');if(t)t.textContent=v}
function sl(ms){return new Promise(r=>setTimeout(r,ms))}

async function pollState(){try{let r=await fetch('/state');let j=await r.json();if(j.mode!==remoteMode){remoteMode=j.mode;if(j.mode==='stop')doStop();else playP(j.mode)}}catch(e){}}
setInterval(pollState,500);

// 屏幕常亮：防止息屏后蓝牙 keepalive 和轮询被系统掐断
let wakeLock=null;
async function acquireWake(){
let el=document.getElementById('sWake');
if(!('wakeLock' in navigator)){el.textContent='🔒 屏幕常亮：此浏览器不支持，请手动关闭自动息屏';return}
try{
wakeLock=await navigator.wakeLock.request('screen');
el.textContent='🔒 屏幕常亮：已开启';
wakeLock.addEventListener('release',()=>{wakeLock=null;el.textContent='🔒 屏幕常亮：已释放，回到本页自动恢复'});
}catch(e){el.textContent='🔒 屏幕常亮：开启失败 '+e.message}}

// 回前台恢复：后台期间定时器被浏览器限流，节奏和轮询都会冻结
// 回来后立即向 server 对账，有节奏在跑就从头重启，防止半死不活的卡壳状态
document.addEventListener('visibilitychange',async()=>{
if(document.visibilityState!=='visible')return;
if(!wakeLock&&(devs[1].w||devs[2].w))acquireWake();
try{
let r=await fetch('/state');let j=await r.json();
remoteMode=j.mode;
if(j.mode==='stop'){if(pt)doStop()}else playP(j.mode);
}catch(e){}
});
</script>
</body>
</html>
```

---

## 第六步：接进 Toy Sync

服务器和页面就绪后，回到酒馆扩展设置：

1. 后端选 **HTTP 模式服务器**
2. 服务器地址填 `http://localhost:9090`（和上面 server.py 一致）
3. 点「测试连接」——服务器在跑就会成功
4. AI 回复里出现 `‹toy:wave›` 之类标记时，扩展自动 `GET /set?mode=wave`，
   `toy.html` 轮询到模式变化就切换节奏，玩具动起来

标记词表（`wave/pulse/tease/edge/deep/devour/chaos/storm/gentle/climb/`
`breathe/heartbeat/gspot/alternate/denial/random/stop`）
和 Intiface 后端完全一致，AI 提示词不用改。

> **每次使用顺序**：玩具开机 → 关掉 nRF Connect 和官方 APP →
> Termux 跑 `python server.py` → Chrome 开 `http://localhost:9090` →
> 连接设备 → **分屏**回酒馆聊天，保持本页在前台可见。
> Android 会限流后台标签页——本页纯后台时节奏和轮询都会冻结，
> 正式玩必须分屏。页面连接设备后会自动申请屏幕常亮，防息屏掐断蓝牙。

---

## 常见问题

**搜不到设备**：确认官方 APP 和 nRF Connect 都已关闭，玩具指示灯在闪。
蓝牙同一时刻只能被一个 App 占用。

**手动拖滑条一切正常，但 AI 标记发了玩具不动**：九成是页面从
`file:///sdcard/Download/toy.html` 直开的。`/state` 轮询走相对路径，
file:// 下全部静默失败——手动全好使、远程全失灵，极难排查。
AI 链路必须从 `http://localhost:9090` 打开页面（由 server.py 吐出）。

**节奏跑着跑着冻住了**：页面进了后台被 Android 限流。回到本页会自动
向服务器对账并重启节奏；正式玩请用分屏保持本页前台可见。

**连上了但不动**：`CMD`/`STOP`/`INIT_SEQ` 还是占位示例没换成真字节。
把反编译结果 + HTML 发给 AI 让它改。

**连了设备 1 搜不到设备 2**：本页用 `acceptAllDevices` 搜索，
弹出列表后稍等，所有设备都会出现，手动选即可。

**不想用服务器，只想手动玩**：Chrome 地址栏直接开
`file:///sdcard/Download/toy.html`，手动拖滑条和点模式都能用。
但 AI 远程链路（`/set` → `/state` 轮询）必须走 `http://localhost:9090`
开的页面，file:// 下轮询会静默失败（见上面第二条）。

**怎么判断我的玩具能不能 DIY**：nRF Connect 扫描能连上、
且有自定义 Service UUID（不是标准的 `0x1800`/`0x1801`）就大概率可以。

---

## 安全

- 全部在你手机本地运行，不经过任何外部服务器
- 蓝牙有效范围约 10 米，关掉 Termux 和 Chrome 即彻底断开
- 反编译仅用于让你自己的设备互通，请遵守当地法律和 APP 用户协议

---

*回 [USAGE.md](USAGE.md) · 有问题提 [Issue](https://github.com/bluesgwerz-lgtm/st-toy-sync/issues)*
