window.__ModuleLoader__.load({
  id: 'dsh-qq-persona',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const 卡片 = {
      border: '1px solid var(--dsw-alias-border-2, rgba(127,127,127,0.25))',
      borderRadius: '12px',
      padding: '14px 16px',
      marginBottom: '12px',
    };
    const 标题 = { fontSize: '14px', fontWeight: 600, marginBottom: '4px' };
    const 说明 = { fontSize: '12px', opacity: 0.65, lineHeight: '18px' };

    function 面板() {
      const [数据, 设数据] = React.useState(null);
      const [错, 设错] = React.useState('');
      const [忙, 设忙] = React.useState('');

      const 刷新 = React.useCallback(() => {
        fetch('/api/qq-persona/list')
          .then((r) => r.json())
          .then((s) => 设数据(s))
          .catch((e) => 设错(String(e)));
      }, []);

      React.useEffect(() => {
        刷新();
        const 定时 = setInterval(刷新, 15000);
        return () => clearInterval(定时);
      }, [刷新]);

      const 应用 = async (id) => {
        if (忙) return;
        设忙(id);
        设错('');
        try {
          const r = await fetch('/api/qq-persona/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });
          const j = await r.json();
          if (!j.ok) 设错(j.error || '切换失败');
          刷新();
        } catch (e) {
          设错(String(e));
        } finally {
          设忙('');
        }
      };

      if (!数据) {
        return h('div', { style: { padding: '8px 0', opacity: 0.6 } }, 错 || '读性格预设中…');
      }

      const 预设cards = (数据.presets || []).map((p) => {
        const 是当前 = p.id === 数据.active;
        return h(
          'button',
          {
            key: p.id,
            type: 'button',
            onClick: () => 应用(p.id),
            disabled: Boolean(忙),
            style: {
              ...卡片,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '14px',
              width: '100%',
              textAlign: 'left',
              cursor: 忙 ? 'default' : 'pointer',
              background: 是当前 ? 'var(--dsw-alias-accent-1, #4d8dff)' : 'transparent',
              borderColor: 是当前
                ? 'var(--dsw-alias-accent-1, #4d8dff)'
                : 'var(--dsw-alias-border-2, rgba(127,127,127,0.35))',
              opacity: 忙 && 忙 !== p.id ? 0.5 : 1,
            },
          },
          h(
            'div',
            { style: { flex: 1 } },
            h('div', { style: { ...标题, color: 是当前 ? '#fff' : 'inherit' } }, `${p.name}${是当前 ? ' · 当前' : ''}`),
            h('div', { style: { ...说明, color: 是当前 ? 'rgba(255,255,255,0.85)' : 'inherit' } }, p.desc || ''),
          ),
          h(
            'div',
            { style: { fontSize: '12px', fontWeight: 700, color: 是当前 ? '#fff' : 'var(--dsw-alias-accent-1, #4d8dff)' } },
            忙 === p.id ? '切换中…' : 是当前 ? '✓' : '切换',
          ),
        );
      });

      return h(
        'div',
        null,
        h(
          'div',
          { style: 卡片 },
          h('div', { style: 标题 }, '人物性格预设'),
          h(
            'div',
            { style: 说明 },
            `点一下就换。「姓名：${数据.name ?? '大鲸鱼'}，${数据.age ?? 22} 岁」。下面骨架（说话方式/语音/称呼/自我记忆系统）不随性格变，切性格不影响记忆管理。`,
          ),
        ),
        预设cards,
        h(
          'div',
          { style: 卡片 },
          h('div', { style: 标题 }, '自定义性格'),
          h(
            'div',
            { style: 说明 },
            '想加自己的性格：编辑 <DSH_HOME>/qq-persona/presets.json，仿照现有条目加一个 { id, name, desc, character }，保存后关掉这个面板再打开就有。character 就是【性格】段（含【性格】这行）。',
          ),
        ),
        错
          ? h('div', { style: { ...说明, color: 'var(--dsw-alias-danger-1, #ff5d5d)', marginTop: '8px' } }, 错)
          : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'qq-persona', order: 31, label: '人物性格' },
            面板,
          ),
        );
      },
    };
  },
});