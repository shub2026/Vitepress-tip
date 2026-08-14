# 自动排课算法审计调研与综合优化建议

> 审计日期：2026-07-26
> 审计范围：`server/src/services/arrange/` 全部生产源码
> （`auto-arrange.js`、`queries.js`、`batch.js`、`tabu-search.js`、`validate.js`、`lock.js`）
> 及 `server/src/constants/index.js` 中排课相关配置
> 审计性质：**只读审计**，本文档不伴随任何代码改动
> 姊妹文档：[排课算法完整说明](/kec/scheduling_algorithm)（算法设计说明，v1.0.0）

---

## 一、审计方法与结论摘要

通读六个生产模块共约 3700 行源码，沿"数据准备 → 约束构建 → 五阶段主分配 → 后处理（置换/禁忌搜索）→ 事务落库"主线逐段核对约束执行点，并交叉核对批量排课（`batch.js`）的预览/落库两条路径。

**总体结论**：算法经过多轮修复已相当健壮——并发双层锁、事务内容量与教材双重二次校验、合班去重、容量预留豁免 + 补漏轮、B-03 层次语义全链路对齐、教材上限"预检 / 拿取 / 事务"三层防御等设计均到位。本次审计未发现会产生**非法排课结果**的缺陷（所有硬约束在落库前均有兜底校验），发现的问题集中在三类：

1. **口径不一致**：教材硬上限在"非预览批量排课"路径下跨课程失效（预览路径正常）；
2. **欠优化**：阶段 2~4 仍沿用"全局需求降序选组"，阶段 1 已修复的"零头组烧教材名额"模式对无意向教师依然存在；置换回溯不做评分择优；装箱贪婪留缺口；
3. **可维护性**：死配置、非严格弱序比较器、诊断日志无级别守卫等。

共 17 项发现：**P1 × 4、P2 × 9、P3 × 4**，详见第四节。

> **修复跟踪（2026-07-27，v1.3.11 优化批次）**：本批次聚焦排课优化层（`optimize.js`），已修复 **F15**——`calculateMetrics` 综合评分补齐欠分配惩罚（`α × 缺口`）与负载方差惩罚（`β × 方差 × 100`），与 `tabu-search.js` 的 `computeObjective` 对齐，消除 UI 展示评分与算法目标函数的口径矛盾。同批次另修复优化层 **N+1 查询**（逐班 `findUnique` → 批量 `findMany`）与**跨课程状态回写**（`courseTeacherConstraints` → 共享 `teacherConstraints`，教材集合替换、学院集合只增不减），对应三阶段深度审计的 P0 项，不在本审计 F 编号内。其余 F1–F4、F5–F14、F16–F17 仍待排期处理。
>
> **修复跟踪（后续批次）**：**F1**（`globalTextbookMap` 预览/非预览双模式启用 + DB 种子并集合并）、**F2**（“教师视角选组”共享函数推广至阶段 2/4）、**F8**（非预览补漏轮先跑 preview 评估，不劣于主轮才真实重排）、**F10**（诊断日志包 debug 级别守卫 + 预建计数 Map）、**F11**（`assignRound` 排序前预计算 eligibleCount Map）均已修复，代码中有对应 `F1/F2/F8/F10/F11 修复` 标记。尚待排期：F3–F7、F9、F12–F14、F16–F17。

---

## 二、算法全景：约束条件盘点

### 2.1 硬约束（违反即不可分配，多层校验）

