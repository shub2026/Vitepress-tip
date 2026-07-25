# 变更日志

所有重要的项目更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本控制遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

> **⚠️ 版本基线重置说明（2026-07-13）**：本项目于本日正式将版本基线重置为 **v1.0.0**（首个稳定发布版）。
> 此前 2026-06-13 ~ 2026-07-06 期间的 `v1.0.0`–`v2.21.0` 为开发期内部迭代，其对应的 Git tag 已清理；下方「历史开发记录」予以保留作为归档。

## [1.3.0] - 2026-07-23

### 新增

- **排课锁定**：教学安排页新增自动排课锁定功能。批量排课后，可对自动安排的任课教师"加锁"，锁定后效果等同于手动安排——重置当前科目/全部科目时锁定记录不受影响，再次自动排课时锁定班级不会被覆盖。支持单条锁定/解锁（自动同步合班成员）和一键锁定/解锁当前科目全部自动安排
- **锁定 API**：新增 `PATCH /api/teaching-arrange/assignments/:id/lock`（单条切换锁定）和 `POST /api/teaching-arrange/lock-batch`（批量锁定/解锁），均含审计日志记录
- **锁定统计**：课程预览卡片新增"已锁定"统计项，实时显示当前科目锁定数量

### 测试

- 新增 `teaching-arrange-lock.test.js`（11 个测试用例），覆盖单条锁定/解锁、合班同步、批量锁定/解锁、异常场景
- 更新 `teaching-arrange.test.js` 和 `teaching-arrange-list.test.js` 适配 `is_locked` 字段

### 文档清理

- 清理 21 个过期文档：`docs/` 移除 10 个过时审查报告，`.qoder/specs/` 移除 5 个已完成任务规格，`.workbuddy/memory/` 移除 6 个旧日志

## [1.2.0] - 2026-07-21

### 新增

- **用户密码重置**：用户管理页新增「重置密码」操作，支持手动输入或一键随机生成 12 位强密码；重置后 `must_change_password` 置位，用户下次登录强制改密。后端 `PUT /api/users/:id/password`，含自我重置与超级管理员目标拦截、审计日志记录
- **密码重置校验**：新增 `validateResetPassword` 中间件（8–128 位、至少 2 类字符）

### 变更

- **三级权限收紧**：系统管理模块（用户管理、系统设置、操作日志）整体收敛为仅超级管理员可见可操作。前端 `/users` 路由 `requiresAdmin` → `requiresSuperAdmin`，Layout 系统管理子菜单整体包裹 `super_admin` 判定；后端 `/api/users` 挂载层与各端点 `roleMiddleware` 同步收紧为 `super_admin`，普通管理员可访问除系统管理外的全部功能页面
- **分页样式统一**：班级管理、课程管理、培养方案、开课查询、教材查询、操作日志、用户管理、教学安排 8 个页面分页统一为教材管理页风格（`background` + `[20, 50, 100]` + `total, sizes, prev, pager, next`，`pagination-container` 包裹）

### 文档

- `README.md` 合并历史重复内容为单一文档，同步版本号、权限矩阵、API 说明与实际项目状态

## [1.1.4] - 2026-07-20

### 性能

- **筛选器缓存**：班级筛选器与开课查询关联映射加缓存，减少重复计算
- **工作量警告去重**：修复手动排课工作量警告在合班场景下的重复计数

## [1.1.3] - 2026-07-18

### 修复

- **移动端响应式**：修复课程课时概览数字重叠、教师选择弹窗表格溢出
- **卡片阴影统一**：Dashboard 与系统设置页卡片阴影统一为 `--shadow-sm`

## [1.1.2] - 2026-07-16

### 变更

- **删除通知统一**：删除操作通知统一为 `ElNotification`
- **CSS 规范审计**：生产审计修复 + 登录页细节优化（前置图标/投影/圆角/装饰/响应式）、方案查询页总计行视觉收尾

## [1.0.0] - 2026-07-13

### 正式发布

- 基础功能全部完成，定为首个稳定发布版（v1.0.0）。
- 核心模块：培养计划、班级管理（含合班教学组）、教师与课程管理、教材协调、手动 + 自动排课（含合班一致性约束）、课时统计与 Excel 导出、系统设置、角色权限、操作日志、仪表盘。
- 排课引擎：五阶段贪心 + 禁忌搜索优化；合班按逻辑单元计课时并强制共享教师。
- 前端 Vue 3 + Element Plus + Vite；后端 Express + Prisma + SQLite（WAL）。
- 全量测试 1343 项通过，前后端联调通过。

---

## [1.4.0] - 2026-07-13

### 新增

- **合班教学组**：新增 `class_combinations` 数据模型，支持同学院多班级合班教学，提供 `applyCombination`、`dissolveAfterClassDeletion`、`buildCombinationMemberMap` 等完整 CRUD 服务
- **排课并发锁**：新增 `arrange_locks` 表，支持数据库级咨询锁防止多进程/多实例并发排课数据竞争

### 数据完整性

- **唯一约束**：`courses.name` 和 `textbooks.title` 添加 `@unique` 约束，防止重复创建
- **外键加固**：`plan_courses.courses` 和 `plan_textbooks.textbooks` 外键改为 `onDelete: Restrict`，防止级联删除

### 导出优化

- **开课导出列拆分**："教材征订"列拆为"教材名称"、"书号"、"征订情况"三列，便于 Excel 筛选征订状态

### 响应式设计

- **课程矩阵表格**：≤1024px 断点收缩学期列（100→80px）、课程名列（160→120px）、操作列（140→110px），减少水平滚动距离
- **方案明细页**：≤768px 断点隐藏概览条分隔符，避免换行后视觉错位
- **底部控制栏**：窄屏下纵向堆叠，取消右对齐

### 修复

- **catch 块作用域 bug**：`export-template.controller.js` 和 `trainingLevel.controller.js` 的 catch 块引用 try 块内 `const` 变量导致 ReferenceError，已改为 `req.params.type` / `req.body.name`

### 测试

