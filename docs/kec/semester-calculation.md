# 学期计算逻辑说明

## 核心概念

### 全局学期配置

- **存储格式**: `YYYY-YYYY-N` (起始学年-结束学年-学期序号)
- **示例**: `2025-2026-2` 表示 2025-2026学年的第2学期
- **语义**:
  - 学期序号1 = 秋季学期（9月-次年1月）
  - 学期序号2 = 春季学期（3月-7月）

### 班级相对学期

每个班级根据入学年份不同，在全局同一时间点处于不同的相对学期。

**计算公式**:

```javascript
// 1. 计算年级
grade = startYear - enrollmentYear + 1;

// 2. 计算该班级的相对学期序号
currentSemesterNum = (grade - 1) * 2 + semesterIndex;
```

## 实际计算示例

**全局配置**: `2025-2026-2` (2026年春季)

- `startYear = 2025`
- `semesterIndex = 2`

| 入学年份  | 年级计算        | 学期计算        | 结果         | 说明                        |
| --------- | --------------- | --------------- | ------------ | --------------------------- |
| 2025年9月 | 2025-2025+1 = 1 | (1-1)×2 + 2 = 2 | 1年级第2学期 | 2025秋→2026春               |
| 2024年9月 | 2025-2024+1 = 2 | (2-1)×2 + 2 = 4 | 2年级第4学期 | 2024秋→2025春→2025秋→2026春 |
| 2023年9月 | 2025-2023+1 = 3 | (3-1)×2 + 2 = 6 | 3年级第6学期 | 已上6个学期                 |

## 时间轴示意

```
2023级: [1]2023秋 [2]2024春 [3]2024秋 [4]2025春 [5]2025秋 [6]2026春 ← 当前
2024级:             [1]2024秋 [2]2025春 [3]2025秋 [4]2026春 ← 当前
2025级:                       [1]2025秋 [2]2026春 ← 当前
                                 ↑
                          全局配置指向这里
                        2025-2026学年 第2学期
```

## 代码位置

### 后端计算

- **文件**: `server/src/services/semester.service.js`（第 86-95 行）
- **函数**: `calcClassSemester(cls, semesterInfo)`
- **用途**: 开课查询、教材查询、数据导出
- **说明**: 所有学期逻辑（`calcClassSemester` / `parseSemester` / `formatSemesterLabel`）的真正实现均收敛于此文件；`server/src/routes/query.routes.js` 中无任何对 `calcClassSemester` 或 `parseSemester` 的引用

### 前端计算

- **文件**: `client/src/views/class/components/ClassTable.vue`
- **函数**: `calcGrade(row, semesterInfo)`
- **用途**: 班级列表显示年级
- **逻辑**:
  ```javascript
  // 优先使用后端提供的学期信息
  const startYear = semesterInfo?.startYear || estimateStartYear();
  const grade = startYear - enrollmentYear + 1;
  return grade >= 1 ? grade : null; // 始终显示年级，不限制毕业状态
  ```

### 格式化显示

- **后端**: `server/src/services/semester.service.js` - `formatSemesterLabel()`（第 68-72 行）
- **前端**: `client/src/stores/settings.js` - `formatSemesterLabel()`
- **输出**: `2026年春季(第2学期)`
- **说明**: `server/src/services/settings.service.js` 仅 re-export，真正实现位于 `semester.service.js`

## 学期格式校验规则

后端 `parseSemester` / `parseSemesterString` 函数对学期字符串执行严格校验，不合法格式返回 `null`。

```javascript
// server/src/services/semester.service.js — parseSemester（真正实现，第 28-59 行）
// server/src/services/arrange/queries.js — 仅 re-export parseSemester
// server/src/services/settings.service.js — 仅保留 @deprecated 的 parseSemesterString 兼容包装
```

**校验规则**:

| 规则                        | 合法示例                     | 非法示例            | 说明                        |
| --------------------------- | ---------------------------- | ------------------- | --------------------------- |
| 格式 `YYYY-YYYY-N`          | `2025-2026-1`                | `25-26-1`, `2025-2` | 必须为完整的四位数年份      |
| 学期序号 ∈ {1, 2}           | `2025-2026-1`, `2025-2026-2` | `2025-2026-3`       | 仅支持秋季(1)和春季(2)      |
| **endYear = startYear + 1** | `2025-2026-2` ✅             | `2025-2027-1` ✗     | **H2 修复：强制年份连续性** |
| endYear > startYear         | `2025-2026-1` ✅             | `2026-2025-1` ✗     | 由上一条规则自然约束        |

