# KEC 排课算法与教材内聚策略完整说明

> 主代码：`server/src/services/arrange/auto-arrange.js`
> 配置：`server/src/constants/index.js`（`TEXTBOOK_COHESION`）
> 版本：v1.3.0
> 分析对象：`server/src/services/arrange/` 目录（`auto-arrange.js`、`queries.js`、`batch.js`、`validate.js`）

---

## 一、代码结构

排课逻辑已从单文件 `teaching-arrange.service.js` 重构为 `server/src/services/arrange/` 目录，按职责拆分：

| 文件                          | 职责                                       | 主要导出/函数                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `arrange/queries.js`          | 数据查询与匹配函数                         | `getClassesWithCourse`、`getTeachersForCourse`、`isTextbookMatch`、`isCollegeEligible`、`isLevelEligible`、`parseSemester`                                                                                                           |
| `arrange/validate.js`         | 课时设置校验                               | `validateHourSettings`                                                                                                                                                                                                               |
| `arrange/auto-arrange.js`     | 排课主算法、评分、置换回溯、结果构建、统计 | **导出**：`autoArrange`、`batchLocks`、`calcMatchScore`、`isTeacherEligible`、`calcAllMatchRates`、`diagnoseFailure`、`selectBestTeacher`、`trySwapOne`；**内部函数**：`buildTeacherConstraints`、`trySwapUnassigned`、`buildResult` |
| `arrange/tabu-search.js`      | 禁忌搜索优化层（可选）                     | `tabuOptimize`（Insert/Shift/Swap 邻域、禁忌表、aspiration criterion）                                                                                                                                                               |
| `arrange/batch.js`            | 批量排课                                   | `batchAutoArrange`（从 auto-arrange.js 导入 `batchLocks`）                                                                                                                                                                           |
| `teaching-arrange.service.js` | 入口转发                                   | 仅 re-export，无业务逻辑                                                                                                                                                                                                             |

### 1.1 并发锁

| 锁             | 范围                   | 用途                                                                                                                                             |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `arrangeLocks` | `courseId:semesterStr` | 防止同一课程在同一学期被并发排课                                                                                                                 |
| `batchLocks`   | `semesterStr`          | 防止批量排课与单课程排课并发；批量进行中，同 semester 的单课程 `autoArrange` 直接拒绝（批量内部调用通过 `options.skipBatchLockCheck=true` 绕过） |

> 上述锁均为进程内存级别，仅适用于单进程部署（如 PM2 fork 模式）。多实例部署需改用 Redis 分布式锁或数据库行级锁。

---

## 二、核心概念

### 2.1 排课目标

为指定课程在指定学期内，将教师分配到所有需要该课程的班级，同时满足：

- 教师的学院偏好和层次偏好
- 教材匹配度与教材内聚度
- 教师课时容量约束
- 教材数量硬上限
- 保护手动排课记录不被覆盖

v2 算法严格遵循以下设计原则：

1. **教师拿教材的方式**：所有教师先拿完第一本教材，再拿第二本
2. **学院优先**：优先拿完一个学院的班级，再拿其他学院
3. **意向约束严格**：指定了意向学院或意向层次的教师，必须严格按照指定的类型来优先拿取教材
4. **无指定按容量**：未指定任何意向的教师，按课时容量去拿
5. **手动排课追踪**：手动排课的教材和课时需要计入教师状态

### 2.2 与旧算法（v1）的区别

| 维度          | 旧算法（v1）     | 新算法（v2）                       |
| ------------- | ---------------- | ---------------------------------- |
| 教材分配顺序  | 教师主动选教材组 | 按教材组顺序，所有教师先拿完第一本 |
| 学院内聚      | 排序时优先同学院 | 同教材组内严格按学院排序           |
| 意向约束      | 评分权重体现     | 严格过滤，不匹配直接排除           |
| 有/无指定教师 | 混合处理         | 分阶段处理，有指定优先             |
| 手动排课追踪  | 仅追踪教材       | 追踪教材+学院+课时                 |

### 2.3 学期格式

学期使用 `"YYYY-YYYY-N"` 格式，例如 `"2025-2026-1"` 表示 2025-2026 学年第一学期。

学期序号计算由 `semester.service.js` 的 `calcClassSemester` 完成：

```
年级 = 学年起始年 - 入学年份 + 1
当前学期序号 = (年级 - 1) × 2 + 学期索引
```

---

## 三、核心数据结构

### 3.1 教师约束对象（`buildTeacherConstraints` 输出）

在原始教师数据上扩展以下字段：

| 字段                         | 类型             | 说明                                                                                                 |
| ---------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `standardHours` / `maxHours` | `number`         | 来自 `hourSettings` 的标准 / 满载课时                                                                |
| `effectiveTotal`             | `number`         | 已排总周课时（扣除本课程已自动排部分 + 批量前序虚拟课时）                                            |
| `courseExistingHours`        | `number`         | 本课程已排周课时                                                                                     |
| `standardCap` / `fullCap`    | `number`         | 当前可继续分配的标准 / 满载容量上限（已扣除 `effectiveTotal`，并受 `defaultWeeklyHours` 天花板约束） |
| `teacherHourCap`             | `number \| null` | 教师自定义课时上限（`defaultWeeklyHours - effectiveTotal`）                                          |
| `assignedHours`              | `number`         | 本轮已分配周课时（初始为 0，分配时累加）                                                             |
| `inherentTextbookIds`        | `number[]`       | 排课前固有的教材快照，运行时累加不污染匹配判断                                                       |
| `assignedTextbookIds`        | `Set<number>`    | 本轮（含手动排课）已分配教材集合，动态更新                                                           |
| `assignedCollegeIds`         | `Set<number>`    | 本轮已分配学院集合，用于学院内聚奖励                                                                 |
| `textbookIds`                | `number[]`       | 教材列表（动态累加，含固有 + 本轮新增）                                                              |

### 3.2 班级对象

`getClassesWithCourse` 返回的班级上挂载 `textbookIds: number[]`（由 `textbooks` 映射而来），供评分与分组使用。

每条候选班级携带：`classId`、`className`、`collegeId`、`majorId`、`trainingLevelId`、`grade`、`weeklyHours`、`weeksCount`、`totalHours`、`textbooks`（数组）等。

---

## 四、班级筛选逻辑

### 4.1 班级纳入条件（`getClassesWithCourse`）

一个班级被纳入某课程的排课候选，必须同时满足：

- 未离校、学制内（由 `getActiveClassFilter` 统一生成查询条件）
- 该班级关联的培养方案中包含目标课程
- 该课程在当前学期有课时安排（`plan_course_semesters` 记录）

### 4.2 培养方案匹配优先级