- 新增 425 个测试用例（926 → 1351），13 个新测试文件
- 语句覆盖率 52.82% → 70.84%，分支 46.3% → 62%，函数 47.36% → 66.66%，行 54.25% → 72.29%
- 新增覆盖：textbook.controller（70）、import/textbooks（24）、class-combination（53）、arrange/lock（15）、arrange/queries（+27）、auto-arrange（+34）、data-export（28）、export-template（10）、excel（31）、sse（18）、college/major/trainingLevel 控制器（69）、class.controller.extra（35）、class.service（11）

### 文档

- 删除过时文件：`.qoder/specs/` 旧审计报告、`.workbuddy/memory/` 工具日志
- 更新文档版本号和状态信息

---

## [1.3.3] - 2026-07-11

### 业务逻辑校正

- **仪表盘学期校验**：`getDashboardStats`/`getDashboardInsights` 补 `semesterInfo` null 校验，避免畸形学期导致已毕业班级被计入 `totalStudents` 统计虚高
- **方案匹配确定性**：`class`/`data-export`/`dashboard` 三处 `findBestMatchPlan` 调用补传 `classPlanMap`，多方案匹配时按创建时间降序取最新，与排课算法口径一致
- **导出年级/状态公式统一**：`exportClasses` 内联年级/状态公式替换收敛为统一 `calcClassSemester`，消除三套并存实现；状态文本新增"未知"兜底
- **学期计算收敛**：移除 deprecated `parseSemesterString`，统一使用 `parseSemester`，import 源收敛到 `semester.service.js`

### 样式

- **登录页简化**：card-accent 流光装饰条移除 `::after` 模糊光晕动画，保留基础渐变，减少视觉噪音

### 文档

- 新增 `FRONTEND_ARCHITECTURE_REVIEW_3.md`（第三轮前端架构审查报告）

---

## [1.3.2] - 2026-07-11

### 修复

- **教材查询下拉定位修复**：修复教材查询页下拉选择器定位异常问题
- **分页组件废弃警告**：移除已废弃分页组件引用，消除控制台警告

---

## [1.3.1] - 2026-07-11

### 新增

- **课程矩阵教材悬停体验**：课程矩阵表格教材列增加悬停提示，展示教材详细信息
- **登录页流光动画**：登录卡片顶部新增品牌色流光渐变装饰条，含模糊光晕动画

---

## [1.3.0] - 2026-07-11

### 安全加固 (S-01~S-05)

- **S-01 refreshToken HttpOnly Cookie 托管**：refreshToken 完全交由 HttpOnly Cookie 管理，从 JS 内存中移除，防止 XSS 窃取
- **S-02 导入错误信息转义**：`useImport` 错误信息改用完整 HTML 转义 (`escapeHtml`)，防止注入
- **S-04 部署脚本密码安全**：deploy 脚本不再硬编码默认密码
- **S-05 JSON body 限制收紧**：JSON body 解析限制从 10mb 降至 1mb

### 业务逻辑校正 (B-01~B-05)

- **B-01 排课并发安全**：新增 `arrange_locks` 数据库级咨询锁，防止并发排课数据竞争
- **B-02 教材内聚惩罚系数调整**：从 10000 调至 300（≈5.3x 理论最大正分），避免过度惩罚挤占优先级
- **B-03 批量预览快照回滚**：批量排课预览模式增加快照回滚，防止状态污染
- **B-04 学期边界可配置化**：学期起始月份改为系统设置可配置 (`semester_start_month`)
- **B-05 周课时计算修正**：auto-arrange 周课时计算改为 `totalWeeklyHours - autoHours + extra`

### 性能优化 (P-01~P-05)

- **P-01 Element Plus 分包**：拆分为 `element-core` + `element-table` 两个 chunk，首屏加载优化
- **P-02 用户管理分页**：用户列表改为分页查询，避免全量加载
- **P-03 批量更新接口**：新增班级/教材批量更新 API，减少请求次数
- **P-05 学期获取优化**：TeachingStatistics 改用 settingsStore 获取学期，避免重复 API 调用

### 新增功能

- **访客首页访问**：未登录用户可访问首页概览，默认进入 Dashboard，卡片禁用跳转
- **教材连续使用检测**：新增教材连续使用检测功能，查询/导出增加学院字段
- **自动排课重置**：支持当前科目和全部科目两种重置模式
- **开课查询导出升级**："使用教材"列升级为"教材征订"列

### 测试

- 926 tests 全部通过

---

## [1.2.1] - 2026-07-10

### 修复

- **部署 prisma generate**：始终显式运行 `prisma generate`，不再依赖 `migrate deploy` 自动生成
- **Vite 代理目标修复**：修复 `git pull` 后 `vite proxy target` 被重置为 3000 的问题
- **package-lock.json 同步**：重新生成 server/package-lock.json，修复 `npm ci` 部署失败
- **Prisma 迁移修复**：补充 migration 文件同步 db push 遗漏的 schema 变更，`college_id` 使用 `IF NOT EXISTS` 防止重复创建
- **导入 CSRF token**：el-upload 补充 CSRF token，修复班级导入 403 错误

### 新增

- **开课查询摘要栏主题**：改用 success 绿色主题，与教材查询保持一致

---

## [1.2.0] - 2026-07-09

### 视觉风格升级

- **主色迁移**：品牌主色迁移至 `#1C82F5`，优化首页概览色彩层次
- **全站视觉统一**：主色下沉、语义文字色、图表单色阶，全站配色令牌统一
- **首页重构**：洞察区新增课程课时概览卡片、课程排课进度图表（薄荷绿），移除冗余组件
- **薄荷绿点缀**：首页引入低饱和薄荷绿打破单调冷色，登录页渐变线优化
- **查询页主题**：开课查询摘要栏改用 success 绿色主题
- **弹窗规范**：统一前端配色与弹窗规范，降低首页饱和度

### 功能增强

- **课时统计内嵌表格**：增加"当前教材"列
- **班级批量删除优化**：合并为单次请求，避免 100 次 DELETE 触发 429 限流

### 修复

