# 13文件生产补丁归并验收与切换约束（2026-11-17）

本PR仅归并代码并独立验收；不合并上线、不修改生产部署器/cron/补丁，不连接生产数据库。基线为目标分支 b38f95f。隔离仓库 /tmp/yiju-13-audit.git，工作树 /tmp/yiju-13-audit；生产仓库未执行 fetch/checkout/reset/apply。

## 只读生产证据

- Nginx -T 确认已加载 html_yiju.zhibeimao.com.conf：yiju.zhibeimao.com 静态目录是项目 public，API 转发 127.0.0.1:3007。
- 实时 PM2 jlist：yijucity online；入口项目 server.js；cwd 是项目目录；解释器 /opt/yiju-node22/bin/node。
- root cron 每10分钟以现有 Python3.13 执行 /root/yiju-autodeploy.py --once。检查 /etc/crontab、/etc/cron.d、用户 crontabs、宝塔 /www/server/cron，未发现这些爬虫的定时调用；进程表未见 batch_crawl/run_keyword_refresh 运行。不能由此断言手动入口已废弃。
- 指定 cbee4c1d 补丁 SHA256：4dec33cdfd39a55afd416dae75d371a9716a325b74c7b7b21f5257088ececbb3。
- 部署器实际引用 e7f1fef 补丁 SHA256：3f77e4c62e79101b7ff586921a0c4aa67294be83c543a66953234e042bf9a0c4。两份都涉及相同13路径，差异在 index/detail/cities 三个文件。仅处理指定旧补丁而不核对实际活动补丁无法完成切换。
- 生产 HEAD 仍为 2c34c3f，存在13文件之外的 tracked 修改和与新版 Git 同名的 untracked 资产。本PR不覆盖或清理这些文件。
- 原13文件、两份补丁、部署器及root crontab的私有只读指纹保存在主机 /tmp/yiju-13-production-fingerprints.json。不得将生产 .env、PM2全量环境、数据库或私有配置上传。

## 逐文件决定

“Git已吸收”按功能判断，不等于文件逐字相同；13文件中无整份补丁已被Git完整吸收。

| 原路径 | 实际使用证据 | 分类及决定 | 本PR实际内容 |
|---|---|---|---|
| data/city-competitiveness-ranking.csv | import-city-competitiveness.js 手动导入；非在线读取、未见定时任务 | 存在冲突待判断：生产295行、Git21行，历史排名缺可核验年份/出处；保护生产原件 | 不提交生产数值、不执行导入；切换前须私有保全并排除覆盖 |
| public/city-compare.html | Nginx静态页面 | 生产独有且仍需要 | 归并既有公开GA测量ID统计标签 |
| public/city-detail.html | Nginx静态详情页 | 生产独有且仍需要；恒真路径改写废弃 | GA；按pathname完整路径段识别子路径，修正root域名误判；保留新版资料、评分与单位提示 |
| public/index.html | Nginx首页 | 生产独有且仍需要；默认图旧方案废弃 | GA；正确API路径；封面→授权图→已有image_url；失败隐藏图及署名，保留占位，不猜R2路径、不请求不存在默认图；保留D06-D10新功能 |
| public/recommend.html | Nginx推荐页 | 生产独有且仍需要；恒真路径改写废弃 | GA；root及子路径均正确 |
| public/upload-images.html | Nginx上传页 | 生产独有且仍需要；恒真路径改写废弃 | GA；root及子路径均正确，不改上传鉴权 |
| server.js | PM2实际入口 | 生产独有且仍需要 | 仅添加GA所需CSP script/connect来源 |
| server/crawlers/batch_crawl.py | 手动刷新流水线调用；未见定时/运行 | 生产独有且仍需要，保留手动行为 | 默认API driver，配置及CLI仍可覆盖；不执行真实下载 |
| server/crawlers/crawl_config.json | batch_crawl加载；刷新脚本会临时替换它 | 生产独有且仍需要 | 仅归并15张及4组搜索模板、显式API driver；无私有配置 |
| server/crawlers/crawl_config_refresh.json | run_keyword_refresh显式引用 | 生产独有且仍需要 | 归并4组生产搜索模板；保留engine/delay/conda等既有参数 |
| server/crawlers/data_crawlers/filtered_data/city_data.json | import_data.py/filter_data.py 的生成/导入输入；非在线读取 | 存在冲突待判断：生产227行、Git17行，城市ID/来源未验明；保护原件 | 不上传生成数据、不自动导入或重映射；切换前私有保全并排除覆盖 |
| server/crawlers/run_keyword_refresh.sh | 保留的手动入口；未见定时/运行 | 生产独有且仍需要 | 仅默认每城市30张，保留参数覆盖、备份、筛选、唯一命名和追加逻辑 |
| server/routes/cities.js | server.js挂载的在线API | featured封面策略Git已吸收；list和其他hot类型仍为生产独有 | 仅补齐approved图片按cover/weight/likes/date选择；保留精选地域分散、隔离ID、过滤参数化、授权图片和来源资料 |