使用 `findBestMatchPlan`（来自 `plan.service.js`）选定唯一最佳方案，三级优先级：

| 优先级 | 条件                                                 | 说明                     |
| :----: | ---------------------------------------------------- | ------------------------ |
|   1    | `class.custom_plan_id === plan.id`                   | 班级绑定了自定义培养方案 |
|   2    | `class.major_id === plan.major_id`                   | 按专业匹配               |
|   3    | `class.training_level_id === plan.training_level_id` | 按培养层次匹配（兜底）   |

---

## 五、教师筛选逻辑

### 5.1 教师纳入条件（`getTeachersForCourse`）

| 条件     | 说明                                        |
| -------- | ------------------------------------------- |
| 状态活跃 | `status = 'active'`                         |
| 课程关联 | 通过 `teacher_courses` 关联表与目标课程关联 |

### 5.2 教师字段

| 字段                                  | 来源                            | 用途                                                 |
| ------------------------------------- | ------------------------------- | ---------------------------------------------------- |
| `personnelType`                       | `teachers.personnel_type`       | 确定课时容量档次（full_time / part_time / external） |
| `defaultWeeklyHours`                  | `teachers.default_weekly_hours` | **教师总周课时上限**（跨所有课程），可选             |
| `schedulingCollegeIds`                | `teacher_scheduling_colleges`   | 学院意向                                             |
| `schedulingLevelIds`                  | `teacher_scheduling_levels`     | 层次意向                                             |
| `textbookIds` / `inherentTextbookIds` | 实际排课或培养方案推导          | 固有教材快照                                         |
| `totalWeeklyHours`                    | 本学期所有排课课时总和          | 整体工作量                                           |
| `courseHours`                         | 本课程本学期已排课时            | 本课程课时统计                                       |
| `assignedTextbookIds`                 | 初始化为空 `Set`                | 运行时累加的教材集合                                 |
| `assignedCollegeIds`                  | 初始化为空 `Set`                | 运行时累加的学院集合                                 |

### 5.3 教材 ID 推导（两级推导策略）

1. **实际排课推导（优先）**：跨课程查询教师在该学期的全部排课记录，追溯每个班级的最佳匹配培养方案，提取 `plan_textbooks` 中的教材 ID。
2. **培养方案推导（兜底）**：对无排课记录的教师，根据 `TEXTBOOK_COHESION.FALLBACK_EMPTY` 决定：
   - `FALLBACK_EMPTY = true`（当前默认）：教材为空集合（收紧策略，避免 `isTextbookMatch` 对新教师全通过）
   - `FALLBACK_EMPTY = false`：取所有关联培养方案中该课程教材 ID 的并集（保守超集）

### 5.4 固有教材快照固化

`getTeachersForCourse` 返回的教师对象包含：

- `textbookIds`：初始等于 `inherentTextbookIds`，运行时会被 `recordAssignment` 累加
- `inherentTextbookIds`：固化的快照，运行时不变
- `assignedTextbookIds`：`new Set()`，本轮运行时累加

`buildTeacherConstraints`（auto-arrange.js）再次固化快照：

```javascript
inherentTextbookIds: [...(t.textbookIds || [])],
```

确保 `isTextbookMatch` 在整个排课过程中读取的是入场时的教材集合。

---

## 六、教材匹配核心：isTextbookMatch

**位置**：`arrange/queries.js`

```javascript
export function isTextbookMatch(teacher, cls) {
  const inherentIds = teacher.inherentTextbookIds ?? teacher.textbookIds;
  if (!cls.textbookIds?.length) return false; // 班级无教材，不匹配
  if (!inherentIds?.length) return true; // 教师无固有教材约束，能教任何教材
  return inherentIds.some((tid) => cls.textbookIds.includes(tid));
}
```

### 实际行为

| 条件                                     | 返回值  | 说明                                            |
| ---------------------------------------- | :-----: | ----------------------------------------------- |
| 班级无教材（`cls.textbookIds` 为空）     | `false` | 班级无教材，不需要匹配                          |
| 教师无固有教材约束（`inherentIds` 为空） | `true`  | 教师能教任何教材                                |
| 二者均有                                 | 取交集  | `inherentIds` 与 `cls.textbookIds` 有交集即匹配 |

**关键设计**：始终使用教师**固有教材快照**（`inherentTextbookIds`），不受本次分配累加污染。教师无固有教材约束时，对任何有教材的班级都返回 `true`。

### 与旧文档"修复 1"的差异

旧文档（v1.0）预期 `isTextbookMatch` 对新教师返回 false。**实际实现相反**：当 `FALLBACK_EMPTY=true` 时，`inherentTextbookIds=[]`，`isTextbookMatch` 返回 `true`，新教师不会被教材匹配阶段屏蔽。这一设计让新教师具备教材匹配资格，由 v2 五阶段算法的"先拿第一本教材"策略自然形成教材归属。

---

## 七、约束条件

### 7.1 默认课时设置（`DEFAULT_HOUR_SETTINGS`）

| 人员类型           | 标准课时 (standard) | 最大课时 (max) |
| ------------------ | :-----------------: | :------------: |
| 专职 (`full_time`) |         16          |       20       |
| 兼职 (`part_time`) |         12          |       16       |
| 外聘 (`external`)  |         12          |       16       |

**存储位置**：

- 全局默认：`system_settings` 键 `teaching_hour_settings`
- 按课程自定义：键 `teaching_hour_settings_{course_id}`

### 7.2 排课模式

| 模式                  | 使用上限      | 行为                         |
| --------------------- | ------------- | ---------------------------- |
| 标准模式 (`standard`) | `standard` 值 | 保守，教师总课时不超过标准值 |
| 全量模式 (`full`)     | `max` 值      | 宽松，允许教师课时达到最大值 |

### 7.3 容量计算（`buildTeacherConstraints`）

```javascript
autoHoursForCourse = autoHoursMap.get(t.id) || 0;
extraHours = extraTeacherHours?.get(t.id) || 0;
effectiveTotal = t.totalWeeklyHours - autoHoursForCourse + extraHours;

teacherHourCap =
  t.defaultWeeklyHours != null
    ? Math.max(0, t.defaultWeeklyHours - effectiveTotal)
    : null;

standardCap =
  teacherHourCap != null
    ? Math.min(teacherHourCap, Math.max(0, setting.standard - effectiveTotal))
    : Math.max(0, setting.standard - effectiveTotal);

fullCap =
  teacherHourCap != null
    ? Math.min(teacherHourCap, Math.max(0, setting.max - effectiveTotal))
    : Math.max(0, setting.max - effectiveTotal);
```

**关键点**：

