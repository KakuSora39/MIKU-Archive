# 参考数据快照

- 来源网站：https://mikutime.link/setlists/
- 网站公开链接的数据项目：https://github.com/talisein/songbot
- 事实索引文件：src/concerts-raw_data.cppm
- 内容 SHA：9b5cb03c4596d288e4b46a97e068b83adbd34d30
- 获取日期：2026-11-17

静态 JSON 端点在本次环境返回 403。随后通过 GitHub 连接读取网站公开链接的数据源，只提取巡演名称、系列、日期、巡演键和 VocaDB 编号等事实，没有复制程序代码、歌单或歌词。

mikutime-concert-index.json 包含 75 项巡演事实，用于目录补充与交叉核对。它不是官方演出或 BD 发行证明，也不保证覆盖全部 Live。

Vocawiki：https://voca.wiki/初音未来/演唱会#大型演唱会列表
逐场表到 #136；#1–133 与原有目录对应，#134–136 对应已有 LAWSON / DECO / 宝可梦条目，因此只补资料和引用。2023、2024 魔法未来东京及 2017 马来西亚的既有官方日期更正继续保留。

重新生成：python3 scripts/build_catalog.py
修改参考快照或合并规则后，应检查重复条目、旧 id 稳定性与城市日期 / 巡演日期的层级差异。
