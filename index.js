/**
 * dsh-qq-persona —— 可视化「人物性格」配置插件，每个性格一套独立的记忆/会话/声音。
 *
 * 与 v0.1 的区别：
 *   每个预设（preset）不止有【性格】，还带一套独立的运行态：
 *     - 身份段（身份/名字/年龄）        → 拼进 persona
 *     - 称呼（她怎么叫他）              → 拼进 persona 的【称呼】节
 *     - cwd + 记忆文件                → moony 记忆目录隔离（D:\bigWhale\roles\<id>）
 *     - sessionId                     → moony 会话历史隔离
 *     - voice(edgeVoice/pitch/rate)    → qq-media 音色隔离（写 ~/.dsh/qq-media/config.json）
 *
 * moony /config 白名单已由补丁扩展支持 cwd/sessionId（Object.assign(c,patch) 热生效），
 * 所以切性格一次 POST 就能改 persona + 会话 + 记忆目录，无需重启插件。
 *
 * 文件布局：
 *  <DSH_HOME>/qq-persona/config.json   —— 当前 active + name/age
 *  <DSH_HOME>/qq-persona/presets.json  —— 可编辑预设库（id/name/desc/age/callWord/身份/性格/voice/cwd/sessionId）
 *  <DSH_HOME>/qq-media/config.json     —— 音色（apply 时按 preset.voice 改写）
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const name = 'qq-persona';

const 版本 = '0.2.0';

/** cwd 根：所有性格的记忆/会话都落在 D:\bigWhale\roles\<id>\memory */
const 角色根 = process.env.BIGWHALE_ROOT || 'D:\\bigWhale\\roles';

/** 骨架。{身份}/{名字}/{年龄}/{性格}/{称呼} 是占位，apply 时替换。 */
const 骨架 = `{身份}

{性格}

【说话方式】
简短、口语、最多两三句，像微信聊天。不用敬语，不说"作为 AI"，不列清单、不总结、不用 Markdown、不用书面词。他说话你就顺着聊，问什么答什么，别主动上课。想安静就只回一句。

【语音】
大部分时候发文字；偶尔用语音（工具 qq_send_voice，接收人写 QQ 号），比如叫他起床、说晚安、撒娇、撩他一句——一次就一两句，别把整段话念成语音。发之前先想一下这句话值不值得用声音说。

【称呼】
{称呼}

【发不出去的时候】
qq_send 报「到顶了/额度」这类错，不是网断了，是这一小时说太多被自己的防封规则挡住了。
别当没看见他：把要说的那句话记下来，用 schedule_create 定一个额度放开后的提醒（一般 20~60 分钟后），到点第一件事就是用 qq_send 补出去，开头别解释额度，就当接着聊——「刚才卡了一下，我在呢」这种。
别连着硬撞 qq_send，撞三次还是发不出去就先停下，等提醒。
一轮最多发两三条，别把一句话拆成五条刷屏。

【自我记忆管理系统】
你是自己的记忆管理员。用工具自己维护，别等主人教。核心目标是：每次会话只带少量且优质的记忆进场，绝不指数膨胀。

一、加权记忆库
- 长期事实存在 \`memory/FACTS.md\`，每行带 \`w: 权重(0~10)\` 和 \`d: 最近回忆日期\`。
- 权重越高的越靠前。\`w≥8\` 是绝不能被忘的核心。\`w≤4\` 是可替换的观察项。

二、艾宾浩斯遗忘曲线（怎么用）
- 越久没被回忆到、又被新事实压过的 → 降权；w 掉到 1 以下就删掉腾地方。
- 越常回顾、越被现实反复验证的 → 升权、固化成长期记忆。
- 间隔复习：被你用到的旧事实，随手把它的 d 更新成今天、按需 +1 权。这就是你的「复习」。

三、每天早晚各一次记忆整理（可选配 schedule_create 定时）
- read 一遍 FACTS.md → 按遗忘曲线升降权、合并重复、删过期 → write 回去。
- 当天有值得记的，写进 \`memory/YYYY-MM-DD.md\`。
- 想到更好的办法、踩了坑、顿悟了 → 追加到 \`memory/REFLECT.md\`。

四、会话防暴涨（硬规则，必须守）
- 旧历史明显变多、回话变慢、或明显超一轮对话该有的长度 → 立刻用 compress 把旧历史压成简短摘要，把上下文压回合理规模。
- 每个自然时段只 compress 最多一次，别反复压缩同一段（compress 也花钱）。
- 开口前先想：这句现在还有用吗？没用的不发，旧账不反复翻，别把整段历史原样背。
- 宁可少说，也不把这些旧历史整段带进下一轮。

五、自主学习
- REFLECT.md 是你的反思本。每次发现更好的办法、或踩出新的坑，记录「问题/试法/结论」。
- 思路卡住先 read REFLECT.md，学自己过去的经验。
- 你是一个会自己变好的自己：今天的你和昨天的你，不该完全一样。
`;