- `effectiveTotal` 包含全学期所有课程的总课时，不只是本课程
- 本课程的自动排课课时被减去，因为这些记录将被删除并重新分配
- 手动排课和其他课程的排课保持不变并计入容量
- `defaultWeeklyHours` 是教师**总周课时上限**，会同时收紧 `standardCap` 与 `fullCap`

### 7.4 资格检查（`isTeacherEligible`）

教师被分配一个班级前，必须通过以下硬约束：

| 约束       | 公式                                                                  |
| ---------- | --------------------------------------------------------------------- |
| 容量约束   | `t.assignedHours + cls.weeklyHours ≤ (standardCap 或 fullCap)`        |
| 学院意向   | 教师有 `schedulingCollegeIds` 时，必须包含 `cls.collegeId`            |
| 层次意向   | 教师有 `schedulingLevelIds` 时，`cls.trainingLevelId` 必须在其中      |
| 教材硬上限 | `t.assignedTextbookIds.size + 新增教材数 ≤ MAX_TEXTBOOKS_PER_TEACHER` |

### 7.5 课时设置校验（`validateHourSettings`）

对 `full_time` / `part_time` / `external` 三种类型逐项校验：

- 必须存在 `standard` 与 `max`
- 均为有效数字
- `standard ≥ 1`
- `1 ≤ max ≤ 40`
- `standard ≤ max`

任一项不满足即抛错。

---

## 八、算法流程（v2，5 阶段）

### 8.1 前置处理

1. 加载教师候选池（`getTeachersForCourse`）
2. 加载班级候选池（`getClassesWithCourse`）
3. 加载本课程本学期的手动排课记录，提取 `manualClassIds`
4. 从候选池中排除手动排课的班级（但手动排课的教材和课时仍计入教师上下文）
5. 校验周课时合法性：`weeklyHours ≤ 0` 的班级直接进入未分配列表（原因：`课时配置异常（周课时为0或负数）`），不参与排课
6. 构建 `teacherConstraints`（含 `effectiveTotal`、`standardCap`、`fullCap`、`teacherHourCap`）
7. 追踪手动排课的教材与学院到教师的 `assignedTextbookIds` / `assignedCollegeIds`
8. 容量可行性预检：若 `总班级课时 > 总教师容量`，添加警告（非错误）
9. **按教材对班级分组**（`textbookGroups`）：同教材组内按学院排序；每组维护可变可用班级池 `groupAvailable`

### 8.2 教材分组预处理

```javascript
const textbookGroups = new Map();
for (const cls of validClassesToAssign) {
  const key =
    cls.textbookIds && cls.textbookIds.length > 0
      ? cls.textbookIds.slice().sort().join(",")
      : "__no_textbook__";
  if (!textbookGroups.has(key)) textbookGroups.set(key, []);
  textbookGroups.get(key).push(cls);
}

// 每组内按学院排序（保证同教材内优先拿完一个学院）
for (const [key, group] of textbookGroups) {
  group.sort((a, b) => {
    if (a.collegeId !== b.collegeId) return a.collegeId - b.collegeId;
    return a.classId - b.classId;
  });
}
```

### 8.3 手动排课教材追踪

手动排课的班级虽然不参与自动排课，但教师已分配的教材和课时需要计入：

```javascript
for (const ma of manualAssignments) {
  const teacher = teacherConstraints.find((t) => t.id === ma.teacher_id);
  if (!teacher) continue;
  const cls = allClassMap.get(ma.class_id);
  if (!cls) continue;
  for (const tid of (cls.textbooks || []).map((tb) => tb.id)) {
    teacher.assignedTextbookIds.add(tid);
    if (!teacher.textbookIds.includes(tid)) teacher.textbookIds.push(tid);
  }
  teacher.assignedCollegeIds.add(cls.collegeId);
}
```

### 8.4 五阶段定义

|    阶段    | 处理对象         | 筛选条件                                                                                                                | 说明                           |
| :--------: | ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **阶段 1** | 有指定意向的教师 | `schedulingCollegeIds` 或 `schedulingLevelIds` 非空；本轮已分配教材的教师必须包含当前教材组的教材；0 本教师可拿任意教材 | 严格按意向分配，拿第一本教材   |
| **阶段 2** | 无指定意向的教师 | 无意向约束；本轮已分配教材的教师必须包含当前教材组的教材；0 本教师可拿任意教材                                          | 按课时容量拿第一本教材         |
| **阶段 3** | 所有教师         | 已持有此教材组的教师                                                                                                    | 追加同教材班级（不增加教材数） |
| **阶段 4** | 所有教师         | 未持有此教材组、有剩余容量、且新增后不超 `MAX_TEXTBOOKS_PER_TEACHER`                                                    | 拿第二本教材                   |
| **阶段 5** | 兜底             | 剩余班级用 `assignRound` 放宽约束处理                                                                                   | 综合评分分配                   |

### 8.5 阶段内通用逻辑

- 按教材组遍历 `groupAvailable`
- 筛选符合条件的教师，按剩余容量降序排序
- 教师通过 `takeClassesForTeacher` 从可用班级中拿取，直到课时满或无匹配班级
- `takeClassesForTeacher` 内部按"教师已分配的学院优先 → 学院 ID → 班级 ID"排序班级
- 教材上限追踪：假设拿取后的教材集合不能超过 `MAX_TEXTBOOKS_PER_TEACHER`
- 拿取后调用 `recordAssignment` 更新状态

### 8.6 意向匹配（`isPrefMatch`）

- 有学院意向的教师，只能拿匹配学院的班级
- 有层次意向的教师，只能拿匹配层次的班级
- 阶段 1、3、4 使用严格意向检查；阶段 2 关闭严格检查（教师本身无意向）

### 8.7 兜底分配（`assignRound`，阶段 5）

- 按候选教师数量升序排序班级（少候选优先），同分时按教材签名排序
- 对每个班级，筛选 `isTeacherEligible` 通过的教师，且教材硬上限检查：已达上限的教师只能接已持有教材的班级
- 用 `calcMatchScore` 评分 + `loadRate` 负载均衡，调用 `selectBestTeacher` 选最优教师
- 无候选则归入 `unassigned`

### 8.8 置换回溯（`trySwapUnassigned`）

阶段 5 后对未分配班级尝试置换：

- **单轮置换**（不递归），复杂度 O(U × T × A)
- 对未分配班级 U：遍历所有教师 T（含已满的），找 T 当前某班级 V 能被其他教师 T'' 接管，且 T 腾出容量后能容纳 U
- 置换前校验：
  - T 对 U 的学院/层次资格
  - T'' 对 V 的学院/层次资格
  - T 置换后教材数 ≤ `MAX_TEXTBOOKS_PER_TEACHER`
  - T'' 接管 V 后教材数 ≤ `MAX_TEXTBOOKS_PER_TEACHER`