- **开课查询班级显示**：修复"共X个班级"显示当前页数量而非总数的问题，修复只显示部分班级的问题
- **班级关联类型**：改用后端 `matchedPlanType`，修复双字段班级误显示为"按专业"
- **仪表盘数据**：课程数量和总周课时改用培养方案数据，修复排课进度 Infinity
- **开课学期弹窗**：修复输入框过窄导致数字不可见
- **Vue 警告**：声明 `update:selectedSemester` emit 消除警告

---

## [1.1.1] - 2026-07-08

### 改进

- **全局布局一致性**：PageHeader 组件从 teaching 模块 3 个页面推广至全部 15 个页面（6 个基础数据页、3 个查询页、2 个系统页、ClassList、TextbookList、TeachingStatistics、TeachingArrange），所有页面标题从 el-card #header 剥离为独立的页面级标题
- **空状态统一**：所有页面级 `el-empty` 替换为品牌化 `EmptyState` 组件（含场景化 SVG 插画），仅子组件内的小空状态保留 el-empty
- **全局样式优化**：卡片 hover 阴影改为 `.is-hover` 类限定（列表页全宽卡片不再 hover 跳动）、表头背景色从品牌浅蓝改为中性灰 `--bg-subtle`、操作列默认透明度从 0.45 提升到 0.65、新增 `--brand-primary-shadow` CSS 变量令牌、新增 1200px 响应式断点
- **登录页视觉优化**：按钮投影色改用 CSS 变量、accent 装饰条渐变色改用品牌色、focus ring 加粗至 2px（WCAG 无障碍）、新增 0.5s 入场动画、背景添加极淡径向渐变光晕、表单添加 aria-label
- **内嵌表格交互优化**：课时统计页和开课查询页的展开行内嵌表格禁用行 hover 高亮，避免与外层表格同时高亮造成视觉干扰

### 代码健壮性

- **keep-alive 缓存页**：ClassList、TeacherList、PlanList 的 `watch(route.path)` 替换为 `onActivated()` 生命周期钩子，语义更精确、性能更好
- **组件显式命名**：15 个页面组件全部添加 `defineOptions({ name: '...' })`，与 Layout 的 `cachedViews` 列表强绑定，防止文件重命名后缓存静默失效
- **useDebouncedRef 内存泄漏修复**：`useDebouncedRef` 和 `useDebounceFn` 均增加 `onUnmounted` 自动清理定时器
- **ChangePasswordDialog**：两个 `watch` 双向同步改为单个 writable `computed`，消除潜在循环触发
- **导入取消功能**：`useImport.js` 新增全屏进度遮罩层，含"取消导入"按钮，调用 `AbortController` 取消机制

### 文档

- 新增 `UI_ARCHITECTURE_REVIEW_2.md`（第二轮 UI/UX 架构审查报告）
- `UI_DESIGN_REVIEW.md` 标注各优先项实施状态
- `README.md` 版本号更新

---

## [2.21.0] - 2026-07-06

### 新增功能

- **禁忌搜索排课优化**：在五阶段贪心+置换回溯基础上，新增可选禁忌搜索优化层（Insert/Shift/Swap 三邻域），通过系统设置页面动态开关控制，默认关闭
- **排课设置 UI**：系统设置页新增"排课禁忌搜索优化"开关组件（`SchedulingConfig.vue`）
- **排课算法文档**：新增 `SCHEDULING_ALGORITHM_ITERATION.md` 迭代分析文档

### 改进

- **排课算法核心审查**：修复禁忌搜索 4 个关键 bug（Swap 学院集合累积污染、Swap 禁忌检查回弹、教材 writeback 全量替换、aspiration criterion 缺失），补充 NaN 防护和 dead import 清理
- **全局弹窗宽度优化**：统一调整 10 个确认弹窗的 `min-width` 为 450px，确保多行提示文本合理显示

### 测试

- 新增 `tabu-search.test.js`，11 个测试用例覆盖 Insert/Shift/Swap 邻域、约束检查、教材引用计数等核心场景

---

## [2.20.2] - 2026-07-06

### 文档

- 同步 vitepress-tip 文档与 kec-manager 项目（变更日志补齐 2.19.0~2.20.1、部署文档补充 ecosystem 配置与端口说明、概述补充 CSRF/HttpOnly 与测试体系）
- 统一 README、DEPLOYMENT、SCHEDULING_ALGORITHM 等文档版本号标注为 v2.20.2
- 修正部署/概述文档端口说明（开发 3002、生产 3000）与 CHANGELOG 2.20.0 代理端口的错误记述

---

## [2.20.1] - 2026-07-05

### 缺陷修复

- **CSRF Token 初始化**：新增 `GET /api/auth/csrf-token` 端点，客户端登录前获取 XSRF-TOKEN Cookie，解决首次 POST 被 CSRF 拦截的问题

## [2.20.0] - 2026-07-05

### 安全加固

- **CSRF 防护修复**：修复 Cookie 名称不匹配导致 CSRF 验证被绕过的问题，统一为 `XSRF-TOKEN`；后端登录时通过 `Set-Cookie` 设置 CSRF Cookie，移除 bypass 分支
- **HttpOnly Cookie**：JWT 令牌改为后端 `Set-Cookie` 设置 HttpOnly + Secure + SameSite=Strict Cookie，防止 XSS 窃取；兼容原有 Authorization Header 模式
- **令牌刷新增强**：Refresh 端点支持从 HttpOnly Cookie 读取 refresh token，刷新后自动更新 Cookie
- **登出增强**：登出时清除所有认证 Cookie（token、refreshToken、XSRF-TOKEN）
- **密码修改增强**：修改密码后清除所有认证 Cookie，强制重新登录
- **日志规范化**：`auth.service.js` 中 `console.error` 替换为 Winston `log.error`

### 部署优化

- **临时文件清理**：`deploy.sh` 复制 `.env` 后删除 `/tmp/kec-env`
- **PM2 生态配置**：新增 `ecosystem.config.cjs`，含日志轮转、自动重启、内存限制等生产配置
- **Vite 代理配置**：开发代理目标为 `http://localhost:3002`（与开发环境 `server/.env` 的 `PORT` 保持一致）；生产环境由 `deploy.sh` 生成 `PORT=3000`，Nginx 反向代理转发至 3000

