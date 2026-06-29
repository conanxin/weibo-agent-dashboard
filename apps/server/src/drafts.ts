export interface DraftRequest {
  topic: string;
  style: string;
  length?: "short" | "medium" | "long";
}

function normalizeLength(length: string | undefined): "short" | "medium" | "long" {
  if (length === "short" || length === "medium" || length === "long") {
    return length;
  }
  return "medium";
}

export function createDraftContents(request: DraftRequest): string[] {
  const topic = request.topic.trim() || "个人内容工作台";
  const style = request.style.trim() || "清晰、克制、实用";
  const length = normalizeLength(request.length);

  const suffix =
    length === "short"
      ? "先小步跑通，再继续迭代。"
      : length === "long"
        ? "我会先保留人工确认和复制发布这一步，让工具负责整理、分析和起草，让最终表达仍然由自己把关。"
        : "先把同步、归档、分析和草稿跑通，发布仍然人工确认。";

  return [
    `关于「${topic}」，我更看重的是可持续：少一点自动化冲动，多一点稳定积累。${suffix}`,
    `用「${style}」的方式看「${topic}」：工具不需要一开始就很重，能把重复整理的部分接住，就已经很有价值。`,
    `最近在梳理「${topic}」。我的判断是：先做本地归档和复盘，再决定哪些内容值得公开表达。${suffix}`
  ];
}
