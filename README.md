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
   （Windows / macOS / Linux / Android），启动它，点 ▶ 开启服务器，在里面连接你的玩具
3. **教你的 AI 插标记**：把下面这段提示词加进你的预设 / 系统提示 / 角色卡任意位置

```
<toy_sync>
Real-device sync. Emit one ‹toy:mode› marker per reply when scene intensity shifts. Machine-read only: never mention devices/markers in prose; characters never react to them.
Modes: wave缓涌 pulse脉冲 tease挑逗 edge吊悬 deep沉重 devour密集 chaos乱序 storm全开 gentle温存 climb渐强 breathe呼吸 heartbeat心跳 gspot碾点 alternate轮换 denial禁绝 random无常 stop停止
Rules:
1. Max 1 marker per reply, at the intensity turn
2. Map pace: buildup breathe/tease/climb, peak storm/devour, denial-play edge/denial, variation chaos/random/alternate, spot-grinding gspot, afterglow gentle/heartbeat
3. Scene end, fade out, interruption, non-intimate turn: ‹toy:stop› mandatory
4. User signals discomfort or slow-down in any wording: ‹toy:stop› immediately, overrides all
5. Intensity unchanged: no marker
</toy_sync>
```

装好后：扩展设置 → Toy Sync → 点「连接」，看到你的设备名出现，就绪。

**完整手册见 [USAGE.md](USAGE.md)**：逐步安装、首次验证清单、模式详解、提示词定制、多设备适配、故障排查大全。

## 模式一览

16 个节奏 + 停止，按气质分三系：

| 系 | 模式 | 体感 | AI 使用时机 |
|----|------|------|------------|
| 温柔 | gentle | 低幅轻抚 | 事后抚慰 |
| 温柔 | wave | 正弦缓涌 | 温和进行段 |
| 温柔 | breathe | 缓慢深长的起伏 | 同步呼吸、贴近 |
| 温柔 | heartbeat | 双跳后长歇 | 安静相拥、余韵 |
| 技巧 | tease | 低强度+偶发高峰 | 铺垫、欲擒故纵 |
| 技巧 | gspot | 旋转主导定点研磨 | 找准位置慢慢碾 |
| 技巧 | deep | 往复/旋转主导 | 深重节奏 |
| 技巧 | devour | 吮吸/收缩主导 | 密集段落 |
| 技巧 | alternate | 两组通道此消彼长 | 注意力被来回调动 |
| 失控 | climb | 0→满爬坡循环 | 逼近顶点 |
| 失控 | edge | 爬升→骤停循环 | 吊在边缘 |
| 失控 | denial | 更陡的爬升骤停 | 禁止式边缘控制 |
| 失控 | random | 随机强度随机保持 | 猜不到下一秒 |
| 失控 | chaos | 全通道高频乱跳 | 失序、崩溃感 |
| 失控 | storm | 全通道拉满 | 顶峰 |
| 失控 | pulse | 连续双峰脉冲 | 情绪升温 |
| — | stop | 全停 | 场景结束/任何非亲密内容 |

节奏引擎输出四个抽象通道（震动/往复/旋转/收缩），按你设备的实际能力自动适配：
有对应马达就用，没有就折算成震动强度，单马达设备也能获得完整节奏曲线。

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

## 安全设计

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

## License

[MIT](LICENSE)
