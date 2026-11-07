# REQ-04 文案审查调研

2026-11-06。以下是公开资料调研和产品建议，不代表用户确认、实际产品测试或已实现功能。

## 产品参考

| 产品 | 公开说明中的做法 | 可借鉴之处与边界 |
|---|---|---|
| [Grammarly](https://www.grammarly.com/how-grammarly-works) | 在原文标记建议、说明理由，由作者接受或忽略；[写作目标](https://support.grammarly.com/hc/en-us/articles/360054679292-What-are-Goals)可影响建议。 | 建议应有依据、解释和作者选择；其英语产品能力不能直接推定中文质量。 |
| [Microsoft Editor](https://support.microsoft.com/en-us/word/microsoft-editor-checks-grammar-and-more-in-documents-mail-and-the-web) | 在文本中提供拼写、语法、清晰度等建议，可接受或忽略。 | 区分校对和表达优化，不把主观风格当成确定错误。 |
| [ProWritingAid Chapter Critique](https://help.prowritingaid.com/article/270-what-is-the-critique-report) | 提供整体反馈及结构、节奏、语言等可定位的问题，保留反馈历史。 | 同时审视整体和局部；小说章节维度不应直接套用私人日记。 |
| [秘塔写作猫](https://apps.apple.com/cn/app/%E7%A7%98%E5%A1%94%E5%86%99%E4%BD%9C%E7%8C%AB/id1638842929) | 宣称支持中文错别字、语病、成语纠错和句子改写。 | 中文校对值得关注；此处仅据产品介绍，未实测其效果。 |
| [Hemingway Editor](https://hemingwayapp.com/help/docs/intro) | 标记复杂句并提供可读性等级。 | 定位难读片段可参考；英文可读性等级不能直接用于中文，更不能等同文章质量。 |

## 研究证据与限制

- 一项[自动写作反馈的多层元分析](https://www.frontiersin.org/articles/10.3389/frai.2023.1162454/full)研究学生写作表现，复杂长文效果存在差异。教育场景不能直接证明对中文个人日记的长期写作能力有效。
- 一项[中文二语写作研究](https://scholar.lib.ntnu.edu.tw/en/publications/chatgpt-and-l2-chinese-writing-evaluating-the-impact-of-model-ver/)使用 153 个有错误的单句，由三名教师评估语法、最小改动、过度纠正和反馈质量；两个模型版本的表现有差异。其数据不等同母语私人日记或完整文章。
- 上述资料不足以证明某一种界面、评分或模型对本项目“科学最优”，也不能证明所有作者认可任何产品。产品功能介绍不等于独立效果验证。

## 供讨论的产品方案

以下为调研时的历史建议。2026-11-06 用户已明确采用基础校对、最小干预方向；整体结构审查不再作为 REQ-04 目标，现行方向与待确认细节见[需求草案](../features/COPY_REVIEW.md)。

将审查分为整体结构和局部表达两层；每项反馈关联原文、说明问题及理由，明确区分较确定的校对问题和依目标而异的表达建议。建议可供作者忽略或自行修改；涉及替换时先对照并明确操作，保留版本及冲突保护。整体建议可以指出结构与节奏，但不得虚构事实或把个人叙事习惯当错误。审查前明确范围、模型和发送内容，不默认发送图片或其他日记。

入口、审查范围、结果存储、批量操作、模型及交互均待用户讨论确认；写作练习和长期风格档案分别属于 REQ-05/10，关系需后续细化。建议未来用合成中文日记及用户自愿提供的样例评估错误定位、理由是否成立、事实保持、过度修改和实际可用性；当前未做此项评测。