### 首次登录安全

- **强制改密**：新增 `must_change_password` 字段，种子用户首次登录强制修改默认密码

### 文档更新

- **版本号对齐**：README 版本号更新为 v2.19.3，与 package.json 一致

## [2.19.1] - 2026-07-05

### 代码质量与体验优化

- **全局代码格式化**：前后端 Prettier 批量格式化，统一代码风格
- **选择教师弹窗优化**：新增学院/层次列，各栏宽度精细调整，操作后自动关闭弹窗
- **课时统计展开行**：新增学院和层次列，内嵌表格紧凑化
- **开课查询展开行**：内嵌表格紧凑化，与课时统计风格统一
- **教学安排交互**：教师单元格点击区域修复（flex 布局兼容），更换教师操作优化
- **全局表格样式**：单元格垂直居中、紧凑行高，展开行全宽显示
- **ESLint 配置**：补充浏览器全局变量声明（getComputedStyle、AbortController 等）
- **导入取消支持**：useImport 组合式函数新增 AbortController 取消功能
- **修改密码体验**：成功后延迟退出，显示提示信息

---

## [2.19.0] - 2026-07-04

### 全面安全审计（10 项）

- **S-01 JWT 密钥熵值校验**：生产环境要求 ≥128 bits，不足时拒绝启动
- **S-03 令牌黑名单内存缓存**：DB 故障时降级到内存缓存，防止撤销失效
- **S-04 CSRF 双重提交**：新增 `csrf.js` 中间件，Double Submit Cookie 模式
- **S-05 密码策略扩展**：特殊字符范围从 7 种扩展到所有非字母数字字符
- **S-06 错误信息分级**：生产环境仅本地请求返回详细错误栈
- **S-07 敏感日志脱敏**：请求日志中 `download_token` 自动掩码
- **S-09 用户删除缓存失效**：删除用户后主动清除状态缓存
- **S-10 审计日志清除增强**：清除操作记录归档数量、操作员和原因

### 业务逻辑修正（5 项）

- **B-01 班级统计修正**：仅统计有排课记录的班级数
- **B-02 年级计算修正**：入学月份边界从 9 月统一为 8 月
- **B-03 排课资格校验**：班级无层次时严格按教师层次意向过滤
- **B-04 排课评分安全**：教材评分新增 `maxTb > 0` 守卫
- **B-13 仪表盘统计**：排除 0 课时排课记录
- **B-14 教材去重修正**：开课查询教材关联改用班级+课程复合键

### 前端体验优化（16 项）

- **F-01 路由过渡动画**：keep-alive 包裹 transition，页面切换平滑
- **F-02 确认操作栏**：新增共享确认组件 ConfirmActionBar
- **F-08 侧边栏阴影**：增加视觉层次感
- **F-11 页面标题分隔符**：从 `-` 改为 `·`
- **F-12 表格样式统一**：全局单元格垂直居中、紧凑行高
- **F-13 导入取消**：支持中断进行中的导入操作
- **F-14 修改密码**：成功后延迟退出并提示
- **F-16 404 页面**：重新设计，增加视觉吸引力和操作引导

### 测试

- 更新 `auth.service.test.js`：适配内存缓存后 DB 调用次数变化
- 更新排课算法测试：覆盖 B-03/B-04 边界条件

---

## [2.17.2] - 2026-07-02

### 配置与文档整理

- **删除根目录冗余 `.env.example`**：该文件仅含 5 个变量，是 `server/.env.example` 的不完整子集，所有文档引用均指向 server 目录，根目录版本已无存在必要
- **补全环境变量示例文件**：对照代码中实际使用的 13 个环境变量，补全两个示例文件中缺失的变量
  - `server/.env.example` 新增 `JWT_DOWNLOAD_EXPIRES_IN=30s`
  - `server/.env.production.example` 新增 `JWT_DOWNLOAD_EXPIRES_IN=30s`、`BCRYPT_ROUNDS=12`、`DEFAULT_SEMESTER=2025-2026-2`
  - `server/.env` 同步补全 `JWT_DOWNLOAD_EXPIRES_IN=30s`
- **`VERSION_MANAGEMENT.md` 移入 `docs/`**：版本管理规范文档性质与 docs/ 中其他运维指南一致，根目录仅保留 README.md 和 CHANGELOG.md

---

## [2.15.0] - 2026-06-28

### 架构审计修复（13 项）

#### 高危修复 (HIGH)

- **H1**: 手动排课周课时推导统一使用 `findBestMatchPlan`，修复方案匹配不一致问题
- **H2**: `parseSemester` 新增年份连续性校验（`endYear === startYear + 1`），与 `parseSemesterString` 行为统一
- **H3**: 教师导入更新时新增 `hasCourseCol` 守卫，修复无学科列时课程关联被清空的数据丢失 bug
- **H4**: 开课/教材查询分页 total 字段修复，新增 `totalWithCourses` 返回有课班级数

#### 关键修复 (CRITICAL)

- **C1**: 班级列表方案匹配统一为 `findBestMatchPlan`，修复与自动排课的优先级不一致
- **C2**: 数据导出方案匹配统一为 `findBestMatchPlan`

#### 中等修复 (MEDIUM)

- **M1**: 学年起始月份边界从 `>=9` 统一为 `>=8`（8 月入学应属当年）
- **M2**: `updatePlanCourse` 学期范围不变时同步 `weekly_hours`/`weeks_count` 到 `plan_course_semesters`
- **M3**: 学期信息新增 30 秒 TTL 缓存，更新设置时自动失效
- **M4**: 审计日志 pageSize 防御性上限（最大 100）
- **M5**: 手动排课后新增教师工作量警告（超过 20 课时/周时提醒）

#### 低危修复 (LOW)

- **L1**: 并发锁代码已具备注释，确认无需额外修改
- **L2**: 班级导入新增同名班级检测，防止重复创建

### 测试

- 修复 `queries.test.js` 中与 H2 修复矛盾的断言
- 新增 `plan.service.test.js`：13 用例覆盖 `isClassMatchPlan` 和 `findBestMatchPlan`

