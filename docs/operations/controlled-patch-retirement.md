# 受控退出活动13文件补丁：独立复审材料

续接PR155审查评论 https://github.com/Jihai123/ClaudeTest/pull/155#issuecomment-6942270906 。不重做13文件审计，不重装部署器，不改cron。本变更只补齐原常驻runner的受控模式和数据/资产/rollback保护。PR155、runner切换本身仍需分别满足复审门槛。

## 已核实的增量生产清单

活动runner与Git版本仅stage_release补丁路径及其校验不同，本变更以实际活动版本为基础；活动e7f1fef SHA256仍为3f77e4c62e79101b7ff586921a0c4aa67294be83c543a66953234e042bf9a0c4，cbee仅保留归档。

13文件以外4个tracked改动：.github/workflows/yiju-city-data-check.yml、public/admin.html、public/robots.txt、server/routes/sitemap.js，均与PR155目标内容一致，可由Git接管。

同名untracked资产共40项：逐项记录在私有清单。内容不同的6项是发布门禁工作流、首页explorer JS、公开事实JSON、officialCityFacts工具及D05/D07测试；差异均为已合并的D08/D10和PR155回归，保留新版。其余34项与Git一致，可接管。196条清单中139条为不接管的私有/未跟踪资产，17条为managed代码或两份保护数据。没有删除、清理或盲目覆盖任何未知资产。

主机 /root/yiju-autodeploy/cutover-baseline-20261117 保存受限权限基线：196个资产的SHA256与处理决定、原部署器/cron/manifest/status/两补丁、生产资产归档、SQLite online backup与隔离恢复副本。数据及.env等内容仅存生产私有目录，不进入Git。已验证原manifest CAS PASS、15张SQLite表与隔离恢复完整性PASS。

## 部署器改动边界

- 无mode文件时，继续使用活动e7f1fef补丁并检查原固定SHA，保留旧版本兼容行为。
- mode文件必须部署用户所有、0600；清单同样私有且SHA与审批记录一致；review必须APPROVED。
- PR155必须已经合并到指定分支，merge SHA须与审批记录一致；目标须为其后代，并再次验证精确SHA的push release-gate。
- 首次退出前核对196条基线；后续核对已发布manifest及审批清单身份。未知的新tracked/untracked碰撞、符号链接、数据漂移都拒绝。
- 两份历史导入数据在copy_code和restore_code中均明确跳过；独立私有备份只作恢复材料，不自动重写原文件。manifest记录实际生产数据哈希，部署前、复制后及回滚后均核验。
- 未跟踪且不接管的资产保持原位；每次发布记录其即时指纹，发布后比较。所有同名资产只有经清单审阅且基线一致才可接管。
- staging测试、活库online backup、manifest CAS、现有单服务PM2重启、public smoke、失败回滚均保留；改动只作用yijucity。
- rollback归档包含原runner/清单/模式/状态和manifest；失败恢复代码、modules及原manifest/模式状态，保护数据不重写。保留原版本补丁。不会回滚生产SQLite造成用户数据倒退。
- 同SHA no-op仍核验受控模式和数据保护，不会再调用旧patch。

## 隔离验证

新增10项离线测试覆盖：PR未合并/merge身份错误/错误分支、非后代SHA、push CI失败、未审批/篡改清单、私有权限、数据漂移、未知碰撞与symlink父目录、部署及恢复不改两数据字节和mtime、真实SQLite备份+代码/modules/manifest失败回滚，以及受控staging不调用git apply。

回滚故障点注入在public smoke，真实临时文件和临时SQLite验证，PM2由夹具代替，不停止生产服务。生产基线保全过程持有原STATE/lock，原cron保持不变。主机旧Git使既有2个夹具失败，不能把这些错误忽略为PASS，须由Node22/24现代Git CI完整验收。

## 复审后实际切换步骤

1. 复审本PR的runner diff与私有清单分类；确认PR155绿色且合并，读取真实merge SHA；本PR也需Node22/24通过及独立复审，不能由“测试成功”代替批准。
2. 持有同一STATE/lock，复核活动runner原SHA、cron SHA、196条基线、数据SHA及备份完整性。将inventory.json复制为STATE/reconciliation-inventory.json，0600；创建schema=1、review=APPROVED、merge_sha=PR155真实merge、inventory_sha256及legacy_patch_sha256的私有mode文件。
3. 将已复审Git文件原子替换到现有/root/yiju-autodeploy.py，保留旧文件快照及权限；不运行--install，不改cron。先从该已替换runner进行实际staging/业务演练，验证受控门槛和数据库副本。失败恢复旧runner和私有mode元数据，不动生产代码和数据。
4. 释放锁，由原cron自动识别目标分支新的merge SHA；精确push CI通过才允许部署。取得真实DEPLOYED SHA、backup目录、public smoke与196项资产/两数据指纹比对，等待下一次原cron出现UP_TO_DATE/no-op。
5. 从独立GET核实21城148事实、955的17事实与授权照片回退、精选排除1023/1087、首页换批JS及图片来源，核对活库关键表未发生业务数据回退；真实浏览器点击另验，不用JS存在冒充点击通过。
6. 实际证据写入#121/#112。PR尚未合并或实际cron未部署时，不声明本目标完成。若需要显式历史版本回退，使用已留存的旧runner+对应manifest/patch；不得将无补丁模式套在PR155以前SHA。

真实生产库副本业务API复验PASS：21城148事实、955的17事实、精选排除1023/1087、list/weekly/new接口通过；955保留已有审核图。生产原manifest CAS一致，cron最后成功发布为a541010dbc7b1efc569103d7778160127d169ed5；不能把当前BLOCKED_SHA或Git旧HEAD当作回滚版本。清单和新rollback状态明确记录该真实来源。

当前仅准备和隔离演练，尚未激活mode、替换生产runner、合并PR或切换生产。
