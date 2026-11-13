# 易居 GPT → GitHub Issue → GitHub Actions → 现有 Agent API（V1）

## 目的与已存在能力

这是连接器，不是新开发城市修改API或独立Agent服务。复用现有 POST
https://yiju.zhibeimao.com/api/agent/city-data/submissions 和
GET /submissions/{external_id}。已有 PR#107/#109/#111 的权限、审批、
CAS旧值检查、自动配额与回滚都由原服务端执行。桥接不提供审批、回滚、
排行、评分、标签、管理员登录或任意 URL 请求。

- 提交队列：https://github.com/Jihai123/ClaudeTest/issues/138
- 唯一经营总账：https://github.com/Jihai123/ClaudeTest/issues/112
- 工作流：.github/workflows/yiju-agent-github-bridge.yml
- 校验器：scripts/ops/yiju_github_bridge.py
- 单测：tests_py/test_yiju_github_bridge.py

## 一次性初始化（仓库管理员执行，严禁将密钥粘贴到聊天或提交到 GitHub）

1. 在 GitHub 仓库 Settings → Secrets and variables → Actions → New repository secret，
   创建名称 **YIJU_AGENT_API_TOKEN** 的 Repository Secret。值为**与生产端
   YIJU_AGENT_API_KEY_SHA256 对应的原始独立 Token**，不是 SHA256 摘要。
   Token 仅由拥有密钥的管理员通过 GitHub 密钥管理UI写入。当前 GPT 工具
   **无法创建或读取该 Secret**。若原始 Token 已不可用，应通过现有运维
   程序轮换服务端摘要及新 Token，不要尝试逆推出摘要。
2. 确认仓库 Actions 具备对 Issues 写评论的权限。工作流的
   permissions 已明确限定 contents:read、issues:write。
3. 不必新建 cron/Agent 服务，不必再更新城市数据写库逻辑。

无 Secret 时仍可做 mode=probe，不触发真实API；mode=submit 会给出
missing_actions_secret 并标记失败，不会以空凭据试写。

## 调用（在 Issue #138 新增评论）

第一行必须是 YIJU_AGENT_REQUEST_V1，紧随其后放一个独立JSON对象
（无 Markdown 代码围栏）。只允许仓库所有者 Jihai123 评论触发该工作流；
非所有者、其他 Issue、非法格式均不会触发正式调用。

**纯链路探针（不使用 Secret、不访问易居API、不写数据）：**

    YIJU_AGENT_REQUEST_V1
    {"mode":"probe"}

**证据只归档的结构示例（数据必须先真实核验；此处值只是结构示例，不要直接发送）：**

    YIJU_AGENT_REQUEST_V1
    {
      "mode": "submit",
      "payload": {
        "external_id": "unique-city-year-source-metric-v1",
        "city_id": 951,
        "scope_name": "张掖市",
        "source_url": "https://官方真实来源.example.gov.cn/具体原文",
        "source_date": "2026-06-02",
        "source_note": "已经实际读取完整官方统计原文并核验张掖市市域口径，不能映射为0至10分",
        "source_type": "government",
        "source_access": "fetched",
        "source_excerpt": "此处必须填入真实读取的至少15字来源原文，切勿用此样例代替证据",
        "observation_period": "2025",
        "metric_key": "medical_health_institutions_count",
        "metric_value": 1391,
        "metric_unit": "个"
      }
    }

上例中的样例域名不保证真实存在；不得复制执行。文档/API源头
docs/yiju-agent-actions.openapi.yaml 是字段唯一权威，服务端继续严格验证。

**有源字段变更**：在 payload 中添加 proposal: {field, new_value,
expected_old_value, conversion_note, auto_apply}。必须先通过读取现有城市
字段得到 expected_old_value；服务器对审批、低风险4文字字段
slogan/location_intro/key_points/notes 和两处不同政府域名一致性重新判断。
数字价格/人口字段不允许 auto_apply=true，也不能从“机构数量”直接改
medical_facilities 评分。凡非自动批准的写入只会产生待审申请。

## 事件、回读和判断完成的条件

1. 接收指定 Issue #138 所有者 comment.created；
2. 执行 Python 白名单校验，拒绝额外字段、伪造URL、不合法来源和越权自动字段；
3. 仅使用固定主机 yiju.zhibeimao.com 的 POST /submissions，
   再 GET /submissions/{external_id} 验证 evidence_id/状态；
4. 在 Issue #138 写回**不含原文、密钥和请求体**的回执；
5. 自动生效须由服务端 change_status=approved 才计入生产字段更新；
   evidence_only 仅算证据入库、pending仅算待审；需随后检查实际前台变化。
6. 自有 ChatGPT 自动化每天在 #112 记录外部请求ID、回执URL、真实写库数，
   不得把评论创建或CI通过算成城市更新。

如果 POST 网络超时，状态为 unknown_delivery；不自动重发新的 external_id。
请查现有外部ID是否已入库，再用**相同** external_id 重放以利用原服务端幂等。

每条请求在公开 GitHub Issue 留存来源/指标说明，禁止放私人数据或令牌。
工作流本身使用默认分支受信任代码；所有敏感API响应字段和报错不写日志。
默认仓库 Actions 是否会真正触发、是否拥有 Secret、生产服务是否允许 GitHub
runner IP 的访问，都必须用 probe→真实 evidence_only 两级验证；不能凭PR通过宣称已打通。