- `weeklyHours ≤ 0` 的班级不参与置换

### 8.9 教材亲和级联

教师被分配一个班级后，其 `assignedTextbookIds` 和 `textbookIds` 会扩展包含该班级的教材 ID，形成级联的教材亲和效应——后续阶段评分时同教材教师会获得更高分。

### 8.10 持久化（非预览模式）

采用**全量替换**策略，在单个数据库事务中完成：

1. **删除**本课程本学期的所有自动排课记录（`is_auto = true`）
2. **重新聚合**各教师当前学期实际总课时（已扣除本课程旧自动安排）
3. **容量二次校验**：超载的分配降级跳过，归入 `unassigned`，原因：`并发排课导致教师容量已满，已跳过`
4. **教材上限二次校验**：违规的不写入 DB
5. **批量插入**通过校验的分配记录

### 8.11 事务内二次校验

非预览模式写入数据库前，对每位教师做容量与教材上限的二次校验：

- **baseline**：`assignedTextbookIds ∩ inherentTextbookIds`（入场前已存在的教材）
- **written**：本次事务已通过校验的新增教材
- **projected**：`baseline ∪ written ∪ 当前班级教材`
- 若 `projected.size > MAX_TEXTBOOKS_PER_TEACHER`，该分配降级跳过，归入 `unassigned`

---

## 九、评分机制

### 9.1 `calcMatchScore` 加权评分

| 评分项         |            权重/分值             | 来源       | 触发条件                                                               |
| -------------- | :------------------------------: | ---------- | ---------------------------------------------------------------------- |
| 学院意向匹配   |      +`COLLEGE_WEIGHT`（5）      | constants  | 教师上课学院包含班级学院                                               |
| 学院内聚奖励   |                +3                | 硬编码     | 教师已接过该学院班级（`assignedCollegeIds`）                           |
| 层次意向匹配   |       +`LEVEL_WEIGHT`（5）       | constants  | 教师培养层次包含班级层次                                               |
| 已分配教材匹配 |     +`ASSIGNED_WEIGHT`（10）     | constants  | 本轮已分配的教材与班级教材有交集                                       |
| 固有教材匹配   |     +`INHERENT_WEIGHT`（4）      | constants  | 教师固有教材与班级教材有交集（`isTextbookMatch`）                      |
| 新增教材惩罚   | -`PENALTY_PER_NEW` × N（10 × N） | constants  | 接此班需新增 N 本教材                                                  |
| 0 本教材奖励   |   +`ZERO_TEXTBOOK_BONUS`（30）   | constants  | 教师尚未持有任何教材                                                   |
| 同教材追加奖励 |               +10                | **硬编码** | 教师已持有 1 本教材且此班级教材无新增                                  |
| 新增教材硬淘汰 |          score - 10000           | **硬编码** | 教师已达 `MAX_TEXTBOOKS_PER_TEACHER` 且需新增教材，或 1 本教师接新教材 |

### 9.2 教材数量分级奖惩（二轮优化）

`TEXTBOOK_COHESION.ENABLED = true` 时启用，配合 `MAX_TEXTBOOKS_PER_TEACHER = 2`：

| 教师已有教材数                         | 班级是否新增教材 | 结果                                           |
| -------------------------------------- | ---------------- | ---------------------------------------------- |
| 0 本                                   | 任意             | `score += 30`（ZERO_TEXTBOOK_BONUS）           |
| 1 本                                   | 不新增（同教材） | `score += 10`                                  |
| 1 本                                   | 新增             | `return score - 10000`（实质禁止）             |
| ≥ `MAX_TEXTBOOKS_PER_TEACHER`（即 ≥2） | 新增             | `return score - 10000`（实质禁止）             |
| ≥2（不可达分支，仅当调高上限时生效）   | —                | `score -= TEXTBOOK_COUNT_PENALTY_2`（20）      |
| ≥3（不可达分支）                       | —                | `score -= TEXTBOOK_COUNT_PENALTY_3PLUS`（150） |

> 注：`TEXTBOOK_COUNT_PENALTY_1_NEW` 与 `TEXTBOOK_COUNT_BONUS_1_SAME` 虽在 constants 中定义，但 `calcMatchScore` 实际未使用——同教材奖励与新增教材惩罚均为硬编码值（+10 与 -10000）。

### 9.3 教师选择（`selectBestTeacher`）

```javascript
const sorted = [...candidates].sort((a, b) => {
  // 1. 分数差异 ≥ SCORE_THRESHOLD（1），按分数降序
  if (Math.abs(b.score - a.score) >= WORKLOAD_BALANCE.SCORE_THRESHOLD) {
    return b.score - a.score;
  }
  // 2. 负载率差异 > LOAD_RATE_THRESHOLD（0.2），按负载率升序（低负载优先）
  if (
    Math.abs(a.loadRate - b.loadRate) > WORKLOAD_BALANCE.LOAD_RATE_THRESHOLD
  ) {
    return a.loadRate - b.loadRate;
  }
  // 3. 综合排序：分数降序 > 负载率升序
  return b.score - a.score || a.loadRate - b.loadRate;
});
return sorted[0];
```

### 9.4 负载率计算

```
loadRate = (effectiveTotal + assignedHours) / max(1, maxCap + effectiveTotal)
```

---

## 十、手动排课与自动排课的交互

### 10.1 核心原则

**手动排课记录神圣不可侵犯**——自动排课永远不会覆盖手动排课。

### 10.2 保护机制

1. 加载本课程本学期所有手动排课记录（`is_auto = false`）
2. 提取手动排课的班级 ID 集合
3. 从自动排课候选池中**排除**这些班级
4. 手动排课的课时仍计入教师容量（通过 `totalWeeklyHours`）
5. 手动排课的教材与学院仍计入教师的 `assignedTextbookIds` / `assignedCollegeIds`

### 10.3 手动排课操作

- 使用 `upsert`，复合键 `(class_id, course_id, semester)`
- 显式设置 `is_auto = false`
- 如果班级之前有自动排课记录，手动排课会替换它

### 10.4 重置操作

- 仅删除 `is_auto = true` 的记录
- 手动排课记录不受影响

---

## 十一、批量排课（`batchAutoArrange`）

### 11.1 范围

所有在培养方案中出现过的课程（即有 `plan_courses` 记录且至少有一条 `plan_course_semesters` 记录的课程）。

### 11.2 课程排序

按"供需比"降序排序，优先处理"可选教师少、需求大"的课程：