### 文档

- 删除 7 个过时审计/检测报告
- `LOGIN_GUIDE.md`: 端口号更正为 5173/3002
- `semester-calculation.md`: 新增学期格式校验规则章节
- `TEACHING_ARRANGE_LOGIC.md`: 补充 `findBestMatchPlan`/`isClassMatchPlan` 函数说明及 C1 修复说明

---

## [2.14.0] - 2026-06-28

### 测试工具链改进（P0 + P1）

#### P0 — 环境与安全

- **CI Node 版本对齐**：Gitee Go 流水线镜像从 `node:18` 升级至 `node:20`，与 `engines.node >= 20` 约束一致
- **CI 质量门禁**：流水线新增 ESLint 代码检查、覆盖率测试、依赖安全审计（`npm audit --audit-level=high`）步骤
- **覆盖率门槛**：Vitest 新增 `coverage.thresholds` 配置（语句 17%、分支 14%、函数 16%、行 17%），低于基线即阻断合并
- **multer 高危漏洞修复**：升级 multer 至 2.2.0，消除深层嵌套字段名 DoS 漏洞

#### P1 — 高风险纯函数补测

- **naming.middleware 测试**（13 用例）：覆盖请求体驼峰转下划线、响应下划线转驼峰、SKIP_KEYS 跳过、数组/嵌套分页对象转换、空 body 处理
- **validation 测试**（37 用例）：覆盖 handleValidationErrors、validateLogin/Class/ChangePassword/IdParam/Pagination/SemesterQuery/TeacherCreate/AutoArrange/Reset，验证通过/失败双路径
- **selectBestTeacher + trySwapOne 测试**（19 用例）：覆盖七层优先级排序逻辑、S-02 回归（学院/层次资格校验）、教材上限检查、容量约束、成功置换、无可置换场景；重构 auto-arrange.js 将 selectBestTeacher 提取为模块级函数
- **认证路由集成测试**（24 用例）：引入 supertest，覆盖登录/刷新/查询用户/修改密码/登出完整 HTTP 链路，含验证错误、认证失败、角色保护

### 测试数据

- 测试文件：8 → 12（+4）
- 测试用例：148 → 241（+93）
- 语句覆盖率：8.43% → 17.39%（+106%）
- validation.js 覆盖率：0% → 100%
- app.js 覆盖率：0% → 84.78%
- auth.routes.js 覆盖率：0% → 79.62%
- auto-arrange.js 覆盖率：18.6% → 30.79%

---

## [2.13.2] - 2026-06-26

### 功能增强

- **教师导入自动创建关联基础数据**：导入教师时，Excel 中的归属学院、任课学院、任课层次如果不存在，将自动创建（与班级导入行为一致），不再静默丢弃。自动创建的记录会标记描述"由教师导入自动创建"
- **首页数据概览基于当前学期**：新增 `GET /api/dashboard/stats` 统一接口，8 项统计数据（专业、课程、班级、教材、方案、学生、教师、周课时）均按当前学期维度计算，其中课程数量为实际排课课程数。前端从 6 次独立 API 调用合并为单次请求

### 代码质量

- Prettier 全量格式化（前后端）

---

## [2.12.4] - 2026-06-25

### 架构审计修复（15项安全漏洞 + 业务逻辑修复）

#### 高危（HIGH）

- **S-01** 删除学院/层次前增加教师排课偏好、培养方案、教师所属关联检查，防止 `onDelete: Cascade` 静默清除数据
- **S-02** 排课置换算法 `trySwapOne` 对教师 T 和 T2 均增加学院/层次资格校验，防止绕过业务规则
- **S-03** `getClassesWithCourse` 年级筛选改为范围匹配，修复多学制场景下漏排问题
- **S-04** `parseSemesterString` 增加学期索引范围（1-2）、年份连续性、年份区间校验

#### 中危（MEDIUM）

- **S-05** `listPlans` 班级计数改用 `findBestMatchPlan` 优先级语义（自定义>专业>层次），消除重复计数
- **S-06** `deleteMajor` 增加培养方案前置检查，防止 `onDelete: SetNull` 静默破坏方案匹配
- **S-07** 教师导入时空列不再清除现有排课学院/层次偏好
- **S-08** 课程导入已有课程仅在 Excel 显式指定类型时才更新，防止默认值覆盖

#### 低危（LOW）

- **S-11** `resetBasic`/`resetColleges`/`resetLevels` 显式删除教师排课偏好表，替代依赖级联隐式清除
- **S-12** 下载令牌路径补充用户激活状态校验，与 Bearer Token 路径一致
- **S-13** 批量排课预览增加 `globalTextbookMap` 跨课程累计教材负载，提升教材内聚分析准确性
- **S-14** 班级导入 catch 块重置计数器，防止事务回滚后报告不准确
- **S-09/S-10** 并发锁和排序竞态添加文档注释，标注单进程限制

## [2.12.3] - 2026-06-24

### 安全修复（全盘代码审查后批量修复）

- **C-1 密码字段 XSS 清洗致永久锁死（CRITICAL）**：`xss.js` 新增 `SKIP_SANITIZE_KEYS` 白名单（password/old_password/new_password 等），密码字段跳过 XSS 清洗。此前修改密码时含 `<>` 字符的密码会被篡改，导致 bcrypt 比对永久失败，用户无法登录
- **H-1 备份文件残留**：删除 `teaching-arrange.service.js.bak-20260620-185807`，`.gitignore` 新增 `*.bak` / `*.bak-*` 规则
- **H-2 密码策略不一致**：`validation.js` 的 `validateChangePassword` 正则改为与 `validateUser` 一致的严格字符集 `[A-Za-z\d@$!%*?&]{8,128}`
- **H-4 sanitizeBody 未全局应用**：`app.js` 在 `express.json` 之后全局挂载 `sanitizeBody`，密码字段在中间件内自动跳过，消除各路由手动添加的遗漏风险
- **H-5 querySemester 分页无上限**：`query.controller.js` 的 `pageSizeNum` 强制 `Math.min(Math.max(n, 1), 100)`，防止 `?pageSize=999999` 致 OOM