> **H2 修复说明**：修复前 `parseSemester` 不校验年份逻辑关系，`2026-2025-1` 等非法格式可被解析。修复后与 `parseSemesterString` 保持一致，强制 `endYear === startYear + 1`。所有调用方已处理 `null` 返回值。

## 有效性校验

### 年级显示规则

```javascript
// 前端年级显示（ClassTable.vue）
const grade = startYear - enrollmentYear + 1;
const durationYears = row.durationYears || row.duration_years || 99;

// 年级必须在有效范围内才显示：
// 1. 年级 >= 1（已入学）
// 2. 年级 <= 学制年限（未毕业）
if (grade >= 1 && grade <= durationYears) {
  return grade;
}

// 超出学制范围（已毕业）或未入学，显示为空
return null;
```

**重要变更历史**:

**v1.3.7 错误理解**（已回退）:

- ❌ 错误逻辑：`grade >= 1` 即可，毕业班级也显示年级数字
- ❌ 问题：2023年入学3年制在2027-2028学年显示"5年级"（错误）

**v1.3.8 正确逻辑**（当前版本）:

- ✅ 正确逻辑：`grade >= 1 && grade <= durationYears`
- ✅ 设计理念：年级数字表示"当前在读第几年"，已毕业班级不再属于任何年级
- ✅ 毕业状态由 `status` 字段（graduated）单独标识

**示例** (系统设置 2027-2028-1, startYear=2027):

| 入学年份 | 年级计算      | 学制 | 结果  | 状态   | 年级显示     | 说明      |
| -------- | ------------- | ---- | ----- | ------ | ------------ | --------- |
| 2027年   | 2027-2027+1=1 | 3年  | 1年级 | 在校   | **1年级** ✅ | 新生      |
| 2026年   | 2027-2026+1=2 | 3年  | 2年级 | 在校   | **2年级** ✅ | 正常      |
| 2025年   | 2027-2025+1=3 | 3年  | 3年级 | 在校   | **3年级** ✅ | 最后一年  |
| 2024年   | 2027-2024+1=4 | 3年  | 4年级 | 已毕业 | **空** ✅    | 已毕业1年 |
| 2023年   | 2027-2023+1=5 | 3年  | 5年级 | 已毕业 | **空** ✅    | 已毕业2年 |
| 2028年   | 2027-2028+1=0 | 3年  | 0年级 | 未入学 | **空** ✅    | 未入学    |

### 班级状态判断规则

```javascript
// 后端状态计算（class.controller.js）
const grade = startYear - enrollmentYear + 1;
const status = grade <= durationYears ? "active" : "graduated";
```

**状态判断逻辑**:

- **在校 (active)**: `grade <= durationYears`
- **已毕业 (graduated)**: `grade > durationYears`
- **离校 (left_school)**: 手动标记，优先级最高

## 班级状态计算规则

### 核心逻辑

班级状态分为 **在校(active)** 和 **已毕业(graduated)** 两种，基于入学年份、学制和当前学期自动计算。

**计算公式**:

```javascript
// 1. 计算当前年级
grade = startYear - enrollmentYear + 1;

// 2. 判断状态
status = grade <= durationYears ? "active" : "graduated";
```

**关键规则**:

- 学生于入学年份的9月入学（秋季学期）
- 每个学年包含2个学期：秋季(学期序号1)、春季(学期序号2)
- 在读学期总数 = 学制年数 × 2
- **在校条件**: 当前年级 <= 学制年数
- **已毕业条件**: 当前年级 > 学制年数

### 实际计算示例

**全局配置**: `2025-2026-2` (2025-2026学年第2学期，即2026年春季)

- `startYear = 2025`
- `semesterIndex = 2`

