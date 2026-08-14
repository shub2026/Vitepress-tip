# 命名转换迁移方案（渐进式 A）

> 本文档记录项目中前后端命名不一致问题的根因分析、可选方案、推荐路径，以及第一阶段止血的执行情况。

## 背景

项目采用「后端 snake_case + 前端 camelCase + 中间件自动转换」模式，由 [server/src/middleware/naming.middleware.js](../server/src/middleware/naming.middleware.js) 实现。该模式在历史迭代中反复出现功能异常，根因是中间件存在固有缺陷。

## 当前机制与固有缺陷

| 缺陷                       | 表现                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. 转换边界模糊**        | `SKIP_KEYS`、嵌套分页 `data.data.list`、Prisma Decimal 实例等都有特殊处理，容易遗漏                                                                                                                                       |
| **2. 字段语义混淆**        | `current_semester` 在 `system_settings` 表里是 **key 名**（业务字符串），不是字段名，却被中间件转成 `currentSemester`。Dashboard 读 `settings.currentSemester`，SystemSettings 写 `form.current_semester`，两边命名不一致 |
| **3. 双向转换掩盖错误**    | 前端发 `current_semester` 会被中间件当作驼峰转成 `current_semester`（巧合正确），但发 `user_name` 会被转成 `user__name`（双下划线），错误被吞掉                                                                           |
| **4. 类型信息丢失**        | 转换是运行时遍历对象，无法在编码期发现字段名错误，IDE 也无法提示                                                                                                                                                          |
| **5. 例外越来越多**        | 已有 `SKIP_KEYS`、Decimal 跳过、嵌套分页特判，每加一个特例就多一个 bug 源                                                                                                                                                 |
| **6. query params 不转换** | `convertRequestNaming` 只处理 `req.body`，**不处理 `req.query`**。GET 请求的 query params 必须用后端期望的命名，且后端 query 读取命名本身不统一                                                                           |

## 三个可选方案

### 方案 A：彻底统一为 camelCase（推荐）

**做法**：后端代码也用 camelCase，Prisma schema 用 `@map` 注解映射数据库列名，移除命名转换中间件。

```prisma
model classes {
  id              String   @id @default(uuid())
  enrollment_year Int      @map("enrollment_year")
  student_count   Int      @map("student_count")
  @@map("classes")
}
```

```javascript
// 后端 controller 直接用 camelCase
const { enrollmentYear, studentCount } = req.body;
await prisma.classes.create({ data: { enrollmentYear, studentCount } });
```

- **优点**：单一命名约定，无转换歧义，IDE 提示正确，类型检查生效
- **缺点**：需要改 Prisma schema + 后端代码，工作量中等
- **适用**：长期项目、团队协作、追求可维护性

### 方案 B：移除中间件 + API 层显式映射（次推荐）

**做法**：移除自动转换中间件，在 `client/src/api/*.js` 每个接口显式声明字段映射。

```javascript
// api/user.js
export const createUser = (data) =>
  request.post("/users", {
    user_name: data.userName,
    real_name: data.realName,
    email: data.email,
    role: data.role,
  });

export const getUsers = async () => {
  const res = await request.get("/users");
  return res.data.map((u) => ({
    id: u.id,
    userName: u.user_name,
    realName: u.real_name,
  }));
};
```

- **优点**：转换显式可控，调试容易，每个接口的字段一目了然
- **缺点**：API 层代码量增加，每个接口要维护映射表
- **适用**：后端不能改、只想在前端收口的场景

### 方案 C：保留现状 + 加强约束（不推荐）

维持中间件，增加 ESLint 规则禁止前端用 snake_case、增加集成测试。

- **优点**：改动最小
- **缺点**：根本问题未解决，特例会继续累积，新成员踩坑概率高

## 推荐路径：渐进式 A

考虑到项目已有相当代码量，建议分阶段迁移到方案 A：

### 第一阶段（止血）— 已完成 ✅

**目标**：立即修复已发现的命名不一致点，建立 dev 环境检测机制，确立命名约定。