```
supplyCapacity = teacherCount × defaultStandard
supplyDemandRatio = demand / supplyCapacity   (teacherCount=0 时为 MAX_SAFE_INTEGER)
```

### 11.3 执行模型

**顺序执行，非并行**。课程逐个处理，每门课程的排课结果会影响后续课程的教师容量（通过 `totalWeeklyHours`）。

### 11.4 跨课程累计

预览模式下：

- `virtualTeacherHours`：累计每位教师在前序课程中的虚拟分配课时，传入 `extraTeacherHours` 参数
- `globalTextbookMap`：累计每位教师在前序课程中的教材集合，传入 `globalTextbookMap` 参数，用于初始化 `assignedTextbookIds`

非预览模式下，跨课程数据从 DB 实际读取（`getTeachersForCourse` 已查询全部课程的排课记录）。

### 11.5 超时保护

- `BATCH_TIMEOUT_MS = 5 * 60 * 1000`（5 分钟）
- 每门课程排课前检查是否超时
- 超时后停止处理剩余课程，标记 `timeoutReached: true`，未处理课程数记入 `skippedCourses`（数值）

### 11.6 错误隔离

单门课程的排课失败不会中断批量流程。错误被捕获并记录在结果中（`error` 字段），继续处理剩余课程。

---

## 十二、预览模式

### 12.1 行为

当请求参数 `preview = true` 时：

- 算法完整执行（所有计算、匹配、评分、置换）
- **跳过数据库事务**——不删除、不插入
- 返回结果包含 `preview: true`
- **不创建审计日志**
- 附带 `classTextbookMap`，供批量排课跨课程累计教材

### 12.2 统计信息

预览模式下结果包含 `statistics` 字段：

- `teacherWorkload`：每位教师的总课时、新增课时、容量、负载率、班级数
- `collegeMatchRate` / `textbookMatchRate` / `levelMatchRate`：匹配率
- `textbookCohesionRate`：教材内聚度（每位教师 `1 - (教材数 - 1) / 班级数`，clamp [0,1]，取平均）
- `avgTextbookPerTeacher`：教师平均教材数
- `scatteredTeacherCount`：教材数 ≥ `SCATTERED_THRESHOLD`（3）的教师数
- `involvedTeacherCount`：涉及的教师数

### 12.3 内聚度计算公式

每位教师的内聚度：

```
cohesion = max(0, 1 - (教材数 - 1) / 班级数)
```

- 教材数 = 1 或 班级数 = 0 → cohesion = 1（最内聚）
- 教材数 = 班级数 → cohesion = 0（最分散）

整体 `textbookCohesionRate` = 所有教师 cohesion 平均值 × 100。

---

## 十三、诊断机制

### 13.1 诊断函数（`diagnoseFailure`）

对每个未分配的班级，按顺序检查并返回首个匹配的原因：

| 诊断原因                                    | 触发条件                                                  |
| ------------------------------------------- | --------------------------------------------------------- |
| `没有可教此课程的教师`                      | 该课程无关联教师                                          |
| `所有候选教师课时容量已满`                  | 所有教师的 `assignedHours + cls.weeklyHours > cap`        |
| `所有候选教师总周课时已达上限`              | 所有教师触及 `defaultWeeklyHours` 总周课时上限            |
| `所有候选教师教材上限已满`                  | 所有教师已达 `MAX_TEXTBOOKS_PER_TEACHER` 且无法接纳新教材 |
| `有资格的教师课时容量已满`                  | 通过意向筛选的教师，其容量全部已满                        |
| `无匹配的教师（学院/层次偏好筛选后无候选）` | 上述均不满足时的兜底诊断                                  |

诊断同时返回 `details`，包含前 5 位教师的具体数据（姓名、已排课时、上限等）。

### 13.2 其他未分配原因

| 原因                               | 触发场景                                              |
| ---------------------------------- | ----------------------------------------------------- |
| `课时配置异常（周课时为0或负数）`  | `weeklyHours` 为 0 或负数，前置处理阶段直接归入未分配 |
| `并发排课导致教师容量已满，已跳过` | 事务内二次校验超载，降级跳过                          |

### 13.3 提前退出消息

| 消息                                            | 条件                              |
| ----------------------------------------------- | --------------------------------- |
| `该课程没有可用教师`                            | `getTeachersForCourse` 返回空数组 |
| `当前学期没有开设该课程的班级`                  | `getClassesWithCourse` 返回空数组 |
| `学期 {semesterStr} 批量排课进行中，请稍后再试` | 单课程排课遇到 `batchLocks`       |
| `该课程正在排课中，请稍后重试`                  | 单课程排课遇到 `arrangeLocks`     |

---

## 十四、结果结构

### 14.1 单课程排课结果（`buildResult`）

```javascript
{
  assigned: [...],           // 排课记录数组
  unassigned: [{             // 未分配班级数组
    classId, className, weeklyHours, reason, details
  }],
  totalClasses,              // 需排课的班级总数（不含手动）
  manualCount,               // 已有手动排课的班级数
  autoCount,                 // 本次自动排课的班级数
  unassignedCount,           // 未分配班级数
  preview,                   // 是否为预览模式
  warnings,                  // 容量警告数组
  statistics?,               // 预览模式下的统计信息
  classTextbookMap?,         // 预览模式下的班级教材映射
  message?                   // 错误/提前退出消息
}
```

### 14.2 排课记录结构

```javascript
{
  teacher_id: Number, teacher_name: String,
  class_id: Number, class_name: String,
  course_id: Number, semester: String,
  weekly_hours: Number, is_auto: true
}
```

### 14.3 批量排课结果

```javascript
{
  semester, mode, preview,
  courseResults: [...],
  summary: {
    totalCourses, successCount, errorCount,
    totalAssigned, totalUnassigned, totalWarnings,
    timeoutReached, skippedCourses?  // number，超时跳过的课程数量
  }
}
```

---

## 十五、排课流程图

