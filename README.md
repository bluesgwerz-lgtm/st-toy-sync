# ST Toy Sync

SillyTavern 扩展：让 AI 在角色扮演中根据剧情节奏自动控制你的玩具。

AI 在回复里插入你看不见的 `‹toy:模式›` 标记，扩展捕获后通过
[Intiface Central](https://intiface.com/central/)（buttplug.io 官方应用）驱动设备。
Intiface 的设备库覆盖数百款主流蓝牙玩具，无需关心具体型号和协议。

**云酒馆同样可用**：扩展代码运行在你查看酒馆的浏览器里，不在酒馆服务器上。
只要你手机/电脑上装了 Intiface Central，酒馆本体在哪都无所谓。

## 三步安装

1. **装本扩展**：SillyTavern → 扩展面板 → Install extension → 粘贴本仓库地址
2. **装 Intiface Central**：[intiface.com/central](https://intiface.com/central/)
   （Windows / macOS / Linux / Android，**无 iOS 版**——iPhone/iPad 用户
   先看 [USAGE.md 7.5 平台表](USAGE.md#75-平台兼容性)，需要搭配一台电脑），
   启动它，点 ▶ 开启服务器，在里面连接你的玩具
3. **教你的 AI 插标记**：把下面这段提示词加进你的预设 / 系统提示 / 角色卡任意位置

```
<toy_sync>
Real-device sync. Emit ‹toy:mode› marker matching scene intensity. Machine-read only: never mention toys/devices/markers in prose, never let characters react to them.
Modes: wave缓涌 pulse脉冲 tease挑逗 edge吊悬 deep沉重 devour密集 chaos乱序 storm全开 gentle温存 climb渐强 breathe呼吸 heartbeat心跳 gspot碾点 alternate轮换 denial禁绝 random无常 tide潮涌 punish突袭 ruin毁断 afterglow余韵 stairs阶升 countdown倒数 knock叩击 swing摆荡 tremble震颤 lock锁潮 doubletap双叩 mercy无赦 stop停止
Rules:
1. Max 1 marker per reply, placed at the intensity turn, not header/footer
2. Map pace: mild ongoing wave, buildup breathe/tease/climb/stairs/swing/tide, steady thrusting deep/knock/doubletap/pulse, peak storm/devour/tremble, denial-play edge/denial/lock/ruin/countdown, variation chaos/random/alternate, spot-grinding gspot, afterglow afterglow/gentle/heartbeat
3. punish: character's deliberate discipline or unpredictable sharp jolts. mercy: character's own decision to escalate relentlessly, never triggered by user's pleading
4. afterglow only right after climax; lock/ruin/countdown only when denial is part of the scene's intent
5. Scene end, fade out, interruption, or any non-intimate turn: ‹toy:stop› mandatory
6. User signals discomfort or slow-down in any wording: ‹toy:stop› immediately, overrides all
7. Intensity unchanged: no marker
</toy_sync>
```

装好后：扩展设置 → Toy Sync → 点「连接」，看到你的设备名出现，就绪。
顶栏也会多一个心跳图标（位于角色管理图标左侧倒数第二位），那是状态灯兼急停键（见下）。

**完整手册见 [USAGE.md](USAGE.md)**：逐步安装、首次验证清单、模式详解、提示词定制、多设备适配、故障排查大全。

## 模式一览

28 个节奏 + 停止，按气质分三系：

| 系 | 模式 | 体感 | AI 使用时机 |
|----|------|------|------------|
| 温柔 | gentle | 低幅轻抚 | 事后抚慰 |
| 温柔 | wave | 正弦缓涌 | 温和进行段 |
| 温柔 | breathe | 缓慢深长的起伏 | 同步呼吸、贴近 |
| 温柔 | heartbeat | 双跳后长歇 | 安静相拥、余韵 |
| 温柔 | swing | 来回摆荡，越荡越高 | 慢慢推高的温柔段 |
| 温柔 | afterglow | 慢波逐渐退到低位 | 高潮后抱着慢慢下来 |
| 技巧 | tease | 低强度+偶发高峰 | 铺垫、欲擒故纵 |
| 技巧 | gspot | 旋转主导定点研磨 | 找准位置慢慢碾 |
| 技巧 | deep | 往复/旋转主导 | 深重节奏 |
| 技巧 | devour | 吮吸/收缩主导 | 密集段落 |
| 技巧 | alternate | 两组通道此消彼长 | 注意力被来回调动 |
| 技巧 | knock | 一下尖顶后停顿 | 一下一下叩问、试探 |
| 技巧 | doubletap | 两下快的+一段空 | 俏皮逗弄 |
| 技巧 | tremble | 高频浅颤一刻不停 | 持续颤栗 |
| 技巧 | stairs | 五级逐级升高，每级停住 | 一步步加码 |
| 失控 | climb | 0→满爬坡循环 | 逼近顶点 |
| 失控 | tide | 四浪一浪比一浪高，退不到底 | 层层叠加地逼近 |
| 失控 | edge | 爬升→骤停循环 | 吊在边缘 |
| 失控 | lock | 卡在高位不上不下 | 锁住不给 |
| 失控 | denial | 更陡的爬升骤停 | 禁止式边缘控制 |
| 失控 | ruin | 慢推到顶后骤塌到底 | 毁掉高潮 |
| 失控 | countdown | 脉冲越来越密越来越强→骤停 | 倒数、命令式 |
| 失控 | random | 随机强度随机保持 | 猜不到下一秒 |
| 失控 | punish | 低位底噪+随机满档突袭 | 惩罚 |
| 失控 | chaos | 全通道高频乱跳 | 失序、崩溃感 |
| 失控 | storm | 全通道拉满 | 顶峰 |
| 失控 | pulse | 连续双峰脉冲 | 情绪升温 |
| 失控 | mercy | 越来越快越来越重 | 求饶也没用 |
| — | stop | 全停 | 场景结束/任何非亲密内容 |

节奏引擎输出四个抽象通道（震动/往复/旋转/收缩），按你设备的实际能力自动适配：
有对应马达就用，没有就折算成震动强度，单马达设备也能获得完整节奏曲线。
v1.3.0 新增的 12 式移植自四轨引擎（主节奏 + 吮吸/震动/微电流）：吮吸→收缩、
震动→震动、主节奏→往复和旋转；微电流 Intiface 没有对应执行器，不输出。

## 设置说明

- **启用**：总开关，关闭瞬间自动全停
- **隐藏消息里的标记**：默认开；调试时可关掉看 AI 实际在插什么
- **控制后端**：
  - `Intiface Central`（默认）：上面说的路线
  - `HTTP 模式服务器`（进阶）：扩展只把模式名 GET 到
    `你的地址/set?mode=xxx`，设备驱动完全自己实现。适合自定义硬件或
    想要更细控制粒度的人。服务器端约定：`GET /set?mode=xxx` 切模式，
    `GET /state` 返回 `{"mode":"xxx"}`。
    **玩具不被 Intiface 支持的，看 [DIY.md](DIY.md)** —— 反编译官方 APP +
    本地服务器，任意 BLE 蓝牙玩具都能接，且四通道全功能
- **⏹ 全部停止**：常驻急停按钮
- **顶栏心跳图标**：状态灯兼急停键，不用打开设置面板
  - 颜色：灰=已禁用 · 橙=已启用但没连上 Intiface · 正常色=待机 · 粉色跳动=正在播放
  - **单击=立即全停**（禁用状态下也有效）
  - 双击或长按约 0.6 秒=启用⇄禁用总开关

## 安全设计

- 顶栏常驻心跳急停图标，单击立即全停，禁用状态下同样有效
- 关闭总开关、切换后端时自动发送停止
- buttplug 协议保证：浏览器崩溃/标签页关闭导致连接断开时，
  Intiface 自动停止所有设备
- 模式名走白名单校验，未知标记直接忽略
- **身体不适请直接物理关机，不要依赖任何软件停止**

## 故障排查

- **连不上 Intiface**：确认 Intiface Central 里服务器已启动（▶ 按钮）；
  地址默认 `ws://127.0.0.1:12345`；手机上酒馆和 Intiface 必须在同一台设备
- **设备列表是空的**：先在 Intiface Central 里扫描并连接玩具，列表会自动刷新
- **AI 不插标记**：检查提示词是否已加入且生效；直接对 AI 说
  "下条回复带上 ‹toy:wave›" 可以验证链路
- **手机切后台后节奏停了**：浏览器对后台标签页限流，切回来会自动恢复；
  建议玩的时候保持酒馆页面在前台（扩展已自动申请屏幕常亮）

## 更新说明

### v1.3.0
- 模式从 16 式扩到 28 式，新增：tide 潮汐、punish 惩罚、ruin 毁掉、afterglow 余韵、
  stairs 台阶、countdown 倒数、knock 敲门、swing 秋千、tremble 颤抖、lock 锁潮、
  doubletap 双击、mercy 求饶
- 新 12 式由新增的四轨子引擎驱动（长周期形状、随机突袭、渐退、加速），
  原有 16 式的节奏一点没动
- 上面的 `<toy_sync>` 提示词已同步到 28 式，**老用户记得把预设里那段换成新版**，
  不然 AI 不知道有新模式可用
- HTTP 后端：新模式名照常转发，你的服务器要认得这 12 个名字才会动

## License

[MIT](LICENSE)