两份数据是待核验导入材料，不应被自动发布流程当成待重放代码补丁。其生产版本必须先保全，不能因本PR不提交数据而在未来部署中被Git样例覆盖。暂未发现可整体删除的爬虫功能。

## 独立验收

新增测试：
- 4个页面在root域名、/yiju、/livablecities及相似前缀下运行真实API地址函数。
- 执行真实首页函数验证封面/授权图优先级、缓存失败、有限错误处理与署名隐藏。
- 新建临时SQLite与HTTP服务，验证无封面授权回退、pending拒绝、日期/权重/封面选择以及list、weekly、featured、new接口。不复制线上数据库。
- 离线爬虫用合成城市清单验证dry-run筛选不下载、不写日志，以及driver/数量CLI覆盖。

从已提交版本另建 /tmp/yiju-13-acceptance 独立验收工作树，重新 npm ci 后：Node22原有页面/数据回归68项（含城市数据20项）通过；真实SQLite集成35项通过；新增页面/SQLite验收3项、爬虫离线验收2项通过；bash -n 通过。完整既有Python套件主机49项中47通过，2项因Git2.17不支持测试夹具参数而错误，需以现代Git的CI结果判定。Node22/24正式release gate增加了新增验收；最终CI结果以PR检查记录为准。

主机的Node22非官方兼容构建在node --test子进程模式运行新增SQLite文件出现序列化错误，但直接node执行同文件3项全通过，因此与现有SQLite集成测试一致使用直接node运行；原有页面测试仍使用node --test。未把该环境问题当作产品失败或绕过release gate。

## PR通过后的安全切换方案（本轮不执行）

1. 等待精确PR head的Node22/24 release gate全部成功及人工复审；合并后必须重新等待目标分支精确merge SHA的push gate成功，PR成功不替代push门禁。禁止直接在旧部署器仍重放补丁的状态发布。
2. 在独立变更窗口获取部署器同一个排他锁，阻止cron进入发布，但保留原cron行；确认无在途任务。备份部署器/manifest/两份补丁/全部tracked和untracked差异及数据文件，清单记录SHA256。线上SQLite的在线备份与恢复验证另行按原发布门禁执行，本轮未触碰。
3. 对13文件之外的差异及同名untracked资产做单独清单审阅，不能reset/clean生产目录；数据两文件移交私有运行态保全方案，未来发布复制阶段必须明确排除这两路径，核验前后指纹不变，禁止执行历史导入。未完成该保护前停止切换。
4. 在隔离release工作树建立“已归并基线”清单：明确原13路径各项 absorbed/retired/runtime-data状态，两份旧补丁只作为归档，不再自动git apply。未来确有剩余代码差异须独立、最小、带基线SHA的新变更，不把旧13文件整包换名重放。
5. 单独提交并审核部署器改动：只有目标分支包含本归并merge SHA（祖先关系验证）且达到精确SHA push门禁，才能启用无旧补丁模式；旧版本回滚保留匹配旧版本的补丁及manifest。不得全局跳过补丁失败、CI或资产碰撞检查。
6. 用实际活动部署器的staging流程进行空操作演练，验证不再调用两份旧patch、无新tracked/untracked碰撞、数据/私有配置受保护、差异清单零未知，再通过现有备份、测试、单服务发布和公开smoke。失败按已验证manifest回滚，保持数据不倒退。
7. 同一SHA重复轮询两次应为no-op；发布后Git干净代码+外置运行态数据，状态日志不得再出现旧13文件apply。确认后释放锁让原cron继续运行；不重装部署器。

## 剩余阻断

- 两份数据的出处/年份/城市映射核验尚未完成，生产原件保留；无完整数据保护方案禁止切换。
- 活动部署器引用另一份patch；13文件以外生产差异、同名untracked资产碰撞需单独审阅。
- 本PR不改变活动部署器，故当前自动部署冲突不会仅因PR存在而消失；需在PR通过后完成上述独立切换变更。不得宣称已根治线上发布。