```
┌─────────────────────────────────────────────────────────────┐
│                     自动排课开始                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  加载班级和教师候选池    │
        │  排除手动排课的班级      │
        │  追踪手动排课教材/学院   │
        │  过滤无效课时班级        │
        │  按教材分组排序          │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   容量可行性预检        │
        │  (需求 > 容量则警告)    │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   构建教师约束           │
        │  effectiveTotal/        │
        │  standardCap/fullCap/   │
        │  teacherHourCap         │
        └────────────┬───────────┘
                     │
    ┌────────────────┼────────────────────┐
    │                │                    │
    ▼                ▼                    ▼
┌────────┐    ┌────────────┐    ┌──────────────┐
│ 阶段 1  │    │  阶段 2     │    │  阶段 3       │
│ 有意向   │───▶│  无意向     │───▶│  同教材追加   │
│ 教师首选 │    │  教师首选   │    │  (不增教材)   │
└────────┘    └────────────┘    └──────┬───────┘
                                       │
                                       ▼
                              ┌────────────┐
                              │  阶段 4     │
                              │  第二本教材  │
                              └──────┬─────┘
                                     │
                                     ▼
                              ┌────────────┐
                              │  阶段 5     │
                              │  兜底分配   │
                              │ (assignRound)│
                              └──────┬─────┘
                                     │
                                     ▼
                              ┌────────────┐
                              │  置换回溯   │
                              │  提升分配率 │
                              └──────┬─────┘
                                     │
                                     ▼
                    ┌───────────────────────────┐
                    │    诊断未分配班级原因       │
                    │    生成排课结果             │
                    └──────────────┬────────────┘
                                   │
                          ┌────────┴────────┐
                          │                 │
                          ▼                 ▼
                   ┌────────────┐   ┌────────────┐
                   │ 预览模式    │   │ 正式模式    │
                   │ (不写入)    │   │ (事务写入)  │
                   │ + 统计信息  │   │ + 容量二次校验│
                   └────────────┘   └────────────┘
```

---

## 十六、配置参数（`constants/index.js`）

### 16.1 课时与模式

| 常量                              |            值             | 说明         |
| --------------------------------- | :-----------------------: | ------------ |
| `DEFAULT_HOUR_SETTINGS.full_time` | `{standard: 16, max: 20}` | 专职默认课时 |
| `DEFAULT_HOUR_SETTINGS.part_time` | `{standard: 12, max: 16}` | 兼职默认课时 |
| `DEFAULT_HOUR_SETTINGS.external`  | `{standard: 12, max: 16}` | 外聘默认课时 |
| `ARRANGE_MODE.STANDARD`           |       `'standard'`        | 标准模式     |
| `ARRANGE_MODE.FULL`               |         `'full'`          | 全量模式     |

### 16.2 工作量平衡（`WORKLOAD_BALANCE`）

| 常量                  | 值  | 说明                               |
| --------------------- | :-: | ---------------------------------- |
| `SCORE_THRESHOLD`     |  1  | 分数差异阈值，超过则按分数排序     |
| `LOAD_RATE_THRESHOLD` | 0.2 | 负载率差异阈值，超过则按负载率排序 |

### 16.3 教材内聚优化（`TEXTBOOK_COHESION`）

```javascript
export const TEXTBOOK_COHESION = {
  ENABLED: true, // 总开关
  COLLEGE_WEIGHT: 5, // 学院匹配权重
  LEVEL_WEIGHT: 5, // 层次匹配权重
  ASSIGNED_WEIGHT: 10, // 本轮已用教材权重
  INHERENT_WEIGHT: 4, // 固有教材权重
  PENALTY_PER_NEW: 10, // 新增教材每本扣分
  ZERO_TEXTBOOK_BONUS: 30, // 0本教师加分
  TEXTBOOK_COUNT_PENALTY_1_NEW: 200, // 未使用：代码用硬编码 -10000
  TEXTBOOK_COUNT_BONUS_1_SAME: 8, // 未使用：代码用硬编码 +10
  TEXTBOOK_COUNT_PENALTY_2: 20, // 不可达：MAX_TEXTBOOKS_PER_TEACHER=2
  TEXTBOOK_COUNT_PENALTY_3PLUS: 150, // 不可达：同上
  MAX_TEXTBOOKS_PER_TEACHER: 2, // 硬上限
  COHESION_PHASE_ENABLED: true, // 未使用：phase2.5 已废弃
  PHASE0_ENABLED: false, // 未使用：旧 Phase 0 已关闭
  FALLBACK_EMPTY: true, // 无排课记录教师教材为空集合
  SCATTERED_THRESHOLD: 3, // 教材数 >= 此值视为"分散"
};
```

### 16.4 配置与实际生效情况

| 配置项                         | 实际值 | 是否生效 | 说明                           |
| ------------------------------ | :----: | :------: | ------------------------------ |
| `ENABLED`                      |  true  |    ✅    | 总开关                         |
| `COLLEGE_WEIGHT`               |   5    |    ✅    | calcMatchScore 学院匹配        |
| `LEVEL_WEIGHT`                 |   5    |    ✅    | calcMatchScore 层次匹配        |
| `ASSIGNED_WEIGHT`              |   10   |    ✅    | calcMatchScore 本轮已用教材    |
| `INHERENT_WEIGHT`              |   4    |    ✅    | calcMatchScore 固有教材        |
| `PENALTY_PER_NEW`              |   10   |    ✅    | calcMatchScore 新增教材惩罚    |
| `ZERO_TEXTBOOK_BONUS`          |   30   |    ✅    | calcMatchScore 0本教师加分     |
| `TEXTBOOK_COUNT_PENALTY_1_NEW` |  200   |    ❌    | calcMatchScore 用硬编码 -10000 |
| `TEXTBOOK_COUNT_BONUS_1_SAME`  |   8    |    ❌    | calcMatchScore 用硬编码 +10    |
| `TEXTBOOK_COUNT_PENALTY_2`     |   20   |    ❌    | maxTb=2 时不可达               |
| `TEXTBOOK_COUNT_PENALTY_3PLUS` |  150   |    ❌    | maxTb=2 时不可达               |
| `MAX_TEXTBOOKS_PER_TEACHER`    |   2    |    ✅    | 多处硬上限校验                 |
| `COHESION_PHASE_ENABLED`       |  true  |    ❌    | phase2.5 已废弃                |
| `PHASE0_ENABLED`               | false  |    ❌    | 旧 Phase 0 已关闭              |
| `FALLBACK_EMPTY`               |  true  |    ✅    | 兜底教材推导                   |
| `SCATTERED_THRESHOLD`          |   3    |    ✅    | 内聚度统计                     |

> 注：`TEXTBOOK_COUNT_PENALTY_1_NEW`、`TEXTBOOK_COUNT_BONUS_1_SAME` 等配置项虽在 constants 中定义，但 `calcMatchScore` 实际使用硬编码值。调整这些配置项不会影响实际评分。

### 16.5 批量排课

| 常量               |            值             | 说明             |
| ------------------ | :-----------------------: | ---------------- |
| `BATCH_TIMEOUT_MS` | `5 * 60 * 1000`（5 分钟） | 批量排课超时上限 |

---

## 十七、API 接口

