import {
  matchProjectFromContent,
  suggestNewProjectName,
} from "../src/lib/projectMatch.js";

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

const projects = [
  {
    id: "p1",
    name: "Nimbus",
    description: "macOS native email",
    aliases: JSON.stringify(["邮件客户端", "Nimbus Mail"]),
    status: "active",
  },
];

const m1 = matchProjectFromContent(
  "Nimbus 应该弱化 AI-first",
  projects
);
assert(m1.kind === "matched" && m1.project_name === "Nimbus", "name match");

const m2 = matchProjectFromContent("邮件客户端要做推送", projects);
assert(m2.kind === "matched", "alias match");

// Compound CJK alias: 照片相册 → text only says 相册
const aero = [
  {
    id: "p2",
    name: "Lumen",
    description: "photo frames",
    aliases: JSON.stringify(["照片相册"]),
    status: "active",
  },
];
const m3 = matchProjectFromContent(
  "如果把产品定义一个真实相册的app呢，像以前每家都有一本相册一样",
  aero
);
assert(m3.kind === "matched" && m3.project_name === "Lumen", `相册 partial alias: ${JSON.stringify(m3)}`);

const none = matchProjectFromContent("今天天气不错", projects);
assert(none.kind === "none", "no false match");

const sug = suggestNewProjectName("做 NovaMail 产品定位", []);
assert(sug?.suggested_name === "NovaMail", `suggest got ${sug?.suggested_name}`);

const noSug = suggestNewProjectName("Mac 和 iPhone 推送预览", []);
assert(noSug === null, "Mac/iPhone should not suggest project");

console.log("projectMatch tests passed.");
