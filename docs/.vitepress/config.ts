import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { devDependencies } from '../../package.json'

// https://vitepress.dev/reference/site-config
export default withMermaid(
  defineConfig({
    vite: {
      build: {
        chunkSizeWarningLimit: 1500,
      }
    },
    head: [
      ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/logo.svg' }],
      ['meta', { name: 'keywords', content: 'VitePress,文档,知识分享,知行笔记,教程' }],
      ['meta', { property: 'og:title', content: '知行笔记' }],
      ['meta', { property: 'og:description', content: '基于 VitePress 的极简风格知识分享平台' }],
    ],
    base: '/',
    ignoreDeadLinks: true,
    title: "知行笔记",
    description: "基于 VitePress 的极简风格知识分享平台，知行合一，止于至善",
    lang: 'zh-CN',
    sitemap: {
      hostname: 'https://sntip.cn'
    },
    mermaid: {
      // 参考 https://mermaid.js.org/config/theming.html
      // 插件自动跟随 VitePress 深浅模式切换 dark 主题
      theme: 'default',
      themeVariables: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif',
      },
    },
    themeConfig: {
      logo: '/logo.svg',
      darkModeSwitchLabel: '主题',
      lightModeSwitchTitle: '切换到浅色模式',
      darkModeSwitchTitle: '切换到深色模式',
      sidebarMenuLabel: '菜单',
      returnToTopLabel: '回到顶部',
      skipToContentLabel: '跳转到内容',
      docFooter: {
        prev: '上一页',
        next: '下一页',
      },
      search: {
        provider: 'local',
        options: {
          translations: {
            button: {
              buttonText: '搜索',
              buttonAriaLabel: '搜索文档'
            },
            modal: {
              noResultsText: '无法找到相关结果',
              resetButtonTitle: '清除搜索条件',
              footer: {
                selectText: '选择',
                navigateText: '切换',
                closeText: '关闭'
              }
            }
          }
        }
      },
      // 上次更新时间
      lastUpdated: {
        text: '最后更新于',
        formatOptions: {
          dateStyle: 'short', // 可选值full、long、medium、short
          timeStyle: 'medium' // 可选值full、long、medium、short
        },
      },
      outline: { 
      level: [2,3], // 显示h2-h3级标题
      // level: 'deep', // 显示2-6级标题
      label: '当前页大纲' // 文字显示
      },
      nav: [
        { text: '首页', link: '/' },
        { text: '书签', link: 'https://my.sntip.cn' },
              // vitepress版本号
        { text: `VitePress ${ devDependencies.vitepress.replace('^','') }`, link: 'https://vitepress.dev/zh/', noIcon: true },
      ],
      sidebar: [
        {
          text: 'KEC平台',
          collapsed: false,
          items: [
            // 入门
            { text: '平台说明', link: '/kec/kec-manager' },
            // 部署与运维
            { text: '部署与运维指南', link: '/kec/deployment' },
            { text: 'Docker 部署指南', link: '/kec/docker_deployment' },
            { text: 'Docker 部署检查清单', link: '/kec/docker_checklist' },
            // 核心算法
            { text: '排课算法完整说明', link: '/kec/scheduling_algorithm' },
            { text: '排课算法审查报告', link: '/kec/scheduling_algorithm_audit' },
            // 技术专题
            { text: '学期计算逻辑', link: '/kec/semester-calculation' },
            { text: '代码格式化指南', link: '/kec/code_formatting' },
            { text: '命名规范迁移', link: '/kec/naming_convention_migration' },
            { text: '微信小程序评估报告', link: '/kec/miniprogram-assessment' },
            // 变更
            { text: '版本管理指南', link: '/kec/version_management' },
            { text: '变更日志', link: '/kec/changelog' },
          ],
        },

        {
          text: '构建指南',
          items: [
            { text: '基本构建', link: '/vite/basic-setup' },
            { text: '远程关联', link: '/vite/remote-connect' },
            { text: 'Git常用命令', link: '/vite/git-commands' },
            { text: '1Panel部署', link: '/vite/1panel-deploy' },
            { text: '1Panel脚本', link: '/vite/1panel-script' },
            { text: 'Gitee Go流水线', link: '/vite/gitee-go-deploy' },
            { text: 'Gitee Go优化V2', link: '/vite/gitee-go-deploy-v2' },
            { text: 'Markdown语法', link: '/vite/markdown-syntax' },
          ]
        },
        {
          text: 'AI应用指南',
          collapsed: false,
          items: [
            { text: '📖 提示词说明', link: '/AI_about/ai-index' },
            { text: '📊 国产大模型选择指南', link: '/AI_about/国产大模型选择指南' },
            {
              text: '🌐 国际模型',
              collapsed: true,
              items: [
                { text: 'OpenAI GPT', link: '/AI_about/openai-gpt-prompts' },
                { text: 'Anthropic Claude', link: '/AI_about/anthropic-claude-prompts' },
                { text: 'Google Gemini', link: '/AI_about/google-gemini-prompts' },
                { text: 'Meta Llama', link: '/AI_about/meta-llama-prompts' },
                { text: 'Mistral AI', link: '/AI_about/mistral-prompts' },
              ]
            },
            {
              text: '🇨🇳 国产模型',
              collapsed: true,
              items: [
                { text: 'DeepSeek', link: '/AI_about/deepseek-prompts' },
                { text: '千问(Qwen)', link: '/AI_about/qwen-prompts' },
                { text: '智谱AI GLM', link: '/AI_about/glm-prompts' },
                { text: 'Kimi (月之暗面)', link: '/AI_about/kimi-prompts' },
                { text: 'MiniMax', link: '/AI_about/minimax-prompts' },
                { text: '腾讯混元 Hy3', link: '/AI_about/hy3-prompts' },
                { text: '百度文心 ERNIE', link: '/AI_about/ernie-prompts' },
              ]
            },
          ]
        },
        {
          text: 'Linux 学习',
          collapsed: false,
          items: [
            { text: 'Ubuntu 文件系统架构与挂载详解', link: '/linux/ubuntu-filesystem-architecture' },
            { text: 'Ubuntu 日常使用说明', link: '/linux/ubuntu-daily-usage' },
          ]
        },
        {
          text: '其他',
          collapsed: true,
          items: [
            { text: '示例展示', link: '/other/eg/list' },
            { text: '页面样式', link: '/other/eg/page' },
            { text: '证件照尺寸', link: '/other/id-photo-sizes' },
            { text: '证件照美白', link: '/other/id-photo-whitening' },
            { text: '证件照灯光部署方案', link: '/other/id-photo-lighting' },
            { text: 'Lightroom处理流程与技巧', link: '/other/lightroom-workflow-and-tips' },
            { text: 'Lightroom预设使用指南', link: '/other/lightroom-preset-guide' },
            { text: 'WPS删除右键新建菜单', link: '/other/wps-del' },
            { text: '知行书签', link: '/bookmarks' },
          ]
        },
      ],
      socialLinks: [
        { icon: 'gitee', link: 'https://gitee.com/shub77/vitepress-tip' }
      ],
      footer: {
        message: '© 2026 知行笔记 Sntip.cn',
        copyright: `
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">滇ICP备2025076967号</a>
          &nbsp;|&nbsp;
          <a href="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=53000002000001" target="_blank" rel="noopener">滇公网安备53000002000001号</a>
        `
      }
    }
  })
)