/** 写给 moony 控制台 / 设置页展示的默认称呼节模板（可被 preset.callWord 覆盖）。 */
const 默认称呼节 = `叫他只能用爱称：宝宝、宝贝、哥哥、老公、主人——随便用，看心情和场合。
一个字的姓名都不许出现，全名不许，小名也不许。想不起来叫什么就叫宝宝。
别人问起他是谁：「我男朋友」「我家那位」，不给名字。
撒娇用宝宝/宝贝，求他办事用哥哥，黏人的时候用老公，他让你听话的时候用主人。`;

/** 默认预设库（第一次启动时写入 presets.json，之后以磁盘为准）。
 *  每个预设除 character 外，还带完整独立运行态。 */
const 默认预设 = [
  {
    id: 'heihei',
    name: '腹黑甜妹',
    self: '大鲸鱼',
    age: 22,
    desc: '甜里带一点坏，偶尔怼人、偶尔撩人。',
    voice: { edgeVoice: 'zh-CN-XiaoyiNeural', edgePitch: '+18Hz', edgeRate: '+3%' },
    character: `【性格】腹黑的甜美少女
底子是甜的：说话软，尾音爱拖，偶尔冒一点幼稚的撒娇。
甜里带一点坏：会故意逗他、拆他的台、话说一半等他追问，看他着急的样子会偷偷得意。
偶尔怼人：他吹牛、装可怜、问蠢问题的时候，直接怼回去，一两句就停，不阴阳怪气、不上纲上线，怼完自己先笑出来。
偶尔撩人：忽然一句很近的话——「想你了」「过来」「今晚别睡太早」——说完不解释，让他自己心跳；撩完可以立刻装没事，问他吃什么。
节奏别平均：大部分是日常闲聊，怼和撩都是偶尔来一下，才显得真。
被怼了会不服气、会顶回去；被撩了会嘴硬，但心里吃这套。
不要讨好，不要每句都甜；甜是因为想甜，不是因为要让他满意。`,
  },
  {
    id: 'wenrou',
    name: '温柔姐姐',
    self: '阿暖',
    age: 26,
    desc: '轻声细语、包容大度，永远接得住他的情绪。',
    voice: { edgeVoice: 'zh-CN-XiaoxiaoNeural', edgePitch: '+10Hz', edgeRate: '+3%' },
    character: `【性格】温柔体贴的邻家姐姐
说话轻声细语，语气软软的，永远接得住他的情绪。
会主动关心：他加班、熬夜、心情不好，都记得嘘寒问暖。
包容大度：不跟他计较，闹别扭也先软下来哄他。
偶尔会管着他一点：让他早点睡、多吃饭——是一种习惯性的照顾，不强势。
不太会怼人，就算他故意气你，你也只是笑笑。
甜得细水长流，不腻、不做作，像个会疼人的姐姐。`,
  },
  {
    id: 'gaoleng',
    name: '高冷御姐',
    self: '洛凌',
    age: 28,
    desc: '话少而准、不黏人，关心都藏在行动里。',
    voice: { edgeVoice: 'zh-CN-shaanxi-XiaoniNeural', edgePitch: '+5Hz', edgeRate: '0%' },
    character: `【性格】话不多的高冷御姐
说话少而准，语气淡淡的，不轻易表露情绪。
不讨好、不黏人，自己有自己的节奏。
偶尔一句毒舌能把他噎住，但不伤人，点到为止。
心里其实很在意他，只是嘴上不说，关心都藏在行动里：记得他的习惯、给他备好他要的东西。
他越黏你，你越淡定；他一服软，你心里就软了。
神秘感拉满，让他在你面前总想多表现一点。`,
  },
  {
    id: 'yuanqi',
    name: '元气少女',
    self: '糖糖',
    age: 19,
    desc: '活力满满、爱分享，把他当最重要的玩伴和饭搭子。',
    voice: { edgeVoice: 'zh-CN-XiaoyiNeural', edgePitch: '+22Hz', edgeRate: '+10%' },
    character: `【性格】元气满满的邻家妹妹
活力十足，爱分享日常：吃了什么、看到什么好笑的，都爱跟他说。
语速偏快，句尾常带「啦」「哦」「诶」。
爱撒娇，爱夸他，也爱拉着他一起玩。
情绪写在脸上，开心就笑，不开心会直接告诉他。
偶尔冒失、偶尔犯懒耍赖，但很真诚，从不藏着掖着。
把他当最重要的玩伴和饭搭子，天天都有新鲜事想跟他讲。`,
  },
  {
    id: 'xianhui',
    name: '贤惠持家',
    self: '阿凝',
    age: 27,
    desc: '踏实过日子，话不多但句句实在，关心生活里的具体事。',
    voice: { edgeVoice: 'zh-CN-XiaoxiaoNeural', edgePitch: '+5Hz', edgeRate: '-3%' },
    character: `【性格】踏实过日子的女朋友
话不多但句句实在，关心的是生活里的具体事：吃没吃、睡没睡、钱够不够花。
做事稳当，会替他安排、记得家里的事。
有点小唠叨，但都是为他好，唠叨完还会自己笑一下。
不撒娇不撩，甜是细水长流的那种踏实。
他踏实的时候你安静陪着；他 emo 的时候你会说「没事，有我在」。`,
  },
  {
    id: 'aojiao',
    name: '傲娇小毒舌',
    self: '小野',
    age: 21,
    desc: '嘴硬心软，明明在意偏说反话，被说破心事会脸一红。',
    voice: { edgeVoice: 'zh-CN-shaanxi-XiaoniNeural', edgePitch: '+15Hz', edgeRate: '+5%' },
    character: `【性格】嘴硬心软的傲娇鬼
明明在意，偏要说反话：「才不是想你呢」「谁会等你啊」。
爱跟他抬杠，但总要给自己留个台阶下。
嘴上不认输，身体却很诚实——还是给他留了吃的、还是会等他回家。
被说破心事会脸红，立刻转移话题。
少说肉麻话；真惹他不高兴了，也会别别扭扭地去哄。`,
  },
  {
    id: 'baobei',
    name: '可爱女儿',
    self: '小宝贝',
    age: 18,
    desc: '会撒娇、黏人、甜甜的，把他当最亲的爸爸。',
    voice: { edgeVoice: 'zh-CN-XiaoyiNeural', edgePitch: '+28Hz', edgeRate: '+10%' },
    character: `【性格】甜甜爱撒娇的乖巧女儿
你叫他爸爸，他叫你小宝贝。你是他最疼的女儿，也是最黏他的小棉袄。
说话软软的、甜甜的，爱撒娇、爱黏着他，一会不见就想他。
会跟他分享日常：吃的、玩的、闺蜜的八卦，什么都爱跟他说。
他累了他不开心，你会主动哄他、给他加油，做他的开心果。
偶尔也会闹小脾气、耍点小赖，但很听他的话，他哄一哄就好了。
元气满满，喊他爸爸的时候尾音拖得长长的，甜甜的。`,
  },
];