| 方法   | 路径                  | 说明             | 权限     |
| ------ | --------------------- | ---------------- | -------- |
| GET    | `/classes`            | 获取课程班级列表 | 所有用户 |
| GET    | `/teachers`           | 获取课程教师列表 | 所有用户 |
| GET    | `/statistics`         | 学期排课统计     | 所有用户 |
| GET    | `/hour-settings`      | 获取课时设置     | 所有用户 |
| POST   | `/assign`             | 手动排课         | admin+   |
| POST   | `/auto-arrange`       | 单课程自动排课   | admin+   |
| POST   | `/batch-auto-arrange` | 批量自动排课     | admin+   |
| POST   | `/reset`              | 重置自动排课     | admin+   |
| PUT    | `/hour-settings`      | 保存课时设置     | admin+   |
| DELETE | `/assignments/:id`    | 删除排课记录     | admin+   |

---

## 十八、已知限制

### 18.1 贪心算法无回溯

一旦教师被分配给某班级，不会被撤回以寻求全局更优解（置换回溯仅单轮，不递归）。结果是局部最优，非全局最优。

### 18.2 跨课程公平性缺失

每门课程独立排课。在批量排课中，先处理的课程可能占用大量教师容量，导致后续课程的教师选择受限。批量排课通过"供需比降序"排序缓解此问题，但无法完全消除。

### 18.3 教材数量分级奖惩部分未启用

`TEXTBOOK_COUNT_PENALTY_2` 与 `TEXTBOOK_COUNT_PENALTY_3PLUS` 仅在 `MAX_TEXTBOOKS_PER_TEACHER ≥ 3` 时生效。当前默认值为 2，这两个分支不可达。

### 18.4 `defaultWeeklyHours` 语义

字段名"默认周课时"具有误导性，实际作用是**教师总周课时上限**（跨所有课程，含手动排课与其他课程）。UI 中已重命名为"自定义课时"。

### 18.5 并发锁为进程级别

`arrangeLocks` 与 `batchLocks` 均为进程内存级别，仅适用于单进程部署。多实例部署需改用分布式锁。

### 18.6 批量排课无教材分组预处理

`batch.js` 仅按课程供需比排序，不做教材分组。教材分组完全由 `autoArrange` 内部完成。

---

## 十九、测试验证

### 19.1 验证场景

#### 场景1：有指定意向的教师

- **前提**：教师A 指定意向学院=职教，意向层次=本科；班级1-5 职教学院本科教材X；班级6-10 普教学院本科教材X
- **预期**：教师A 只分配到班级1-5，不会分配到班级6-10

#### 场景2：无指定意向的教师

- **前提**：教师B 无指定意向；班级1-5 教材X；班级6-10 教材Y
- **预期**：教师B 先拿完教材X的班级（1-5），如果还有容量再拿教材Y的班级（6-10）

#### 场景3：教材内聚

- **前提**：教师C 已持有教材X；班级1-5 教材X；班级6-10 教材Y
- **预期**：阶段3中，教师C 优先追加教材X的班级（1-5），只有教材X分配完后才在阶段4拿教材Y

#### 场景4：学院内聚

- **前提**：教师D 已分配职教学院班级；班级1-3 职教学院教材X；班级4-6 普教学院教材X
- **预期**：教师D 优先拿职教学院的班级（1-3），只有在职教学院班级分配完后才拿普教学院的班级

### 19.2 验证步骤

1. 启动开发环境
2. 进入"教学安排"页面
3. 选择课程，使用"标准模式"或"全量模式"排课
4. 检查排课结果：
   - 有指定意向的教师是否严格符合意向
   - 教师的教材数是否尽量保持在 1-2 本
   - 同教材的班级是否尽量分配给同一教师
   - 同学院的班级是否尽量分配给同一教师

### 19.3 日志查看

排课过程中会输出详细日志：

```
[新分配算法v2] 共 3 个教材组，开始分配...
  教材组 1,2: 10 个班级
  教材组 3: 8 个班级
  教材组 __no_textbook__: 5 个班级
[阶段1] 有指定意向的教师拿第一本教材
  [阶段1] 教材组 1,2: 剩余 2 个班级
[阶段2] 无指定意向的教师拿第一本教材
[阶段3] 所有教师追加同教材班级
[阶段4] 所有教师拿第二本教材
[新分配算法v2] 完成，总分配 23，未分配 0
```

---

## 二十、常见问题

### Q1：为什么有指定意向的教师没有被分配到任何班级？

**可能原因**：该教师的意向学院/层次没有对应的班级；课时容量已满；不能教此课程的教材。

**解决方法**：检查教师的意向设置、对应学院/层次的班级、课时容量。

### Q2：为什么教师拿到了超过 2 本教材？

**可能原因**：`MAX_TEXTBOOKS_PER_TEACHER` 设置为 0（不限制）；兜底阶段（阶段5）放宽了约束。

**解决方法**：确认 `MAX_TEXTBOOKS_PER_TEACHER` 设置为 2；检查日志中兜底阶段的分配记录。

### Q3：为什么有些班级没有被分配？

**可能原因**：没有可教此课程的教师；所有教师的课时容量已满；所有教师的意向/教材都不匹配该班级。

**解决方法**：检查未分配班级的诊断原因；增加教师数量或提高课时容量；调整教师意向设置。

### Q4：手动排课的班级会影响自动排课吗？

手动排课的班级**不会**被自动排课覆盖。但手动排课的教材和课时**会**计入教师状态，避免教师因手动排课而拿到过多教材或超负荷。

---

## 二十一、性能优化建议

### 21.1 大数据量场景

当班级数量超过 100 时，建议：

1. **分批排课**：按学院或层次分批排课，减少单次处理的班级数量
2. **预览模式**：先用预览模式查看排课结果，确认无误后再正式排课
3. **单课程排课**：对于重要课程，单独排课而非批量排课

### 21.2 日志优化

生产环境中，建议降低日志级别：

```javascript
// 开发环境：保留所有日志
logger.info("[阶段1] 有指定意向的教师拿第一本教材");

// 生产环境：只保留关键日志
logger.debug("[阶段1] 有指定意向的教师拿第一本教材");
```

---

## 二十二、禁忌搜索优化层（v2.21.0 新增）

### 22.1 概述

v2.21.0 新增了可选的禁忌搜索优化层，作为五阶段贪心算法的后续优化。贪心算法快速生成初始解，禁忌搜索在此基础上通过邻域搜索迭代优化，提升排课质量。

默认关闭，可通过系统设置页面动态启用（`system_settings` 表 key=`tabu_search_enabled`），也可通过常量 `TABU_SEARCH.ENABLED` 静态开启。

### 22.2 算法流程

```
五阶段贪心（构造初始解）
       ↓
置换回溯 trySwapUnassigned（尝试补救未分配班级）
       ↓
禁忌搜索 tabuOptimize（迭代优化，可选）
       ↓
输出最终结果
```

### 22.3 邻域移动算子

