# dsh-qq-persona

给 **DeepSeek Harness** 的 QQ 机器人（[`dsh-qq-moony`](https://www.npmjs.com/package/dsh-qq-moony)）配的**人格切换插件**。

一句话：**一个性格 = 一套独立的记忆 + 独立会话 + 独立声音**。在设置页点一下，机器人整个换人。

---

## 它解决什么问题

给 QQ 机器人写好人设之后，想换个人格通常只能去改配置文件、手动改 cwd、手动换音色，改完还得重启。而且换完之后，**新人格会看到上一个人格的全部聊天记录和记忆**，串味。

这个插件把「人格」做成一个可切换的预设包，每个预设自带：

| 维度 | 隔离方式 |
|---|---|
| 性格 | 拼进 moony 的 `persona`（热更新，不重启） |
| 记忆 | 独立 `cwd` → 独立的 `memory/` 目录 |
| 会话 | 独立 `sessionId` → 独立的聊天历史 |
| 声音 | 独立的 edge-tts 音色 / 音调 / 语速 |

切换时一次 `POST` 全改完，**不需要重启任何东西**。

## 功能

- **设置页可视化**：设置 → 「人物性格」，7 张卡片，当前的在用的会高亮打勾
- **点一下切换**：改 persona + cwd + sessionId + 音色，四样一起换
- **预设库可编辑**：`<DSH_HOME>/qq-persona/presets.json`，随便加/删/改
- **身份可调**：改名字、年龄，保存后立即重新推送
- **不碰 moony 本体**：只通过 moony 的 `/api/qq-moony/config` 接口热改配置

## 默认的 7 个预设

| id | 名字 | 年龄 | 音色 |
|---|---|---|---|
| `heihei` | 大鲸鱼 | 22 | 晓伊 +18Hz +3% |
| `wenrou` | 阿暖 | 26 | 晓晓 +10Hz +3% |
| `gaoleng` | 洛凌 | 28 | 晓妮 +5Hz |
| `yuanqi` | 糖糖 | 19 | 晓伊 +22Hz +10% |
| `xianhui` | 阿凝 | 27 | 晓晓 +5Hz -3% |
| `aojiao` | 小野 | 21 | 晓妮 +15Hz +5% |
| `baobei` | 小宝贝 | 18 | 晓伊 +28Hz +10% |

前六个是「他的女朋友」设定，最后一个 `baobei` 是「女儿」，称呼写死叫「爸爸」。这些都可以在 `presets.json` 里改。

## 安装

> 尚未发布到 npm，直接从 GitHub 装。

```bash
dsh plugin --profile desktop add github:Dnsthandsome/dsh-qq-persona
```

或者本地打包：

```bash
git clone https://github.com/Dnsthandsome/dsh-qq-persona.git
cd dsh-qq-persona
pnpm pack --pack-destination dist-pkgs
dsh plugin --profile desktop add dist-pkgs/dsh-qq-persona-0.2.0.tgz
```

## 前置条件

1. 装了 [`dsh-qq-moony`](https://www.npmjs.com/package/dsh-qq-moony)（机器人本体）
2. **moony 的 `/config` 白名单需要扩展支持 `cwd` / `sessionId` / `contextFiles`**

moony 原版的 `/api/qq-moony/config` 只认白名单里的字段，不包含 `cwd` 和 `sessionId`。要让记忆/会话隔离生效，需要往 `dsh-qq-moony/index.js` 的 POST `/config` 段加一小段补丁：

```js
// 人格体系扩展
if (typeof 想要.cwd === 'string' && 想要.cwd.trim()) patch.cwd = 想要.cwd.trim();
if (typeof 想要.sessionId === 'string' && 想要.sessionId.trim()) patch.sessionId = 想要.sessionId.trim();
if (Array.isArray(想要.contextFiles)) patch.contextFiles = 想要.contextFiles.map(String).slice(0, 10);
if (typeof 想要.maxContextChars === 'number') {
  patch.maxContextChars = Math.min(5000, Math.max(200, Math.round(想要.maxContextChars)));
}
if (typeof 想要.autoContext === 'boolean') patch.autoContext = 想要.autoContext;
```

补丁靠 moony 自己的 `Object.assign(c, patch)` 热生效，不用重启。

> 改完 moony 代码要在 profile 的 `cordis.patch.yml` 里把 `qq-moony` 的 `enabled` 翻 `true → false → true` 强制重载。

3. 可选：装了 `dsh-qq-media` 才有音色切换的实际效果（它读 `<DSH_HOME>/qq-media/config.json`）

## 配置

`<DSH_HOME>/qq-persona/config.json`：

```json
{
  "active": "heihei",
  "name": "大鲸鱼",
  "age": 22
}
```

`<DSH_HOME>/qq-persona/presets.json` 是一个预设数组，每个元素：

```json
{
  "id": "heihei",
  "name": "腹黑甜妹",
  "self": "大鲸鱼",
  "age": 22,
  "desc": "甜里带坏，偶尔怼人偶尔撩人",
  "voice": { "edgeVoice": "zh-CN-XiaoyiNeural", "edgePitch": "+18Hz", "edgeRate": "+3%" },
  "character": "【性格】\n腹黑的甜美少女……"
}
```

- `self` / `age` → 拼进身份段
- `character` → 拼进【性格】段
- `callWord`（可选）→ 覆盖默认的【称呼】节；不填就用默认的爱称规则
- `voice` → 切换时写进 qq-media 的配置

角色根目录用环境变量 `BIGWHALE_ROOT` 可以覆盖，默认 `D:\bigWhale\roles`。

## HTTP 接口

前缀 `/api/qq-persona`：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/list` | 所有预设 + 当前 active + 版本 |
| GET | `/template` | 人设骨架模板 + 角色根 |
| POST | `/apply` | 切换 `{id}` |
| POST | `/settings` | 改当前预设的 `{name, age}` 并重新推送 |

`apply` 返回：

```json
{
  "ok": true,
  "id": "heihei",
  "name": "腹黑甜妹",
  "self": "大鲸鱼",
  "personaLength": 1745,
  "cwd": "D:\\bigWhale\\roles\\heihei",
  "session": "qq-moony-heihei"
}
```

## 注意事项

- **persona 有 2000 字上限**（moony 会 `slice(0, 2000)`），插件在合成后会校验，超过 1985 字直接报错，不会静默截断
- **人设骨架是共用的**，只有【性格】段按预设变；这样换人格不会把「说话方式」「称呼规则」「记忆管理章程」这些丢
- 切换后**旧会话不会消失**，只是不再往里写；想回上一个性格，切回去就行，历史还在

## 配套

- [`dsh-qq-moony`](https://www.npmjs.com/package/dsh-qq-moony) —— 机器人本体
- `dsh-qq-media` —— 语音/图片/视频/文件出口（音色切换靠它）
- `dsh-qq-memory` —— 记忆管理面板（按 cwd 自动跟随当前人格）

## License

MIT