| # | 约束 | 主要执行点 | 兜底校验 |
|---|------|-----------|---------|
| H1 | 教师课时容量：`assignedHours + weeklyHours ≤ cap`（standard 模式取 `standardCap`，full 模式取 `fullCap`） | `isTeacherEligible` / `takeClassesForTeacher` / `canAccept` / 置换各分支 | 事务内按 DB 实排重算（C-2） |
| H2 | 意向学院：教师设置 `schedulingCollegeIds` 后只能拿匹配学院 | `isPrefMatch`（阶段 1/3/4 严格）、`isTeacherEligible`（阶段 5）、`trySwapOne`/`tryPlaceClass`（S-02）、`canAccept`（禁忌搜索） | — |
| H3 | 意向层次：同上，含"班级无层次 + 教师有层次约束 → 不匹配"（B-03 全链路对齐） | 同 H2 | — |
| H4 | 教材硬上限：教师教材数 ≤ `MAX_TEXTBOOKS_PER_TEACHER`（=2），**业务口径为全学期累计 2 本**（跨课程） | 阶段 1 预检 / `takeClassesForTeacher` 投影 / `isTeacherEligible` / `checkTextbookAdd`/`checkTextbookSwap` / `canAccept` | 事务内 baseline+written 投影校验（P1-2） |
| H5 | 合班一致性：同 `combinationId` 成员班必须同教师 | `mergeCombinedClasses` 归并为单元（结构性保证） | `validateCombinedClassConsistency`（供外部校验） |
| H6 | 手动/锁定安排保护：不参与重排，但教材/学院/课时计入教师状态 | 主流程"手动排课追踪"段 | 落库仅删 `is_auto=true && is_locked=false` |
| H7 | 无效课时班级（`weeklyHours ≤ 0`）不参与排课与置换 | 主流程预过滤（M-10）、`trySwapOne` 守卫（P1-10） | — |
| H8 | 并发互斥：课程级 + 学期级，进程内 Set + DB 锁双层 | `arrangeLocks`/`batchLocks` + `lock.js` | 事务内容量二次校验兜底并发漏网 |

**容量公式**（`buildTeacherConstraints`）：

```
effectiveTotal = max(0, totalWeeklyHours − 本课程旧自动课时 + extraTeacherHours)
teacherHourCap = defaultWeeklyHours != null ? max(0, defaultWeeklyHours − effectiveTotal) : null
standardCap    = floor(min(teacherHourCap, max(0, standard − effectiveTotal)) × reserveRatio)
fullCap        = floor(min(teacherHourCap, max(0, max − effectiveTotal)) × reserveRatio)
```

`reserveRatio` 仅批量主轮为 0.85（`BATCH_CONFIG.RESERVE_RATIO`），且"无任何后续课程会用到"的教师豁免打折（P0-2 深化）；补漏轮恢复 1.0 回收预留。

### 2.2 软约束（评分引导，`calcMatchScore`）

| 项 | 权重 | 说明 |
|----|------|------|
| 学院意向匹配 | +5（`COLLEGE_WEIGHT`） | |
| 已接同学院班级 | +3（**硬编码**） | 学院内聚奖励 |
| 层次意向匹配 | +5（`LEVEL_WEIGHT`） | |
| 本轮已持教材 | +10（`ASSIGNED_WEIGHT`） | |
| 固有教材匹配 | +4（`INHERENT_WEIGHT`） | `isTextbookMatch` 基于固有快照（P1-A） |
| 新增教材 | −10/本（`PENALTY_PER_NEW`） | |
| 0 本教师 | +30（`ZERO_TEXTBOOK_BONUS`） | |
| 1 本接同教材 | +10；1 本接新教材 | −300（强力惩罚，"一本教材"原则） |
| 已达上限接新教材 | −300（直接 return） | 与 H4 硬检查双保险 |

评分仅在阶段 5（`assignRound`/`selectBestTeacher`）与禁忌搜索中生效；阶段 1~4 为规则式拿取，不走评分。

### 2.3 排序与决策规则

- 教材组遍历序：组内总周课时**全局需求降序**（`buildGroupAvailable`）；
- 阶段 1（2026-07 重构）：意向教师按剩余容量降序逐人处理，每人循环选"最佳组"——已持教材组 tier 0 优先，其余按**本人意向内可拿课时降序**，并列按组剩余需求降序、tbKey 升序；
- 阶段 2~4：教师按**剩余容量降序**，`takeClassesForTeacher` 内班级按"已接学院优先 → 学院 ID → 班级 ID"排序尽量吃满；
- 阶段 5：班级按**可选教师数升序**（MRV 启发式）+ 教材签名字典序；教师按评分/负载率综合（`selectBestTeacher`）。