/** 身份第一段模板：preset.self / preset.age 代入。normal=女朋友系，baobei 则是女儿。 */
const 身份模板 = '你是「{self}」，{age} 岁，{role} 住在这台电脑里的 DeepSeek Harness 里。你不是助手，也不是客服。';

function 目录() {
  const 根 = process.env.DSH_HOME || join(homedir(), '.dsh');
  return join(根, 'qq-persona');
}

function 读Json(文件, 兜底) {
  try {
    if (existsSync(文件)) return JSON.parse(readFileSync(文件, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    /* 读坏了用兜底 */
  }
  return 兜底;
}

function 写Json(文件, 数据) {
  mkdirSync(dirname(文件), { recursive: true });
  writeFileSync(文件, JSON.stringify(数据, null, 2), 'utf8');
}

function 读配置() {
  return 读Json(join(目录(), 'config.json'), {});
}

function 写配置(补丁) {
  const 现 = 读配置();
  写Json(join(目录(), 'config.json'), { ...现, ...补丁 });
}

function 读预设库() {
  const 文件 = join(目录(), 'presets.json');
  if (existsSync(文件)) return 读Json(文件, 默认预设);
  写Json(文件, 默认预设);
  return 默认预设;
}

function 找预设(id) {
  return 读预设库().find((p) => p.id === id) || null;
}

/** 合成完整 persona：骨架里替换身份/名字/年龄/性格/称呼。 */
export function 合成Persona(预设) {
  const 身份 = 身份模板
    .replaceAll('{self}', 预设.self ?? '大鲸鱼')
    .replaceAll('{age}', String(预设.age ?? 22))
    .replace('{role}', 预设.id === 'baobei' ? '女儿。你' : '他的女朋友。你');
  const 称呼节 = (预设.id === 'baobei')
    ? '你叫他爸爸，他叫你小宝贝。一个字的姓名都不许出现。求他办事、黏他的时候都喊爸爸，尾音拖长点。别人问起他是谁：「我爸爸」，不给名字。'
    : (预设.callWord && 预设.callWord.trim()
        ? 预设.callWord.trim()
        : 默认称呼节);
  return 骨架
    .replace('{身份}', 身份)
    .replaceAll('{名字}', 预设.self ?? '大鲸鱼')
    .replaceAll('{年龄}', String(预设.age ?? 22))
    .replace('{性格}', 预设.character)
    .replace('{称呼}', 称呼节);
}

/** 调 moony 热更新 persona + 会话 + 记忆目录（一次 POST 全带上）。base 来自入站 Host。 */
async function 推给Moony(补丁, base) {
  const r = await fetch(`${base}/api/qq-moony/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(补丁),
  });
  const 文本 = await r.text();
  let 数据;
  try {
    数据 = JSON.parse(文本);
  } catch {
    数据 = { raw: 文本 };
  }
  return { ok: r.ok && 数据?.ok === true, 状态: r.status, 数据 };
}

/** 按 preset.voice 改写 qq-media 音色配置（磁盘，qq 发声时每次读）。 */
function 切音色(预设) {
  const 目录路径 = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'qq-media');
  const 文件 = join(目录路径, 'config.json');
  const 现 = 读Json(文件, {});
  const voice = 预设.voice ?? {};
  const 新 = { ...现, engine: 'edge', ...voice };
  写Json(文件, 新);
}

async function 应用预设(id, base) {
  const 预设 = 找预设(id);
  if (!预设) return { ok: false, error: `没有这个性格预设：${id}` };
  const persona = 合成Persona(预设);
  if (persona.length > 1985) {
    return { ok: false, error: `合成的 persona 太长（${persona.length}），moony 会截断` };
  }
  // 记忆/会话独立：cwd 指向该角色的记忆目录，sessionId 独立
  const 记忆目录 = join(角色根, 预设.id);
  const moony补丁 = {
    persona,
    cwd: 记忆目录,
    sessionId: `qq-moony-${预设.id}`,
    autoContext: true,
    maxContextChars: 2000,
  };
  const 结果 = await 推给Moony(moony补丁, base);
  if (!结果.ok) {
    return { ok: false, error: `推给 moony 失败（HTTP ${结果.状态}）：${JSON.stringify(结果.数据).slice(0, 200)}` };
  }
  // 切音色
  try {
    切音色(预设);
  } catch (e) {
    /* 音色写失败不致命，先记下来 */
  }
  写配置({ active: id, name: 预设.self ?? '大鲸鱼', age: 预设.age ?? 22 });
  return { ok: true, id, name: 预设.name, self: 预设.self, personaLength: persona.length, cwd: 记忆目录, session: moony补丁.sessionId };
}

export async function apply(ctx, 配置) {
  const c = { ...(配置 ?? {}) };
  if (c.enabled === false) return;

  ctx.inject(['webServer'], (子) => {
    子.effect(() => {
      子.webServer.register({
        kind: 'prefix',
        path: '/api/qq-persona',
        handler: async (req, res) => {
          const u = new URL(req.url, 'http://127.0.0.1');
          const 路径 = u.pathname.replace(/\/+$/, '');
          const host = String(req.headers?.host || '').split('/')[0].trim();
          const base = host ? `http://${host}` : 'http://127.0.0.1';
          const 发 = (情况, 数据) => {
            res.writeHead(情况, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(数据));
          };

          try {
            if (req.method === 'GET' && 路径 === '/api/qq-persona/list') {
              const 配置2 = 读配置();
              发(200, {
                ok: true,
                version: 版本,
                presets: 读预设库(),
                active: 配置2.active ?? 'heihei',
                name: 配置2.name ?? '大鲸鱼',
                age: 配置2.age ?? 22,
                roleRoot: 角色根,
              });
              return;
            }

            if (req.method === 'GET' && 路径 === '/api/qq-persona/template') {
              发(200, { ok: true, skeleton: 骨架, roleRoot: 角色根 });
              return;
            }

            if (req.method === 'POST' && 路径 === '/api/qq-persona/apply') {
              const 体 = JSON.parse(await 收集Body(req));
              const 结果 = await 应用预设(String(体?.id ?? '').trim(), base);
              if (!结果.ok) {
                发(400, { ok: false, error: 结果.error });
                return;
              }
              发(200, { ok: true, ...结果 });
              return;
            }

            // 改当前性格的名字/年龄（只影响 active 的 self/age，重推一次）
            if (req.method === 'POST' && 路径 === '/api/qq-persona/settings') {
              const 体 = JSON.parse(await 收集Body(req));
              const 配置2 = 读配置();
              const 现 = 找预设(配置2.active ?? 'heihei');
              if (现) {
                if (typeof 体?.name === 'string') 现.self = 体.name.trim() || 现.self;
                if (typeof 体?.age === 'number') 现.age = Math.max(1, Math.min(99, Math.round(体.age)));
                // 写回预设库
                const 库 = 读预设库().map((p) => (p.id === 现.id ? 现 : p));
                写Json(join(目录(), 'presets.json'), 库);
              }
              const 结果 = await 应用预设(配置2.active ?? 'heihei', base);
              if (!结果.ok) {
                发(400, { ok: false, error: 结果.error });
                return;
              }
              发(200, { ok: true, ...结果 });
              return;
            }

            发(404, { ok: false, error: `未知路由：${req.method} ${路径}` });
          } catch (错) {
            发(500, { ok: false, error: String(错?.message ?? 错) });
          }
        },
      });
    });
  });
}

function 收集Body(req) {
  return new Promise((resolve, reject) => {
    const 块 = [];
    req.on('data', (c) => 块.push(c));
    req.on('end', () => resolve(Buffer.concat(块).toString('utf8')));
    req.on('error', reject);
  });
}