#### 1.1 后端：naming 中间件加 dev warning

[server/src/middleware/naming.middleware.js](../server/src/middleware/naming.middleware.js) 新增 `detectDoubleConversion`，dev 环境下检测请求 body 中已是 snake_case 的字段（会被中间件二次转换产生双下划线），打印 warning 帮助定位前后端命名不一致。

需重启 Node 服务生效。

#### 1.2 前端：请求 body 统一 camelCase（11 个文件）

| 文件                                             | 修改                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `views/settings/SystemSettings.vue`              | `current_semester`→`currentSemester`，`organization_name`→`organizationName`      |
| `views/settings/components/SemesterConfig.vue`   | v-model 绑定同步改为 camelCase                                                    |
| `views/plan/PlanList.vue`                        | `college_id/major_id/training_level_id`→camelCase                                 |
| `views/plan/PlanDetail.vue`                      | `course_id/start_semester/end_semester/weekly_hours/weeks_per_semester`→camelCase |
| `views/class/ClassList.vue`                      | 创建/批量更新接口字段→camelCase                                                   |
| `views/class/components/ClassTable.vue`          | 移除 `row.duration_years` 兼容回退                                                |
| `views/system/UserManagement.vue`                | `real_name`→`realName`，`is_active`→`isActive`                                    |
| `views/textbook/TextbookList.vue`                | `publish_date/is_active/sort_order`→camelCase，移除 `is_active` 兼容回退          |
| `components/CourseMatrix.vue`                    | `weekly_hours/textbook_id/is_required`→camelCase                                  |
| `views/teaching/components/HourSettingsCard.vue` | `full_time/part_time` key 改 camelCase，save body 字段同步                        |
| `api/plan.js`                                    | `sort_order`→`sortOrder`                                                          |

#### 1.3 命名约定（止血阶段确立）

- **前端代码**（组件、store、api）：一律 camelCase
- **请求 body**：前端 camelCase → 中间件转 snake_case → 后端
- **请求 query params**：不经中间件，前端需匹配后端读取的命名（待第二阶段后端统一后再前端统一）
- **审计日志的 `details` JSON 字段**：保留 snake_case（后端原始写入，不转换）

#### 1.4 关键发现：query params 不转换

排查中发现 `convertRequestNaming` 只处理 `req.body`，**不处理 `req.query`**。因此：

- ✓ camelCase：class（`buildClassFilter` 读 `majorId`）、plan（`collegeId`）、semester-export
- ✗ snake_case：teaching-arrange（`course_id`）、data-export（`course_id, training_level`）

**TeachingArrange.vue 和 HourSettingsCard.vue 的 query params 已恢复为 snake_case**，并加注释说明原因。这部分留给第二阶段统一后端 query 命名后再改。

### 第二阶段（query params 统一）— 已完成 ✅

**目标**：扩展中间件处理 query params，让前端彻底统一用 camelCase，无需区分 body/query。

#### 2.1 扩展 naming 中间件处理 req.query

[server/src/middleware/naming.middleware.js](../server/src/middleware/naming.middleware.js) 的 `convertRequestNaming` 新增 query params 处理：将前端发的 camelCase query key 转成 snake_case，供后端读取。

实现细节：Express 5 中 `req.query` 是 getter-only，不能整体赋值，需原地删除旧 key 再设置新 key。

#### 2.2 后端 controller：req.query 读取统一改为 snake_case

中间件现在会把前端 camelCase query 转成 snake_case，后端需统一读 snake_case。

| 文件                                               | 修改                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| `services/class-filter.service.js`                 | `majorId/collegeId/trainingLevelId/planId/enrollmentYear` → snake_case |
| `controllers/plan/plan.controller.js`              | `collegeId` → `college_id`                                             |
| `controllers/export/semester-export.controller.js` | `collegeId/majorId/trainingLevelId/enrollmentYear` → snake_case        |
| `controllers/audit.controller.js`                  | `pageSize` → `page_size`                                               |
| `controllers/class.controller.js`                  | `pageSize` → `page_size`                                               |
| `middleware/auth.middleware.js`                    | `downloadToken` → `download_token`                                     |