---

## 三、五阶段与后处理管线核对结果

| 阶段 | 逻辑 | 核对结论 |
|------|------|---------|
| 数据准备 | `getTeachersForCourse` / `getClassesWithCourse`：合班去重后聚合课时（B1）、`findBestMatchPlan` 唯一方案（高-5）、跨课程固有教材推导（高-4）、`FALLBACK_EMPTY` 收紧 | ✅ 口径与 dashboard/导出一致 |
| 阶段 1 意向教师 | 教师视角选组（详见 2.3），防死循环兜底 `taken.length===0 → break` | ✅ 刚修复，回归 4 用例覆盖 |
| 阶段 2 无意向教师 | 按组全局需求降序 × 教师剩余容量降序吃满；限"0 本或已持该组教材"教师 | ⚠️ 见发现 F2、F13 |
| 阶段 3 同教材追加 | 全体已持该组教材教师追加，严格 `isPrefMatch` | ✅ |
| 阶段 4 第二本教材 | 未持该组教材且有容量的教师，教材上限预检后拿取 | ⚠️ 见发现 F2 |
| 阶段 5 兜底 | `assignRound`：MRV 排序 + 评分择优；意向/容量/教材上限仍为硬约束 | ✅ "放宽"仅指放弃组顺序与吃满策略 |
| 置换回溯 | `trySwapOne`（单轮）→ `tryPlaceClass`（受限深度递归 ≤3，visited 防环，>30 个未分配时降级） | ⚠️ 见发现 F3、F4 |
| 禁忌搜索 | 默认关闭，可经 `system_settings` 动态开启；Insert/Shift/Swap 三算子，硬约束邻域内过滤 | ⚠️ 见发现 F15 |
| 事务落库 | 全量替换语义（C-3）；容量+教材双重二次校验，超载/越限分配降级为 unassigned（P1-6 分类原因） | ✅ |
| 批量排课 | 供需比降序排课程；预留 0.85 + 豁免；预览态虚拟课时/教材累计与失败回滚（B-03）；补漏轮回收预留 | ⚠️ 见发现 F1、F7、F8 |

---

## 四、发现与优化建议

优先级定义：**P1** = 正确性/口径问题，建议尽快修复；**P2** = 质量/健壮性优化，按收益排期；**P3** = 低风险维护项。

### P1 —— 口径与正确性

#### F1. 非预览批量/单课程排课中，教材硬上限（全学期 2 本口径）跨课程失效 【已修复】

> 业务口径已确认（2026-07-26）：**上限为全学期累计 2 本**，非单课程 2 本。预览批量路径的行为是正确基准，其余路径需对齐。

- **现状**：`assignedTextbookIds` 初始为空集（`queries.js` 返回 `new Set()`），跨课程累计仅靠 `globalTextbookMap`，而 `batch.js` 只在 `options.preview` 时构建该 Map（S-13 修复只覆盖了预览路径）。非预览批量与单课程排课时，前序课程已落库的教材只进入 `inherentTextbookIds`（仅参与评分/匹配），**不计入 H4 硬上限**。
- **影响**：教师可在课程 A 拿 2 本教材、课程 B 再拿 2 本，全学期实际 4 本，违反已确认的全学期口径；且**预览结果与实际落库结果不一致**（预览受限、落库不受限），用户"先预览再执行"看到的方案可能与落库方案偏离。
- **建议**（按全学期口径修复）：
  1. 首选方案：在 `getTeachersForCourse` 中直接以 `assignedOnlyTextbookMap`（已有的"实排教材"快照，来源为 DB 已落库安排）作为 `assignedTextbookIds` 种子——单课程排课与非预览批量天然生效，无需依赖调用方传参；
  2. 非预览批量同步构建 `globalTextbookMap`（每门课程落库后把 `result.assigned × classTextbookMap` 累入），保证同一批次内前序课程结果即时计入，与预览路径行为完全一致；
  3. 事务落库的教材二次校验（P1-2）baseline 同样按全学期口径取数，作为最后兜底；
  4. 回归验证：同一教师跨两门课程排课后教材总数 ≤2 的用例（预览/非预览各一）。
