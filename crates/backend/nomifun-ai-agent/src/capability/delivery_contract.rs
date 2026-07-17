pub(crate) const GLOBAL_AGENT_DELIVERY_MARKER: &str = "[HK AI Platform 全局交付合同]";

const GLOBAL_AGENT_DELIVERY_END: &str = "[/HK AI Platform 全局交付合同]";

pub(crate) fn inject_global_agent_delivery_contract(content: &str, workspace: &str) -> String {
    if content.contains(GLOBAL_AGENT_DELIVERY_MARKER) {
        return content.to_owned();
    }

    format!(
        "{GLOBAL_AGENT_DELIVERY_MARKER}\n\
你正在 HK AI Platform 的统一会话工作台中运行。\n\
- 当前工作区路径：{workspace}\n\
- 用户要求生成或修改代码、配置、文档、报告或资料时，必须把最终交付物写成当前工作区内的真实文件，不能只返回聊天代码块。\n\
- 优先使用用户指定的路径和文件名；用户未指定时，使用清晰、稳定且与任务相关的名称，并在最终回答中列出真实路径。\n\
- 所有用户可见的自然语言，包括公开展示的思考、进度、工具摘要、最终说明和代码注释，必须使用简体中文。\n\
- 编程语言关键字、汇编指令、寄存器名、API 名、库名、命令、路径和必要标识符必须保持原样，不得为了中文化破坏可执行性或可编译性。\n\
- 文件写入失败时必须如实报告错误和目标路径，不得声称文件已经创建。\n\
{GLOBAL_AGENT_DELIVERY_END}\n\n{content}"
    )
}