#### 2.3 前端：query params 统一改为 camelCase

中间件已处理 query 转换，前端可彻底统一用 camelCase。

| 文件                                             | 修改                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `views/teaching/TeachingArrange.vue`             | `course_id/training_level` → camelCase（loadData + export params） |
| `views/teaching/components/HourSettingsCard.vue` | `course_id` → `courseId`                                           |
| `views/teaching/TeachingStatistics.vue`          | `affiliated_college` → `affiliatedCollege`                         |

#### 2.4 命名约定（第二阶段确立）

- **前端代码**：一律 camelCase（body 和 query params 均如此）
- **后端代码**：读 `req.body` 和 `req.query` 均用 snake_case（中间件统一转换）
- **审计日志的 `details` JSON 字段**：保留 snake_case（后端原始写入，不转换）

#### 2.5 验证结果

- 前端 ESLint：0 errors（4 个预存 warnings）
- 后端语法检查：全部通过
- 后端改动需重启 Node 服务生效

#### 2.6 待办（Prisma schema 迁移）— 暂缓 ⏸️

> 说明：当前 `server/prisma/schema.prisma` 中已应用表级 `@@map` 映射（如 `@@map("teachers")`、`@@map("teacher_courses")` 等共 5 处），用于将 model 名映射到数据库表名。下文"暂缓"指的是**字段级 `@map` 映射**（用于将 camelCase 字段名映射到 snake_case 数据库列名），该部分尚未应用。

Prisma schema 字段级 `@map` 注解的工作量评估：

- **影响范围**：45 个文件，约 1501 处 snake_case 字段访问
- **关联复杂度**：16 个 model 互相关联，一次改动会级联影响所有 controller/service
- **风险等级**：极高（无自动化测试覆盖，无法在改动后验证正确性）

**决定**：暂缓第三阶段迁移（字段级 `@map`）。当前中间件转换机制已足够（body + query 均已处理），命名不一致问题已在第一/二阶段止血。第三阶段待测试覆盖完善后再启动。

**启动第三阶段的前置条件**：

1. 为后端核心模块（auth/user/class/plan/teaching-arrange）补齐集成测试
2. 按 model 依赖拓扑排序分批迁移：system_settings → users → colleges → majors → training_levels → courses → textbooks → classes → training_plans → plan_courses → plan_course_semesters → plan_textbooks → teachers → teacher_courses → teacher_scheduling_colleges → teacher_training_levels → teaching_assignments → audit_logs → token_blacklist
3. 每 batch 改完后运行测试 + 手动验证

### 第三阶段（最后）— 清理

1. 全部模块迁移完成后，移除 [server/src/middleware/naming.middleware.js](../server/src/middleware/naming.middleware.js) 和 [server/src/utils/naming.js](../server/src/utils/naming.js)
2. 删除 `server/src/app.js` 中的 `convertRequestNaming` / `convertResponseNaming` 注册

## 立即可做的防御措施

无论选哪个方案，建议立即在 `client/src/api/` 下为每个接口加 JSDoc 类型声明，明确字段名：

```javascript
/**
 * @typedef {Object} DashboardStats
 * @property {number} majors
 * @property {number} courses
 * @property {number} classes
 */

/**
 * 获取首页统计
 * @param {string} semester - 学期，如 '2025-2026-2'
 * @returns {Promise<{success: boolean, data: DashboardStats}>}
 */
export function getDashboardStats(semester) {
  return request.get("/dashboard/stats", { params: { semester } });
}
```

这样 IDE 能在编码期发现字段名拼写错误，比运行时转换失败更早暴露问题。

## 验证结果

- ESLint：第一阶段修改的 11 个文件 0 个新 error
- 前端改动 Vite HMR 自动生效
- 后端 naming 中间件改动需重启 Node 服务