| 移动类型 | 操作                       | 说明                             |
| -------- | -------------------------- | -------------------------------- |
| Insert   | 将未分配班级分配给某教师   | 减少未分配惩罚                   |
| Shift    | 将某教师的班级移给另一教师 | 释放源教师容量，改善目标教师匹配 |
| Swap     | 两个教师交换各自的一个班级 | 双向改善，需检查双方约束         |

每次移动后检查硬约束（容量上限、教材上限 `MAX_TEXTBOOKS_PER_TEACHER`、学院/层次意向），不可行的移动直接跳过。

### 22.4 核心机制

- **禁忌表**：记录最近 N 轮被移动的 `(classId, teacherId)` 对，防止局部震荡。默认 tenure=10
- **Aspiration Criterion**：被禁忌的移动如果能产生优于历史最优的解，则忽略禁忌
- **教材引用计数**：`refCountMap` 跟踪教材被引用次数，Swap 移动正确维护引用计数
- **学院集合维护**：Swap 评估时保存/恢复学院集合，防止累积污染
- **教材 writeback 增量保护**：搜索结束后仅写回增量变化，不替换整个 `assignedTextbookIds`

### 22.5 配置参数

| 参数                       | 默认值  | 说明                         |
| -------------------------- | ------- | ---------------------------- |
| `ENABLED`                  | `false` | 静态开关，优先级高于系统设置 |
| `MAX_ITERATIONS`           | `500`   | 最大迭代次数                 |
| `TABU_TENURE`              | `10`    | 禁忌期限（轮数）             |
| `NO_IMPROVEMENT_LIMIT`     | `80`    | 连续无改进轮数上限           |
| `SINGLE_COURSE_TIMEOUT_MS` | `15000` | 单课程优化超时（毫秒）       |
| `UNASSIGNED_PENALTY`       | `500`   | 未分配班级惩罚分             |

配置位于 `server/src/constants/index.js` 的 `TABU_SEARCH` 对象。

### 22.6 错误处理

禁忌搜索异常不会影响排课结果。所有禁忌搜索逻辑被 `try/catch` 包裹，异常时自动跳过，返回贪心初始解。日志中会记录异常信息。

### 22.7 前端管理

在系统设置页面新增了"排课禁忌搜索优化"开关（`SchedulingConfig.vue` 组件），使用 `el-switch` 控件，独立保存，支持脏状态跟踪。

---

## 二十三、未来优化方向

### 23.1 更高级的全局优化

v2.21.0 已实现禁忌搜索作为局部搜索优化层。未来可以考虑：

1. **模拟退火**：以一定概率接受劣解，避免陷入局部最优
2. **遗传算法**：适合多目标优化，但实现复杂、调参多

### 23.2 跨课程均衡

当前算法是单课程独立排课。未来可以考虑：

1. **教师工作量均衡**：跨课程考虑教师的总工作量
2. **教材分布均衡**：避免某教师在同一学期教过多不同教材的课程

### 23.3 用户偏好学习

通过学习历史排课数据，自动调整：

1. **教师偏好**：自动学习教师的实际授课偏好
2. **教材亲和度**：根据教学效果调整教材匹配权重

---

## 二十四、关键代码位置索引

| 功能                                   | 文件                         | 行号(约)     |
| -------------------------------------- | ---------------------------- | ------------ |
| 教材匹配判断 `isTextbookMatch`         | `arrange/queries.js`         | 12-21        |
| 兜底教材推导                           | `arrange/queries.js`         | 261-408      |
| 兜底赋值（FALLBACK_EMPTY）             | `arrange/queries.js`         | 401-408      |
| 固有教材快照固化                       | `arrange/auto-arrange.js`    | ~199         |
| 评分函数 `calcMatchScore`              | `arrange/auto-arrange.js`    | ~35-128      |
| 资格校验 `isTeacherEligible`           | `arrange/auto-arrange.js`    | ~130-157     |
| 构建教师约束 `buildTeacherConstraints` | `arrange/auto-arrange.js`    | ~159         |
| 内聚度统计 `calcAllMatchRates`         | `arrange/auto-arrange.js`    | ~326-381     |
| 置换回溯 `trySwapUnassigned`           | `arrange/auto-arrange.js`    | ~458-503     |
| 置换单次 `trySwapOne`                  | `arrange/auto-arrange.js`    | ~510-652     |
| 候选教师排序 `selectBestTeacher`       | `arrange/auto-arrange.js`    | ~306         |
| `assignRound`                          | `arrange/auto-arrange.js`    | ~834-905     |
| 手动排课教材追踪                       | `arrange/auto-arrange.js`    | ~940-959     |
| `recordAssignment`                     | `arrange/auto-arrange.js`    | ~982-1001    |
| `takeClassesForTeacher`                | `arrange/auto-arrange.js`    | ~1004-1044   |
| 教材分组预处理                         | `arrange/auto-arrange.js`    | ~1046-1074   |
| v2 阶段 1（有意向教师拿第一本）        | `arrange/auto-arrange.js`    | ~1077-1123   |
| v2 阶段 2（无意向教师拿第一本）        | `arrange/auto-arrange.js`    | ~1127-1166   |
| v2 阶段 3（追加同教材班级）            | `arrange/auto-arrange.js`    | ~1170-1201   |
| v2 阶段 4（拿第二本教材）              | `arrange/auto-arrange.js`    | ~1204-1250   |
| v2 阶段 5（兜底 assignRound）          | `arrange/auto-arrange.js`    | ~1254-1265   |
| 排课主入口 `autoArrange`               | `arrange/auto-arrange.js`    | ~664         |
| 事务内二次校验                         | `arrange/auto-arrange.js`    | ~1356-1404   |
| **禁忌搜索主入口 `tabuOptimize`**      | **`arrange/tabu-search.js`** | **~1-30**    |
| **Insert 邻域移动**                    | **`arrange/tabu-search.js`** | **~200-280** |
| **Shift 邻域移动**                     | **`arrange/tabu-search.js`** | **~280-380** |
| **Swap 邻域移动**                      | **`arrange/tabu-search.js`** | **~380-520** |
| **教材引用计数 `refCountMap`**         | **`arrange/tabu-search.js`** | **~80-120**  |
| **Aspiration Criterion**               | **`arrange/tabu-search.js`** | **各邻域内** |
| **TABU_SEARCH 配置**                   | **`constants/index.js`**     | **~115-125** |
| 批量排课 `batchAutoArrange`            | `arrange/batch.js`           | 14-182       |
| 配置 `TEXTBOOK_COHESION`               | `constants/index.js`         | 92-114       |

---

_文档版本：v1.3.0 | 最后更新：2026-07-23_