- **涉及**：`batch.js` L136-138、`queries.js` L458、`auto-arrange.js` S-13 段与事务校验段。

#### F2. 阶段 2/4 仍存在“零头组烧教材名额”模式（阶段 1 同款问题未推广修复） 【已修复】

- **现状**：阶段 2/4 按 `groupAvailable` 全局需求降序遍历组、组内教师吃满。当大组已被拿得只剩零头时，0 本教师会先接零头（占 1 个教材名额），阶段 4 再接第二个零头组后名额耗尽，供给充足的其他组无法再接。这正是阶段 1 已修复的"蒋梅缺陷"在无意向教师上的翻版，只是无意向教师可跨学院拿满大组、触发概率较低。
- **影响**：课时充足时个别无意向教师欠分配、未分配班级增多（部分由置换回溯挽回，但置换不保证成功）。
- **建议**：把阶段 1 的"教师视角选组"推广为通用函数（参数化 `strictPref`），阶段 2 复用：对每位教师按"可拿课时（容量内、单班可放入）降序 + tier（已持教材优先）"选组，连续拿组直至容量/名额用尽。阶段 3 不受影响（只追加已持教材），阶段 4 天然被吸收（教师视角本就允许开第二本）。
- **涉及**：`auto-arrange.js` 阶段 2（L1610-1641）、阶段 4（L1691-1733）。

#### F3. 置换回溯不做评分择优，可能劣化内聚与匹配率

- **现状**：`trySwapOne` 和 `tryPlaceClass` 均按 `teacherConstraints` 数组顺序取**第一个可行解**即执行，不比较 `calcMatchScore`。被驱逐班级 V 的新家、接纳 U 的教师 T 都可能是评分很差的组合（如给 T 引入新教材、跨出已接学院）。
- **影响**：置换成功换来分配率提升，但教材内聚率、学院/层次匹配率被无声侵蚀；且结果对教师 `sort_order` 敏感。
- **建议**：候选教师先按 `calcMatchScore(t, cls)` 降序（同分按剩余容量降序）再逐个尝试；`trySwapOne` 的 (T, V, T″) 三元组可收集全部可行解后取"总评分损失最小"者。改动收益直接体现在 preview 统计的 `textbookCohesionRate` / `collegeMatchRate` 上，易验证。
- **涉及**：`trySwapOne`（L937 起）、`tryPlaceClass`（L804 起）。

#### F4. `placeClassOnTeacher` 未维护 `assignedCollegeIds`

- **现状**：`recordAssignment` 会 `assignedCollegeIds.add(cls.collegeId)`，但置换路径的 `placeClassOnTeacher` 只更新课时与教材，不更新学院集合。
- **影响**：后续评分（+3 学院内聚奖励）与禁忌搜索初始状态失真；影响面小但属状态维护不一致，易在未来引入难查的偏差。
- **建议**：`placeClassOnTeacher` 内补 `t.assignedCollegeIds?.add(...)`（需从 `classInfoMap` 取 collegeId 或在 cls 上带出）；对称地，`evictFromTeacher` 可不回收（与禁忌搜索"学院只增不减"的保守策略一致，注释说明即可）。

### P2 —— 质量与健壮性

#### F5. `selectBestTeacher` 比较器非严格弱序

- **现状**：三段式比较（分数差 ≥1 → 按分数；负载率差 >0.2 → 按负载率；否则综合），存在 a>b、b>c、c>a 的可能，`Array.prototype.sort` 对非传递比较器的结果依引擎实现而定。
- **建议**：改为无阈值分段的确定性字典序：`round(score)` 降序 → `round(loadRate/0.2)` 分档升序 → 原始 score 降序 → teacherId 升序；或保留阈值语义但改为"先分档再逐级比较"（分档函数保证传递性）。
- **涉及**：`selectBestTeacher`（L373-388）。

