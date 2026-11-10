# 易居 GPT 原生运营接口：Codex 一次上线手册

目标：GPT / Work / TinyFish 留在 ChatGPT 云端。易居现有 Node.js 只增加 API、证据表和后台收件箱，**不部署独立 Agent 服务**。本 PR 尚未上线。参照 #107 和 #108。

## 功能、权限、约束

- GPT API：GET /api/agent/city-data/fields，GET /cities?q=张掖，GET /cities/951，POST /submissions，GET /submissions/{external_id}。从属于 /api/agent/city-data。
- 管理员证据箱：GET /api/admin/city-agent/evidence，JWT + 管理员权限。前端新增 GPT 证据收件箱。
- GPT 可无需人工自动检索城市、归档公开证据、幂等去重、读取审批状态、申请数据变更。
- 显式配置 YIJU_AGENT_AUTO_APPLY=true 后，少量低风险文字字段（slogan、location_intro、key_points、notes）可**根据后端确定性规则自动应用**。必须具备两处**不同政府机关域名**的 HTTPS 已读取证据，同一个 city_id、metric_key、metric_value，提供真实来源片段，文字不少于 18 字，读取时旧值必须一致，且没有同字段待审申请。每日全站自动生效条数受 YIJU_AGENT_AUTO_APPLY_DAILY_LIMIT 限制（默认10、最大100）；冲突、来源不足及超额自动转人工待审。
- 自动操作使用 reviewed_by=0 明确标识机器审核，source_verified_by 仍为 NULL（不冒充人工核验）。写库使用现有事务 + 原字段 CAS 保护，管理员可在原有后台回滚。
- GPT 永远不能直接访问批准、拒绝、回滚、评分、排行、城市身份、标签、真实居民评论写入或公开发布接口。数字成本字段可以提申请但不可自动生效。社区内容只存证据，不能直接申请字段修改。零评分不等于零机构，机构数不可写到 medical_facilities 评分字段。
- **自动核对的只是域名、来源阅读声明、数值一致、变更冲突和频次，不能替代全面的事实核验。** GPT 必须在调用前真实打开来源，不能把搜索摘要当作已读原文。所有实际来源、统计年份、行政层级和单位必须匹配。

## 生产交付步骤

1. 查看生产 SSH 实际目录、PM2 进程、Node 版本、数据库绝对路径、当前 Git SHA、工作树更改和代理配置；不要根据历史目录猜测。
2. 使用 SQLite 在线备份 API 或 sqlite3 .backup 备份生产库，确认备份 PRAGMA integrity_check 为 ok，并在独立副本执行恢复读取。保留原 PM2、nginx、版本配置及回滚窗口；不能覆盖未提交更改。
3. 部署前先运行 npm run test:city-data（包括 #107 + 新 bridge）。再在**隔离数据库**运行 initCityDataManagement、initAgentCityBridge，实测鉴权、幂等、来源分类、待审、自动应用、日配额和回滚。失败停止上线。
4. 默认配置 YIJU_AGENT_AUTO_APPLY=false，不要一上线就自动应用文字。上线后完成只读和证据归档验收，再根据用户的“分级尽量自动”的授权设置为 true，默认每日不超过 10 条低风险文字字段自动更新。
5. 在服务器用 openssl rand -hex 32 生成独立随机 API token；以 printf 与 sha256sum 计算十六进制 SHA-256，仅将摘要存为生产环境变量 YIJU_AGENT_API_KEY_SHA256。**原始 token 不要写进源码、GitHub、终端记录、CI 日志或聊天**，只放在私有 GPT Action / 连接器凭据配置中。移除摘要会让 Agent API 返回 503，便于紧急停机；改密钥时旧 token 失效。
6. 只发布 PR 合并后的确定 SHA，重启原 Node 服务，不部署新 Agent 容器。确认 /api/health 正常、/admin.html 出现城市数据管理和 GPT 证据收件箱、/api/auth/me 的未认证行为符合预期。
7. API 验收：无密钥 401（未配置返回503）；错误密钥401；正确密钥可 GET 字段及城市；相同 external_id、同一内容二次提交返回200 + replayed:true；同 ID 不同内容返回409；未读取正文不得提变更；禁止评分、标签和假评论写入；社区来源只能归档。
8. 在隔离库执行两个不同真实政府来源的自动文字变更试验、超额转人工、管理员回滚，并验证网站与微信小程序原有读取接口/榜单排序不变。生产 smoke 可用 #108 张掖市真实材料做一条**evidence-only** 归档，绝不能把 1391 个医疗机构写成 1391 分。不要使用假证据改变真实城市。
9. 如出现异常，先设置 YIJU_AGENT_AUTO_APPLY=false 并撤销 Agent token，再回退 Node 代码到原生产 SHA。保留记录、评估具体字段级别回滚；不要不加区别覆盖新的 SQLite 客户数据。

## 与 ChatGPT 对接

- 参考 docs/yiju-agent-actions.openapi.yaml，在账户支持的插件/工作流连接器或仍可编辑的已有 GPT Actions 中配置 API。只把 token 传入受保护的凭据字段，不把用户的管理员 JWT 交给 GPT。
- **2026 年 11 月产品约束**：官方帮助文档说明，个人 ChatGPT 账户已不能新建 GPT，既有 GPT 正向 Plugins 迁移。本仓库的 OpenAPI 文件只是接口规范，**不是已安装 ChatGPT 连接器**。因此优先验证现有 Work + 可连接插件/浏览器的真实调用链。
- **不能假设 ChatGPT 定时任务天然支持调用自定义 Actions 或能持续操作登录的 Work 页面。** 先实测“一次 GPT 证据提交 → 查询状态 → 次日定时自动再次执行”，再判定是否真能无人值守。没有可用连接器时，可以暂时通过 GPT → GitHub 证据库继续自动研究，不能宣布后端写入已通。
- 本轮未创建自动文章发布接口、伪装真人评论或无人值守互动模块；不要把本版本称作全部运营闭环已经上线。
- 实施完毕仅报告：合并 SHA、生产 SHA、备份恢复验证、受限 API 与端到端实际结果、ChatGPT 连接方式、下一次自动运营运行安排、残余 P0/P1。