| 入学年份  | 年级计算    | 年级结果 | 学制 | 状态判断 | 结果       | 说明                |
| --------- | ----------- | -------- | ---- | -------- | ---------- | ------------------- |
| 2025年9月 | 2025-2025+1 | 1年级    | 3年  | 1 <= 3   | 在校       | 第2学期             |
| 2024年9月 | 2025-2024+1 | 2年级    | 3年  | 2 <= 3   | 在校       | 第4学期             |
| 2023年9月 | 2025-2023+1 | 3年级    | 3年  | 3 <= 3   | **在校**   | 第6学期（最后学期） |
| 2022年9月 | 2025-2022+1 | 4年级    | 3年  | 4 > 3    | **已毕业** | 应处于第7学期       |

### 重要说明

**2023级案例分析** (3年制，当前为2025-2026学年第2学期):

- 当前年级: 3年级
- 当前学期: 第6学期 `(3-1)×2 + 2 = 6`
- 总学期数: `3 × 2 = 6` 学期
- 状态判断: `3 <= 3` → **在校** ✓

虽然2023级已经上到第6学期（最后一个学期），但**仍然是"在校"状态**，因为：

1. 他们还没有完成第6学期的学习
2. 只有到了下一学期（2026-2027学年第1学期，即第7学期）才会变为"已毕业"

这种设计确保了：

- 学生在整个最后一学年（包括两个学期）都保持"在校"状态
- 毕业后自动切换为"已毕业"状态，无需手动操作

### 代码实现位置

**后端计算**:

- 文件: `server/src/controllers/class.controller.js`
- 函数: `calculateClassStatus(enrollmentYear, durationYears, semesterInfo)`
- 用途: 创建/更新班级时自动计算状态，列表查询时动态计算

**导入计算**:

- 文件: `server/src/routes/import.routes.js`
- 用途: Excel批量导入班级时自动计算状态

## 培养方案课程匹配

通过计算出的 `currentSemesterNum` 筛选该学期应开设的课程：

```javascript
const planCourses = plan.planCourses.filter(
  (pc) =>
    pc.startSemester <= calc.currentSemesterNum &&
    pc.endSemester >= calc.currentSemesterNum,
);
```

**示例** (某课程设置为第3-4学期):

- 2025级(第2学期): 不匹配 ✗
- 2024级(第4学期): 匹配 ✓
- 2023级(第6学期): 不匹配 ✗

## 常见误区

### 误区1: "所有班级都是第2学期"

**错误理解**: 看到配置中的 `-2` 就认为所有班级都是第2学期

**正确理解**:

- `-2` 表示"学年的第2学期"（春季）
- 每个班级的**相对学期序号** = `(年级-1)×2 + 2`
- 不同年级的班级处于不同的相对学期

### 误区2: "学期序号应该从1连续递增"

**错误理解**: 希望学期序号是 1,2,3,4... 连续递增

**正确理解**:

- 学期序号是**相对概念**，表示"这是该班级的第几个学期"
- 1年级对应学期 1-2
- 2年级对应学期 3-4
- 3年级对应学期 5-6

## 修改记录

- **2026-06-28 (H2 修复)**:
  - 新增“学期格式校验规则”章节，文档化 `parseSemester` 年份连续性校验
  - `endYear !== startYear + 1` 时返回 null，与 `parseSemesterString` 行为统一

- **2026-06-15 (v1.3.8)**:
  - **回退 v1.3.7 的错误逻辑**，恢复年级显示的学制上限检查
  - 修正年级计算：已毕业班级（超出学制）年级显示为空
  - 2023年入学3年制在2027-2028学年应显示为空（而非5年级）
  - 年级显示条件：`grade >= 1 && grade <= durationYears`
  - 更新文档示例，使用系统设置 2027-2028-1 作为场景

- **2026-06-15 (v1.3.7)**:
  - ~~修正年级计算逻辑，使用后端提供的学期信息（startYear）而非当前年份~~
  - ~~移除年级显示的上限限制，毕业班级也显示年级数字~~（❌ 此逻辑错误，已在 v1.3.8 回退）
  - 修正文档中的代码位置引用（ClassTable.vue, class.controller.js）

- 2026-06-08: 优化学期显示格式为 "2026年春季(第2学期)"
- 2026-06-08: 添加计算逻辑注释和文档说明