#### F6. `takeClassesForTeacher` 顺序贪婪装箱留缺口

- **现状**：按学院序顺序拿，装不下就跳过（`continue`），不回头调整。剩余容量 16、全是 3h 班时只能拿到 15h，留 1h 永久缺口；缺口累积会体现为"教师未排满标准课时"。
- **建议**：低成本方案——拿取结束后若 `remainingCap - usedHours = gap > 0`，在未拿班级中找 `weeklyHours === gap` 的班补位，或做一次"换出已拿的 x、换入 y（y.hours − x.hours === gap）"的单交换；完整方案——容量 ≤40、课时为小整数，可用子集和 DP 求组内最优装箱（复杂度 O(N × cap)，可接受）。
- **涉及**：`takeClassesForTeacher`（L1434-1474）。

#### F7. 批量排课课程优先级的供需测算口径失真

- **现状**：需求 = `plan_course_semesters.weekly_hours` 按 plan_course 全学期求和（未过滤当前学期、未乘实际班级数、含无在读班级的方案）；供给 = 教师数 × 统一 `full_time.standard`（忽略人员类型差异与既有负载）。
- **影响**：仅影响排课顺序启发式，不影响正确性；但顺序失真会放大预留浪费与补漏轮工作量。
- **建议**：需求改为 `getClassesWithCourse(courseId, semester)` 结果的 `Σ weeklyHours`（可缓存复用，主轮排课本来就要查）；供给按 `Σ min(personnelType.standard − totalWeeklyHours, defaultWeeklyHours 余量)` 估算。
- **涉及**：`batch.js` L77-115。

#### F8. 补漏轮非预览模式“先落库后发现回退”不可恢复 【已修复】

- **现状**：补漏轮直接以 `capacityReserveRatio=1.0` 重跑非预览 `autoArrange`（删旧写新）。若重排结果劣于主轮（日志已见 `重排回退` 告警路径），预览模式可保留主轮结果，**非预览只能如实采纳劣化结果**。
- **建议**：非预览补漏轮先跑一次 `preview:true` 评估（利用 `extraTeacherHours` 复原语义），仅当 `autoCount` 不劣于主轮才执行真实重排；成本为多一次内存计算，换来"补漏只增不减"的落库保证。
- **涉及**：`batch.js` L272-343。

#### F9. DB 锁释放无持有者标识

- **现状**：`releaseLock` 按 `lock_key` 无条件 DELETE。若一次排课超过锁过期时间（10 分钟）后另一实例清理过期锁并取得新锁，前一实例 `finally` 中的 `releaseLock` 会误删他人锁。当前批量超时 5 分钟 < 过期 10 分钟，风险低，但属经典锁误释放模式。
- **建议**：`arrange_locks` 增加 `owner` 列（进程内生成 uuid），`acquireLock` 写入、`releaseLock` 带 `AND owner = ?` 条件删除。
- **涉及**：`lock.js`。

#### F10. 诊断日志在 ENABLED 下无条件构建大字符串 【已修复】

- **现状**：`TEXTBOOK_COHESION.ENABLED=true` 时每次排课都会为全部教师、全部班级构建 debug 字符串（教材分布、教师初始状态、最终分布），即使日志级别为 info，模板字符串求值也照常发生；`L1832` 还对每位教师做一次 `assignments.filter` 全扫描（O(T×A)）。
- **建议**：诊断段整体包一层 `if (logger.isDebugEnabled?.() ?? logger.level === 'debug')` 守卫；教师班级计数改为一次遍历预建 Map。
- **涉及**：`auto-arrange.js` L1229-1254、L1824-1841。

#### F11. `assignRound` 排序时 `countEligibleTeachers` 重复计算 【已修复】