### 数据一致性修复

- **M-2 updateClass 级联删除非事务**：班级更新与排课记录删除包入 `prisma.$transaction`，保证原子性，避免删排课失败时数据不一致
- **M-7 重置接口无速率限制**：`settings.routes.js` 新增 `resetLimiter`（每用户每小时最多 3 次），应用到所有 `/reset/*` 路由，防止账号被盗后瞬间清空全部数据
- **M-8 validatePagination 参数被忽略**：`pagination.js` 的 `validatePagination(maxPageSize=100)` 接受参数，动态设置 `isInt` 的 max 上限

### 前端代码质量修复

- **P1 main.js errorHandler**：`console.error` 加 `import.meta.env.DEV` 守卫，生产环境零控制台输出泄露
- **P2 useCrudList handleSave 缺 catch**：API 异常时展示 `ElMessage.error` 用户提示
- **P2 settings.js / useSortable.js / useExport.js**：`console.error` 统一为单行 DEV 守卫格式
- **P3 download.js downloadBlob**：`a.click()` 包入 `try-finally`，异常时也能清理 DOM 节点和 ObjectURL

---

## [2.12.2] - 2026-06-24

### Bug 修复

- **命名转换中间件数组处理修复**：`naming.js` 的 `snakeToCamel` / `camelToSnake` 将 `Array.isArray` 检查移至构造函数守卫之前，修复嵌套对象数组（如 courses、textbooks）内字段未被转换的问题。此前 `weekly_hours`、`course_id` 等字段在数组内保持 snake_case，导致前端 `weeklyHours` 为 undefined，周课时合计显示 NaN
- **教材定价乱码修复**：`naming.js` 两个转换函数添加 `constructor !== Object` 守卫，跳过 Prisma Decimal 等类实例，避免递归展开内部属性 `{s,e,d}` 导致乱码

### 导出接口对齐

- **教师导出**：标签对齐前端（"任课学院"→"意向学院"，"任课层次"→"意向层次"，"教师姓名"→"姓名"），列顺序与 TeacherList.vue 一致
- **课时统计导出**：标签对齐前端（"教师姓名"→"姓名"，"上课班级数"→"班级数"），列顺序与 TeachingStatistics.vue 一致
- **教学安排导出**：新增缺失字段（入学年份、在读学期、人数、培养层次），列顺序与 TeachingArrange.vue 一致
- **开课查询导出**：新增缺失字段（在读学期、开课数、周课时合计），列顺序与 UnifiedSemesterQuery.vue 一致

### 二次检查报告修复（v2.12.1）

- **C-2 并发锁**：`auto-arrange.js` 单课程排课添加内存锁 `arrangeLocks`
- **H-2 密码复杂度**：`validateUser` 添加密码复杂度校验
- **H-3 日志降级**：排课诊断日志从 `info` 降为 `debug`
- **H-4 无效 include**：移除 `assignTeacher` 中 `semester: null` 的死代码 include
- **M-2 JWT 过期时间**：`auth.config.js` 改为从环境变量读取
- **M-5 事务优化**：`alreadyWritten` 计算从 O(A²) 优化为 O(A)
- **其余 M/L 级问题全部修复**，详见 `docs/kec-manager-v2.12-二次检查报告.md`

---

## [2.9.1] - 2026-06-23

### Bug 修复

- **排序回归修复**：移除 CollegeList、MajorList、CourseList、TextbookList、TrainingLevelList 五个页面的 el-table `:default-sort` 属性，避免客户端按名称排序覆盖服务端 `sort_order` 排序
- **教材启用/停用 500 错误**：`toggleTextbookStatus` 改用 `req.body?.is_active` 可选链，修复 POST 无 body 时 `req.body` 为 undefined 导致的 TypeError 崩溃
- **教材已用教材重复显示**：后端 `queries.js` 对 `assignedIds` 加 `new Set()` 去重；前端 `TeachingArrange.vue` 新增 `uniqueTextbooks()` 函数按 ID 去重显示

### 文档

- 全面代码审计报告归档至 `docs/kec-manager-审计报告.md`，共 50 项（C3+H12+M20+L15），新增 M-19（学期查询年级筛选分页 total 不准）、M-20（排课统计导出忽略筛选条件）

---

## [2.9.0] - 2026-06-23

### 前端健壮性修复

- **H-1 ElMessageBox 确认框异常捕获**：`UserManagement.vue` 的 `toggleUserStatus` 和 `deleteUser` 将 `ElMessageBox.confirm` 移入 try-catch，取消操作不再抛出未捕获异常
- **H-2 表单验证 Promise 模式修复**：`Login.vue` 和 `UserManagement.vue` 的 `formRef.value.validate(callback)` 改为纯 Promise 模式 `await formRef.value.validate()`，修复 callback 模式下 `await` 为空操作的隐患
- **H-11 settings store 防御性加载**：`load()` 添加 try-catch 和学期字符串防御性解析，API 返回格式异常时不再崩溃

### 后端逻辑修复

- **H-4 教材状态切换修复**：`toggleTextbookStatus` 改为接受 `req.body.is_active` 目标状态，而非盲目 toggle
- **H-5 课程删除关联检查补全**：`deleteCourse` 新增 `teaching_assignments` 和 `teacher_courses` 计数检查，防止删除有排课或教师关联的课程

### 性能优化

- **H-6 教师排课查询过滤**：`getTeachersForCourse` 中 `teacherAssignmentsWithCollege` 和 `teacherAssignmentsWithLevel` 添加 `teacher_id` 过滤，避免拉取整个学期的排课数据
- **H-7 课时统计消除 N+1 查询**：`getStatistics` 预加载所有 `training_levels` 构建全局 Map，替代 Promise.all 内逐教师查询
- **H-8 教师导入消除 N+1 查询**：预加载所有导入行涉及的教师姓名构建索引 Map，替代循环内逐行 DB 查询
- **H-9 教材使用概览 O(n²)→O(n)**：`queryAllTextbooksUsage` 构建 `classId→class` Map 替代循环内 `Array.find()`
- **H-10 班级列表查询合并**：`listClasses` 7 次独立班级查询合并为单次查询 + 单次遍历推导所有关联映射

