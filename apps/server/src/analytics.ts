import type { AppDatabase, StoredPost } from "./db.js";
import { listPosts } from "./db.js";

export interface AnalyticsSummary {
  totalPosts: number;
  averages: {
    attitudes: number;
    comments: number;
    reposts: number;
  };
  keywords: Array<{
    term: string;
    count: number;
  }>;
  suggestions: string[];
}

const stopWords = new Set([
  "http",
  "https",
  "com",
  "www",
  "今天",
  "一个",
  "这个",
  "我们",
  "你们",
  "他们",
  "自己",
  "不是",
  "可以",
  "没有",
  "以及",
  "the",
  "and",
  "for",
  "with"
]);

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function extractTokens(text: string): string[] {
  const matches = text.match(/[\p{Script=Han}]{2,}|[A-Za-z0-9_]{2,}/gu) ?? [];
  const tokens: string[] = [];

  for (const match of matches) {
    const lower = match.toLowerCase();
    if (stopWords.has(lower)) {
      continue;
    }
    if (/^[\p{Script=Han}]+$/u.test(match) && match.length > 4) {
      for (let index = 0; index <= match.length - 2; index += 2) {
        const token = match.slice(index, index + 2);
        if (!stopWords.has(token)) {
          tokens.push(token);
        }
      }
      continue;
    }
    tokens.push(lower);
  }

  return tokens;
}

function buildSuggestions(keywords: Array<{ term: string; count: number }>): string[] {
  const top = keywords.slice(0, 4).map((keyword) => keyword.term);
  if (top.length === 0) {
    return [
      "复盘最近一周的工作台使用经验",
      "整理一个低频同步的内容归档流程",
      "写一条关于人工复制发布边界的说明"
    ];
  }

  return [
    `围绕「${top[0]}」写一次实践复盘`,
    `把「${top.slice(0, 2).join(" + ")}」整理成一条方法论微博`,
    `用更个人化的角度解释「${top[Math.min(2, top.length - 1)]}」为什么重要`
  ];
}

export function summarizePosts(posts: StoredPost[]): AnalyticsSummary {
  const totals = posts.reduce(
    (accumulator, post) => {
      accumulator.attitudes += post.attitudes_count;
      accumulator.comments += post.comments_count;
      accumulator.reposts += post.reposts_count;
      for (const token of extractTokens(post.text)) {
        accumulator.keywords.set(token, (accumulator.keywords.get(token) ?? 0) + 1);
      }
      return accumulator;
    },
    {
      attitudes: 0,
      comments: 0,
      reposts: 0,
      keywords: new Map<string, number>()
    }
  );

  const keywords = Array.from(totals.keywords.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((left, right) => right.count - left.count || left.term.localeCompare(right.term, "zh-CN"))
    .slice(0, 12);

  const denominator = posts.length || 1;

  return {
    totalPosts: posts.length,
    averages: {
      attitudes: round(totals.attitudes / denominator),
      comments: round(totals.comments / denominator),
      reposts: round(totals.reposts / denominator)
    },
    keywords,
    suggestions: buildSuggestions(keywords)
  };
}

export function getAnalyticsSummary(db: AppDatabase): AnalyticsSummary {
  return summarizePosts(listPosts(db));
}