- **现状**：sort 比较器内每次调用都全量扫描教师（O(C log C × 2T)），且 `isTeacherEligible` 含多层判断。百班级 × 数十教师规模尚可，但批量 60+ 课程叠加后可感知。
- **建议**：排序前预计算 `Map<classId, eligibleCount>` 一次（O(C×T)），比较器查表。
- **涉及**：`assignRound`（L1304-1311）。

#### F12. 意向教师供给不足缺乏前置预警与结果指标

- **现状**：意向是硬约束（全链路），意向学院/层次内供给 < 教师标准课时时该教师**注定欠课时**，但 warnings 只有全局"总课时超总容量"一条，结果 statistics 也无意向维度指标。运维只能像本次"蒋梅问题"一样事后逐人排查。
- **建议**：
  1. 排课前按意向教师逐人计算"意向内可拿课时上限 vs standardCap"，不足时输出 warning（如"教师蒋梅意向范围内供给 12h < 标准 16h，无法排满"）；
  2. preview statistics 增加 `prefTeacherFulfillment`（意向教师达标率）指标，前端结果弹窗展示。
- **涉及**：`auto-arrange.js` warnings 构建段、`buildResult` statistics。

#### F13. 阶段 2 的"无教材组"把已持教材教师排除在外

- **现状**：`__no_textbook__` 组的 `textbookIds=[]`，阶段 2 过滤条件 `textbookIds.some(...)` 对空数组恒为 false → 持有任何教材的教师都不能在阶段 2 接无教材班级（拿无教材班本不占教材名额）。阶段 3 的过滤条件（`textbookIds.length === 0 ||`）已兜住，最终能分出去，但顺序被人为推迟。
- **建议**：阶段 2 过滤条件对空 `textbookIds` 直接放行（与阶段 3 对齐）。若采纳 F2 的"教师视角选组"重构，此问题随之消失。

### P3 —— 维护项

#### F14. 死配置与不可达分支

- `COHESION_PHASE_ENABLED`、`PHASE0_ENABLED` 仅在常量定义与测试 mock 中出现，生产代码无引用（v2 重写后遗留）；`calcMatchScore` 中 `tbCount >= 3 / >= 2` 分支在 `maxTb=2` 下不可达（源码已注释说明）。建议删除死配置、保留分支注释，避免误导后续调参。

#### F15. 禁忌搜索目标函数缺"教师达标"与"负载均衡"维度 【已修复 2026-07-27】

- 目标 = Σ匹配评分 − 未分配×500，不含"教师距标准课时缺口"与负载方差项。即使开启，搜索也不会主动把欠课时教师补满（Insert 恒正必然优先，但 Shift/Swap 可能把课时从欠分配教师身上移走而不受罚）。若未来启用禁忌搜索，建议目标函数追加 `−α × Σ max(0, standardCap − assignedHours)`（欠分配缺口惩罚）与轻量负载方差项；同时 Swap 算子的随机采样建议改为固定种子伪随机，保证同输入结果可复现（当前 `Math.random()` 导致开启后排课不可复现）。

#### F16. 合班单元意向/学院匹配只看代表班

- `mergeCombinedClasses` 取 `members[0]` 为代表，学院/层次匹配、教材推导均基于代表班。若合班组合跨学院或跨层次（业务上应不允许，但 DB 层无约束），匹配结果对成员班失真。建议归并时校验成员班 `collegeId/trainingLevelId/weeklyHours/教材签名` 一致性，不一致时输出 warning 并拆散为独立班参与排课。

#### F17. 无教材班级在 `textbookMatchRate` 中恒判不匹配

- `isTextbookMatch` 对 `cls.textbookIds` 为空恒返回 false，`calcAllMatchRates` 的分母却包含此类班级，导致课程班级多数无教材时 `textbookMatchRate` 系统性偏低、误导调参。建议统计口径排除无教材班级（分母只计有教材班级），或对无教材班级计为"不适用"。

