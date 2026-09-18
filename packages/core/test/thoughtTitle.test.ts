import {
  makeThoughtTitle,
  makeThoughtSummary,
  isLowValueSummary,
  extractSteps,
  commitmentTitleFromThought,
  normalizeCommitmentKey,
} from "../src/lib/thoughtTitle.js";

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

const push =
  "Mac和iPhone版，开启邮件通知后，应该具备推送通知功能，即在Mac端能触发桌面提醒和预览，iOS端也有相关推送预览";
const t = makeThoughtTitle(push);
assert(t.includes("推送") || t.includes("邮件"), `title=${t}`);
assert(t.length < push.length, "title shorter than full content");
assert(t.length <= 40, "title max length");

const c1 = commitmentTitleFromThought(
  null,
  "如果把产品定义一个真实相册的app呢，像以前每家都有一本相册一样"
);
assert(c1.startsWith("推进"), `exec title: ${c1}`);
assert(!c1.includes("如果把产品"), "should not paste raw question");

const k1 = normalizeCommitmentKey("明天优化Nimbus安全阅读模式");
const k2 = normalizeCommitmentKey("明天优化Nimbus安全阅读模式AI增强版");
assert(k1 === k2, `orvia keys ${k1} vs ${k2}`);

// SEO tip: must abstract steps, not first/last hook
const seoTip = `我喜欢这个全新的SEO技巧：

1. 将你的社交内容添加到Search Console。
2. 等待至少2天，让一些关键词出现。
3. 访问GSC并记录一些关键词。
4. 分析SERP并撰写帖子。
5. 在开头放置一个关键词。
6. 分享帖子。

你的帖子将出现在Google SERP上。`;

const badBody = `要点：我喜欢这个全新的SEO技巧：

联想/结论：你的帖子将出现在Google SERP上。`;
assert(isLowValueSummary(seoTip, badBody), "hook+punchline is low value");
assert(extractSteps(seoTip).length === 6, "numbered steps");

const sum = makeThoughtSummary(seoTip, undefined, {
  projectName: "Nimbus",
  projectDescription: "native email",
  title: "对 Nimbus 的启发：利用社交内容做 SEO",
});
assert(!sum.includes("我喜欢这个全新的SEO技巧"), `no hook: ${sum}`);
assert(/步骤|1\./.test(sum), `has steps: ${sum}`);
assert(/Nimbus/.test(sum), `product transfer: ${sum}`);
assert(/Search Console|GSC|SERP|社交/.test(sum), `mechanism: ${sum}`);
assert(!isLowValueSummary(seoTip, sum), "new summary is solid");

console.log("thoughtTitle tests passed:", t, "|", c1);
console.log("SEO summary sample:\n", sum);
