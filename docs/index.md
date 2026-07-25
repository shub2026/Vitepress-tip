---
layout: home

hero:
  name: 'KEC'
  text: '课程管理平台'
  tagline: '面向职业院校的轻量级教务编排系统 — 基础数据 · 培养方案 · 自动排课 · 查询报表，一站式解决'
  actions:
    - theme: brand
      text: 平台说明
      link: /kec/kec-manager
    - theme: alt
      text: 部署指南
      link: /kec/deployment
    - theme: alt
      text: Gitee
      link: https://gitee.com/shub77/kec-manager
    - theme: alt
      text: KEC平台
      link: https://kec.sntip.cn

features:
  - title: 📋 基础数据管理
    details: 学院、专业、培养层次、课程、教材一站式维护，支持 Excel 批量导入，数据骨架一次搭建长期复用
    link: /kec/kec-manager
  - title: 🎓 智能培养方案
    details: 课程矩阵视图直观展示学期开课分布，自动匹配专业与层次，学期课时教材一目了然
    link: /kec/kec-manager
  - title: 📊 查询报表导出
    details: 一键查看当前及历史学期开课情况，按学院/专业/层次筛选，直接导出 Excel 统计报表
    link: /kec/kec-manager
  - title: 🔐 三级权限体系
    details: 超级管理员 / 管理员 / 查看者角色分级控制，JWT 认证 + 操作审计日志，数据安全可追溯
    link: /kec/kec-manager
  - title: 🏫 学期自动推算
    details: 根据入学年份与学制自动计算年级和学期序号，班级在校/毕业状态实时判定，无需手动维护
    link: /kec/semester-calculation
  - title: ⚡ 自动教学排课
    details: 五阶段匹配+置换回溯算法，支持学院偏好、培养层次偏好、教材匹配和容量约束，一键智能排课。
    link: /kec/scheduling_algorithm
---