---

## 五、综合优化路线建议

按"收益 / 风险 / 工作量"排序的落地顺序建议：

| 批次 | 内容 | 预期收益 | 验证手段 |
|------|------|---------|---------|
| 第 1 批（口径修正） | F1（教材上限对齐全学期 2 本口径，口径已确认）+ F4 + F13 | 预览与落库一致；消除隐性 4 本教材 | 批量 preview vs 落库结果 diff；`avgTextbookPerTeacher` 指标 |
| 第 2 批（分配率与满员率） | F2（教师视角选组推广至阶段 2）+ F6（装箱补洞）+ F12（意向预警与指标） | 无意向教师欠分配减少；标准课时缺口收敛；问题前置暴露 | 现有 237 用例 + 真实学期 preview：未分配数、教师达标率对比 |
| 第 3 批（后处理提质） | F3（置换评分择优）+ F8（补漏轮先预览） | 置换不再侵蚀内聚率；补漏"只增不减"落库保证 | preview statistics 的 cohesion/match 率对比 |
| 第 4 批（健壮性清理） | F5、F7、F9、F10、F11、F14、F17 | 确定性、性能、可维护性 | lint + 全量回归 |
| 长期备选 | F15（禁忌搜索目标函数增强后开启评估）、F16（合班一致性校验）、五阶段与 `assignRound` 双轨逻辑归一 | 全局解质量上限提升；代码路径收敛 | 大规模学期 A/B（tabu on/off）预览对比 |

**重构提示**：F2 落地时建议把阶段 1 的选组循环抽为 `takeGroupsForTeacher(teacher, groupAvailable, { strictPref })` 共享函数，阶段 1/2 各传参调用，同步把阶段 1 的 4 个回归用例参数化复用到阶段 2 场景，避免两处逻辑再度漂移。

---

## 附录 A：关键配置速查（`constants/index.js`）

| 配置 | 当前值 | 说明 |
|------|--------|------|
| `DEFAULT_HOUR_SETTINGS` | full 16/20，part 12/16，external 12/16 | 可被 `system_settings` 按课程覆盖 |
| `TEXTBOOK_COHESION.MAX_TEXTBOOKS_PER_TEACHER` | 2 | 教材硬上限，全学期累计口径（0=不限） |
| `TEXTBOOK_COHESION.FALLBACK_EMPTY` | true | 无排课记录教师固有教材为空集 |
| `WORKLOAD_BALANCE` | SCORE_THRESHOLD 1 / LOAD_RATE_THRESHOLD 0.2 | `selectBestTeacher` 分段阈值 |
| `SWAP_CONFIG` | MAX_DEPTH 3 / MAX_UNASSIGNED 30 | 递归置换深度与规模保护 |
| `BATCH_CONFIG.RESERVE_RATIO` | 0.85 | 批量主轮容量预留（豁免见 P0-2 深化） |
| `TABU_SEARCH.ENABLED` | false | 可经 `system_settings.tabu_search_enabled` 动态开启 |
| `BATCH_TIMEOUT_MS`（batch.js） | 5 分钟 | 主轮 + 补漏轮共享预算 |
| 锁过期（lock.js） | 10 分钟 | `arrange_locks` 表，无持有者标识（见 F9） |

## 附录 B：本次审计确认的既有防御性设计（无需改动）

- 事务内"全量替换 + 容量/教材二次校验 + 降级原因分类"（C-2/C-3/P1-2/P1-6）；
- 合班课时去重口径与 dashboard/导出一致（B1 + `dedupeTeachingUnits`）；
- 批量预览失败快照回滚（B-03）、预留豁免（P0-2 深化）、补漏轮预览态重建；
- B-03"无层次班级 × 有层次约束教师"语义在主分配、置换、禁忌搜索三处一致；
- 教师固有教材快照（P1-A）隔离运行时累加污染；
- `diagnoseFailure` 四级归因（容量满 → 总上限 → 教材上限 → 意向无候选）。