### 数据库安全

- **H-3 排课记录外键约束加固**：`teaching_assignments` 三个外键从 `onDelete: Cascade` 改为 `onDelete: Restrict`，防止删除教师/班级/课程时静默级联丢失排课数据。三个控制器（`deleteTeacher`/`deleteClass`/`deleteCourse`）均已添加前置排课检查

### 安全评估

- **H-12 JWT Token 安全评估**：当前架构（15分钟 access token + 7天 rotating refresh + 角色实时刷新 + 速率限制）对小型内部工具安全级别合理。后续建议将 token 存储从 JS 可访问 cookie 迁移到 httpOnly cookie

## [2.8.2] - 2026-06-23

### Bug修复

- **系统重置错误处理**：`resetSystem` 和 `resetAuditLogs` 添加 try-catch 包裹，防止 Prisma 事务异常导致进程崩溃（C-1）
- **排课算法教材计算修复**：`trySwapOne` 置换逻辑中教材数量计算改为基于移除后集合，修复 MAX_TEXTBOOKS 约束被绕过的问题（C-2）
- **Dashboard ElMessage 导入修复**：添加缺失的 `ElMessage` 导入，修复点击"数据导入"按钮时的 ReferenceError（C-3）

## [2.7.1] - 2026-06-23

### 功能优化

- **教学排课预览模式增强**：预览结果弹窗增加“执行排课”按钮，减少重复操作
  - 点击执行后自动关闭预览弹窗并应用排课结果
  - 优化确认提示文案，明确区分预览和执行的区别
- **课时统计筛选器增强**：新增姓名筛选输入框
  - 支持模糊匹配教师姓名
  - 位于筛选器最前面，方便快速查找
  - 可与其他筛选条件组合使用

### Bug修复

- **培养方案匹配逻辑修正**：修复按层次关联方案的班级匹配问题
  - 专业和层次匹配改为平级OR关系，无先后顺序
  - 移除错误的 `!cls.major_id` 限制条件
- **班级管理页显示优化**：未关联方案的班级统一显示“未关联”标签
  - 标签颜色规范：自定义方案(橙色)、已关联(绿色)、未关联(灰色)
- **培养方案管理页颜色调整**：按层次关联类型从灰色调整为蓝色
  - 提升视觉区分度，便于识别不同关联方式

## [2.7.0] - 2026-06-21

### 代码质量提升

- **新增代码格式化支持**：集成 Prettier 和 ESLint，统一代码风格
  - 前端：配置 Vue 3 + Element Plus 格式化规则
  - 后端：配置 Node.js + Express 格式化规则
  - 添加 `npm run format` 和 `npm run lint` 脚本
  - 创建 CODE_FORMATTING.md 详细使用指南
- **代码格式化执行**：对全部前端（57个文件）和后端（68个文件）进行格式化
- **ESLint 配置升级**：迁移到 ESLint v9+ flat config 格式（eslint.config.js）

### 项目清理

- **删除冗余文档**：清理 docs/archive/ 目录中的 8 个历史报告文件
- **删除过时文档**：移除 4 个重复或过时的技术文档
- **删除临时脚本**：清理 server/scripts/ 中的 15 个一次性诊断脚本
- **删除根目录脚本**：移除 scripts/ 目录中的 3 个临时脚本
- **删除重复文件**：移除 deploy-gitee.sh（与 deploy.sh 重复）
- **删除空文件**：移除 nul 空文件
- **总计清理**：删除 31 个冗余文件，释放数百KB空间

### 文档更新

- **README 更新**：添加代码格式化章节，更新项目结构图
- **新增 CODE_FORMATTING.md**：详细的代码格式化使用指南
- **相关文档链接**：在 README 中添加代码格式化指南链接

### 依赖更新

- **前端新增依赖**：prettier ^3.8.4, eslint ^10.5.0, eslint-plugin-vue ^10.9.2, @vue/eslint-config-prettier ^10.2.0, @eslint/js ^10.0.1
- **后端新增依赖**：prettier ^3.8.4, eslint ^10.5.0, @eslint/js ^10.0.1

## [2.6.1] - 2026-06-20

### 排课算法优化

- **P1-A 教材亲和副作用隔离**：`isTextbookMatch` 改为始终使用教师固有教材快照（`inherentTextbookIds`），`buildTeacherConstraints` 固化固有教材副本。教师被分配新教材班级后不再因 `textbookIds` 累加而在后续轮次被误判为该教材匹配，避免非预期的亲和聚集挤占专任教师
- **P1-B 批量排课优先级改供需比**：从"仅按可用教师数"改为"班级总课时需求 / 可用教师剩余容量"的供需比。资源更紧张（供需比大）的课程优先处理，避免瓶颈课程因靠后排队而容量耗尽。新增 `plan_course_semesters` 聚合查询估算课时需求
- **P2 阶段4 后置换回溯**：兜底分配后对未分配班级尝试置换——若某教师 T 已满但其某班级 V 能被其他教师 T'' 接管，且 T 腾出容量后能容纳未分配班级 U，则执行置换。单轮置换（不递归），复杂度 O(U×T×A)，资源紧张时提升 5-15% 分配率。单元测试验证：2教师3班级场景下成功置换，容量与分配均正确

## [2.6.0] - 2026-06-19

### 安全修复（严重）

- **C-4** 修复系统重置确认验证可被绕过：`validateReset` 的 `confirm` 字段移除 `.optional()`，省略字段不再放行破坏性重置操作
- **C-5** 修复系统重置操作零审计痕迹：`resetSystem`/`resetAuditLogs` 审计记录改为事务内 `deleteMany` 后重新写入，确保破坏性操作可追溯
- **C-6** 修复前端生产镜像构建失败：Dockerfile 构建阶段去掉 `--only=production`，恢复 devDependencies（vite 等）安装

### 排课算法修复（严重/高危）

