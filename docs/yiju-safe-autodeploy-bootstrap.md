# 易居无人值守安全部署通道（一次装机，后续无需人工部署）

## 设计结论

仓库 `Jihai123/ClaudeTest` 当前 **public**，默认分支固定为 `claude/livable-cities-ranking-0112UFYCzLLMXat6n8Tjc83c`；服务仍使用原 Linux + Node + PM2 + SQLite，不引入 Agent 进程或额外外网端口。

采用**主机端定时只读检查 GitHub → 验证本次 SHA 的 release-gate CI → 本机安全更新**。不在 ChatGPT、GitHub Actions、TinyFish 或仓库中存储 SSH 私钥、数据库凭据或生产管理员 JWT。无需把生产 SSH 放给 GitHub 托管 Runner。

### 组成

- `.github/workflows/yiju-release-gate.yml`：默认分支每次 push 触发的完整发布前 CI（原有20 + SQLite35 + SEO3/4 + 分页2 + Python 部署器测试），无任何 GitHub secrets、无部署权限。
- `scripts/deploy/yiju_auto_deploy.py`：服务器端 Python3 **固定副本**，用已有 PM2 用户运行，每 10 分钟检查远端默认分支 SHA。只有**完全匹配目标 SHA 的 push 发布 CI 结果为 success**才推进。
- 状态和数据库备份保存在服务器用户私有 `~/.local/state/yiju-autodeploy/`，`latest-status.json` 可用于审计，敏感 .env 备份对其他用户不可读。
- 执行前强制校验默认分支、origin URL、**工作区没有任何未提交的 tracked 文件变更**、PM2 进程脚本/cwd、SQLite 完整性、足够存储空间、是否为从当前线上 SHA 的 fast-forward；绝不 `git clean`。
- 发布前隔离 Git worktree + `npm ci` + 所有回归测试、SQLite online backup + 独立恢复副本完整性检查；随后 ff-only、安装生产依赖、重启同一个 PM2 服务。
- 公网 smoke：health、robots 当前 Sitemap、有效 XML Sitemap（城市详情 URL 唯一）、首页真实图片上传链接、对比页 canonical、图片页、躺平榜跨页唯一ID。失败只回滚**代码和 Node 依赖**，**绝不自动用旧 DB 覆盖已经写入的生产记录**。

## 首次服务器配置（只需一次；推荐由服务器上的 Codex 执行）

此处是**唯一不能从 ChatGPT 浏览器/GitHub 直接完成的操作**：当前对话没有生产 Linux SSH/文件访问。需要由已经有 SSH 权限的 Codex 或运维登录，**只在服务器上**执行，不要粘贴密码、.env 或密钥到聊天。

1. 只读核对真实生产目录、PM2 进程所属用户/工作目录、SQLite 真实绝对路径、活动 Git 分支/SHA、磁盘余量、现有发布方式；不要盲用仓库内旧文档写的 `/www/wwwroot/yijucity/ClaudeTest` 和历史 PM2 名称。
2. 合并本 PR 后，服务器当前线上工作目录未更新也没关系。使用 `git fetch` 取得默认分支的代码（**不要在准备阶段 git pull/reset**），再 `git show origin/<默认分支>:scripts/deploy/yiju_auto_deploy.py` 将部署器**单独安装到现有 PM2 用户私有目录**（例如 `~/.local/lib/yiju-autodeploy/runner.py`，chmod 700），不要直接以 Git 工作树中的可变脚本作为定时任务。
3. 以 PM2 服务所属用户写入私有配置 `~/.config/yiju-autodeploy/config.ini`（chmod 600），例如：

```ini
[deploy]
app_dir=/实际/生产/项目/绝对路径
db_path=/实际/SQLite/生产/绝对路径
pm2_name=实际PM2名称
branch=claude/livable-cities-ranking-0112UFYCzLLMXat6n8Tjc83c
public_url=https://yiju.zhibeimao.com
```

4. 运行：`python3 ~/.local/lib/yiju-autodeploy/runner.py --preflight`。**必须 PASS**；发现 PM2 cwd、Git branch、数据库或工作树不匹配时停止，由现场核查调整，不准删数据、不准覆盖配置解决。
5. 在对应 PM2 用户 crontab **只添加一次**：

```cron
*/10 * * * * /usr/bin/python3 /home/实际用户/.local/lib/yiju-autodeploy/runner.py >> /home/实际用户/.local/state/yiju-autodeploy/cron.log 2>&1
```

6. **先手工运行一轮** `python3 ~/.local/lib/yiju-autodeploy/runner.py`，审查 `latest-status.json`、`cron.log` 和生产网站。当前已经合入的 `#114` 和 `#119` 所在 SHA 必须真正经过本发布 CI 后才会自动应用；新工作流可能需要一个非业务更改的 merge/push 触发初次 CI。
7. GitHub 默认分支建议开启 branch rules：强制 PR、要求 release-gate 与城市功能 CI 通过，限制直接 force-push。将脚本安装目录/配置的权限限定在 PM2 用户，生产业务账号/后台不可编辑。
8. 保留并验证当前人工/快照回退基线；上线后从**公网**复测 `/sitemap.xml` 200 + XML、`robots.txt` 当前域名、主页上传图片链接、对比页 canonical、躺平榜 174 个唯一城市及小程序共用 API；记录真实生产 SHA、数据库备份路径与隔离恢复结果，附到 #112。

## 安全限制和失败处理

- 当前脚本是**发布基础设施**，不是证据采集 Agent；它本身不修改排名算法或城市数值。应用首次更新仍会由旧业务 `server.js` 的数据库初始化执行已有 schema 兼容行为，应在隔离备份里回归。
- 服务器只能从 GitHub 取**这一个已确认仓库、这个固定分支的 fast-forward SHA**；仅 GitHub Actions `yiju-release-gate.yml` 对**该 SHA 的 push**完成并成功时才启动。
- CI 不通过、API 不可用、磁盘空间不足、SQLite 备份/恢复失败、PM2 不是预期服务、工作区不干净、分支有分叉：全部 NO-GO，**禁止更新生产**。
- 生产更新后公网失败时自动尝试代码回滚并留下日志；若回滚也失败，需人工排障，**不得把备份DB直接覆盖活数据库**。
- *部署通道接通前*，GPT 从 GitHub 合并 PR 只能算 **代码已合并**，绝不算线上已部署。
- 若将来仓库改 private，GitHub 无凭据轮询会失效：必须重新设计只读认证，不能直接在配置写 PAT，也不能绕过 CI。
- 本策略为每 10 分钟**检查**，不是保证一定部署；任何等待 CI 或 preflight 失败都明确阻断而不会跳过。无需借助 ChatGPT 定时任务进行实际服务器发布。

## Codex 一次性现场实施任务

请在真实易居生产主机，以 PM2 原服务所属用户完成上面的 1–8 步；不要新建 Agent 服务，不要覆盖用户数据，不要输出 .env/密钥。若生产当前不是默认 Git 分支、PM2 cwd 与 Git checkout 不相符或可用磁盘不足，**不要强推发布**，先进行可回滚地修正或报告 NO-GO。优先交付“独立固定部署器安装+准确配置+预检PASS+首次目标SHA发布/回滚可用+公网完整验收”。最后在 #112 记录：实际用户名(可脱敏)、真实 app/db 目录(可脱敏)、生产原/新 SHA、CI run ID、备份与恢复验证、PM2 服务健康、外网 Sitemap/robots/分页/上传页/canonical 结果，及 GO/NO-GO。