- **C-1** 修复培养方案匹配 `null===null` 误匹配：新增统一的三级互斥匹配函数 `isClassMatchPlan`（custom > major > level），补真值守卫，避免跨专业错误排课
- **C-2** 修复排课并发竞态：教师工作量读取与写入移入事务，事务内二次校验教师实际容量，超载分配降级跳过
- **C-3** 修复空分配跳过事务：非预览模式无论是否有新分配都执行 `deleteMany`，保证"全量替换"语义与幂等性
- **H-7** 修复手动排课 `weekly_hours` 静默置 0：update 分支未传时保留原值；增加教师活跃状态与可教课程校验
- **H-11** 修复批量预览不累积跨课程容量：预览模式维护教师工作量累积快照，保证容量计算顺序依赖
- **H-12** 收紧 `parseSemester` 仅支持学期索引 1/2（秋季/春季），暑期学期逻辑半实现风险消除
- **M-1** 提前返回前查询手动安排数，避免 `manualCount` 误报 0
- **M-3** `plan_courses` 查询加 `orderBy`，保证多方案匹配确定性
- **M-10** 周课时为 0 或负数的班级不参与排课，归入 unassigned 并告警

### 安全校验修复（高危）

- **H-5** 7 个 PUT 更新路由补全业务字段校验（teacher/textbook/course/major/college/trainingLevel/plan/class），新增 `validateClassUpdate`
- **H-6** 教学安排 5 个写接口新增 express-validator 校验（semester 格式、weekly_hours 范围、course_id 类型等）
- **H-8** 导出侧统一公式注入防护：`createWorkbook` 写入单元格前对 `= + - @` 开头字符串转义
- **H-9** 审计日志与 winston 日志脱敏：`handleValidationErrors` 剔除 password 字段；教师失败审计改白名单字段
- **L-3/L-4/L-5** 导出/查询 `:id` 参数挂 `validateIdParam`；教材 `publish_date` 格式校验；query 参数安全解析避免 NaN

### 认证权限修复（高危/中危）

- **H-1** 前端 Token Cookie 增加 `Secure` 标志（HTTPS 环境动态判断）
- **H-2** access token 校验用户是否仍存在且激活，并使用数据库最新角色（30s 缓存），防止降级/禁用后旧 token 仍生效
- **H-4** viewer 角色读取教师 PII 脱敏（birth_date）；含 PII 的导出接口（teachers/statistics/teaching-arrange）提升为 admin 权限
- **L-2** downloadToken 有效期缩短至 30s
- **M-2** `GET /api/settings` 匿名访问只返回 organization_name，登录用户（带 token）返回全部；`updateSettings` 校验 current_semester 格式

### 导入导出修复（高危/中危）

- **H-13** 教师导入课程 auto-create、班级导入 level/major/college upsert 移入事务，避免回滚后残留孤儿数据
- **H-14** Excel 解析增加行数上限（20000 行），防止 zip 炸弹 OOM
- **H-2(导入)** 班级导入增加行级数值范围校验（入学年份/学制/人数），与单条 API 一致
- **H-10** 导出接口增加限流（每分钟 10 次），防止并发全量导出 OOM
- **M-8** 教师导入去重检测同名多条时跳过，避免张冠李戴
- **M-9** 教师更新三张关联表 deleteMany+createMany 包入事务
- **M-10** `batchUpdateDefaultHours` 增加 teacher_ids 长度/类型校验
- **L-6** 审计日志 details 限制最大长度 2000 字符，防止表膨胀

### 阻断性 Bug 修复

- 修复 Express 5 下 `sanitizeQuery`/`sanitizeBody` 中间件崩溃：`req.query` 为 getter-only 不能整体赋值，改为原地修改属性（此 bug 导致所有请求 500）

### 前端修复

- **L-1** 登录跳转 `redirect` 参数校验，仅允许站内相对路径，防开放重定向
- **L-7** 登出清除 API 响应缓存；cache.js 增加 LRU 上限（50 条）
- **L-8** Login.vue 改用 `__APP_VERSION__` 替代 package.json import，避免泄露依赖清单
- **L-10** 404 路由显式 `requiresAuth: false`
- **M-12** Nginx 增加 CSP/HSTS/Referrer-Policy/Permissions-Policy 安全头；`X-XSS-Protection` 置 0
- **M-13** 移除硬编码测试账号明文，改为环境变量读取
- 401 刷新队列入队前标记 `_retry`，避免边界场景二次刷新

### 其他

- `.env.example` 补全 `JWT_REFRESH_SECRET`/`JWT_DOWNLOAD_SECRET`/`BCRYPT_ROUNDS`
- `saveHourSettings` 保存前调用 `validateHourSettings` 校验，避免无效设置静默持久化
- `JSON.parse(system_settings.value)` 全部包裹 try/catch，存储损坏时回退默认值
- `getStatistics` 修复 `teacher?.x.map` 链式访问潜在 TypeError
- `vite.config.js` 显式 `sourcemap: false`

## [1.0.0-dev] - 2026-06-13

> 注：此为 2026-07-13 版本基线重置前的开发期发布标记，已被顶部正式的 v1.0.0 取代，仅作历史归档。

### 新增

- 首次正式发布版本（开发期）
- 完整的课程管理平台功能
  - 基础数据管理（培养层次、专业、学院、课程、教材、班级）
  - 培养方案管理
  - 查询报表功能
  - 用户管理和权限控制
  - 操作日志审计
- 前后端分离架构（Vue 3 + Element Plus + Node.js + Prisma）
- 页脚版本号显示功能

### 技术栈

- 前端：Vue 3.5.34, Element Plus 2.14.1, Vite 5.4.21
- 后端：Node.js, Express 5.1.0, Prisma 6.10.1
- 数据库：支持 Prisma 的多种数据库

---

## 版本说明

- **主版本号** (v1.x.x)：不兼容的 API 修改
- **次版本号** (vx.1.x)：新功能（向后兼容）
- **修订号** (vx.x.1)：Bug 修复（向后兼容）

## 发布流程

1. 更新 `package.json` 中的版本号
2. 在此文件中记录变更内容
3. 提交代码并打标签：`git tag v1.0.0`
4. 推送标签：`git push origin v1.0.0`
