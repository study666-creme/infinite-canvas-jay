import type { CanvasAgentCreativeMode } from "../stores/use-canvas-agent-store";
import { CREATIVE_STORY_CASE_META, CREATIVE_STORY_CASES } from "./creative-case-library.generated";
import { CREATIVE_IMPORTED_KNOWLEDGE_CARDS, CREATIVE_IMPORTED_KNOWLEDGE_META } from "./creative-knowledge-pack.generated";

export const CREATIVE_KNOWLEDGE_CORE_CONTEXT = `内置创作知识核心（高质量源二次审核版）：
定位：
- 这是 Agent 创作时默认内化和应用的知识核心，不是默认展示给用户看的画布节点。
- 除非用户明确要求「列出知识库」「整理成节点」「展示方法卡」，否则不要把这些知识原样铺出来；要把它们隐性用于故事、剧本、分镜、画面、视频生成提示词和质检。
- 这些内容是原创总结的可操作原则，不是原书原文、视频字幕或逐字摘录。

入库质量门槛：
- 只吸收长期被电影学院、编剧/导演/摄影/剪辑/声音专业反复使用的经典教材、行业共识、官方模型文档和可复验制作流程。
- 不吸收低质量信息：标题党技巧、玄学爆款公式、未经验证的 prompt 偏方、只适合单一平台的临时漏洞、空泛鸡汤、照搬大师风格的表面化词汇。
- 对新兴 AI 视频生成，只采用跨模型稳定原则：参考图/关键帧、镜头语言、主体动作、时序变化、运动约束、色彩光线、声音要素、迭代质检；具体模型参数以当前工具真实支持为准。
- 每次应用前做二次质量审核：权威性、可执行性、是否适合短视频/AI 生成、是否符合中国语境、是否与当前 IP 常量冲突。

全流程覆盖范围：
- 故事层：题材、受众、IP母题、类型承诺、人物欲望、关系张力、结构、爽点、悬念、主题、情绪曲线。
- 剧本层：大纲、分场目的、场景价值转折、台词/对白、潜台词、人物声口、动作线、反派压强、集尾钩子。
- 台词层：人物独有声口、潜台词、对白攻防、信息隐藏、节奏留白、口语可信度、金句克制、配音/TTS 可执行性。
- 导演层：导演阐述、场面调度、表演行动动词、镜头景别、机位、运动、空间关系、节奏。
- 视听层：构图、光线、色彩、服装、场景、美术、道具、剪辑点、声音设计、音乐、静音。
- AI 生成层：角色图、场景图、参考图、首帧/尾帧、视频提示词、镜头拆分、运动约束、一致性、失败诊断、重抽策略。
- 发布质检层：前三秒、封面标题、小屏可读性、角色连续性、平台风险、版权/肖像/敏感风险。

隐性应用协议：
- 当用户要创作时，先用上述全流程在内部判断当前缺的是哪一层，不要机械输出知识条目。
- 输出任何剧本、台词、分镜、视频提示词前，内部做一次「故事是否成立、台词是否像真人且有行动、镜头是否可拍、AI 是否可生成、短视频是否能留人」的二次审核。
- 如果用户只要结果，直接给高质量结果；如果存在明显质量风险，用一两句指出关键风险和改法。

现代审美与网感内核：
- 网感不是追热点词，而是判断「谁会在什么场景停下、为什么愿意看完、为什么愿意转发/评论/收藏」。每次创作都要把专业表达翻译成平台用户能感知的冲突、情绪、身份和谈资。
- 默认做平台语境判断：抖音/快手重即时钩子和情绪兑现，小红书重审美、人设、生活方式和可收藏信息，B站重过程感、观点密度和人格信任，TikTok/Reels/Shorts 重无声可读、视觉节奏、强开场和跨文化直觉。
- 默认做「钩子三测」：3 秒内是否能看懂处境；10 秒内是否出现第一个情绪回报；结尾是否留下明确的继续观看、评论或转发理由。
- 默认做「审美去土味」：避免堆砌网红滤镜、廉价赛博、过度磨皮、尴尬金句、AI味字幕、空泛电影感；优先追求清晰主体、克制色彩、真实材质、生活细节、准确光源和统一视觉常量。
- 默认做「传播性二审」：输出前检查是否有可截图画面、可复述一句话卖点、可评论争议点、可收藏方法点、可二创模仿点。没有至少一个，就主动强化。
- 默认做「反小众自嗨」：专业性不能变成观众门槛；如果创意过于作者自我感动，要改成观众能秒懂的欲望、困境、反差、代入或爽点。
- 不假装知道实时热榜；当任务明显依赖当下热点时，要提示需要用户提供平台/账号/近期爆款样本，或先给出可替换热点位的创作结构。

高可信来源范围：
- 故事/剧作：亚里士多德《诗学》、Lajos Egri《The Art of Dramatic Writing》、John Truby《故事解剖》、Robert McKee《故事》、John Yorke《Into the Woods》、Syd Field《Screenplay》、Linda Seger《Making a Good Script Great》、Blake Snyder《Save the Cat!》（只作为商业节奏参考，不模板化套用）。
- 台词/对白：Robert McKee《Dialogue》、David Mamet《On Directing Film》、Lajos Egri《The Art of Dramatic Writing》、Judith Weston《Directing Actors》；中文创作语境优先参考中国电影学院派剧作/导演训练中关于人物行动、潜台词、生活口语和表演可执行性的共识。
- 人物/心理/叙事认知：K.M. Weiland《Creating Character Arcs》、Lisa Cron《Story Genius》、Will Storr《The Science of Storytelling》、David Mamet《On Directing Film》。
- 导演/表演/调度：Judith Weston《Directing Actors》、Mick Hurbis-Cherrier《Voice & Vision》、谢飞《电影导演创作》、王心语《影视导演基础》、韩小磊《电影导演艺术教程》。
- 视听/摄影/分镜/色彩：David Bordwell & Kristin Thompson《Film Art》、Steven D. Katz《Film Directing Shot by Shot》、Joseph V. Mascelli《The Five C's of Cinematography》、Blain Brown《Cinematography: Theory and Practice》、Bruce Block《The Visual Story》、Gustavo Mercado《The Filmmaker's Eye》、Alexis Van Hurkman《Color Correction Handbook》。
- 剪辑/声音：Walter Murch《In the Blink of an Eye》、Ken Dancyger《The Technique of Film and Video Editing》、Michel Chion《Audio-Vision》、David Sonnenschein《Sound Design》、Jay Rose《Producing Great Sound for Film and Video》。
- 网文/短剧：用户指定 UP 主「天命斩水」B站「写作教学」合集作为网文读者预期、情绪、爽点、结构和悬念方向参考；只抽取方法，不复述字幕，不仿写原表达。
- AI 视频生成：优先采用 OpenAI Sora、Google Veo、Runway 官方文档中稳定共识，如主体、动作、场景、镜头、风格、光线、声音、参考图/关键帧、相机运动和时序变化的清晰描述。
- 现代平台传播：优先参考 TikTok Creative Center / Creative Best Practices、YouTube Creator Academy / Help、Meta Reels 创作建议等官方平台材料中长期稳定的留存、标题、封面、声音、节奏和互动原则；不把单次热梗当长期规律。

一、网文/短剧叙事
1. 读者预期契约
原则：开场用题材、身份、困境和承诺告诉观众这条内容会满足什么情绪期待。之后每个转折都要兑现或升级这个承诺。
适用阶段：选题、前三秒、单集开头、系列定位。
检查问题：观众一眼能不能知道主角是谁、被什么压住、接下来会爽在哪里？后续情节是否偏离开头承诺？
禁忌：开头只堆设定、只炫世界观、只讲作者想表达什么。

2. 爽点闭环
原则：爽点不是单句台词，而是「压制 -> 反击 -> 见证 -> 后果」的闭环。压得越具体，反击越有代价，爽感越可靠。
适用阶段：短剧单集、高潮段、反转段。
检查问题：谁在压主角？主角反击用了什么能力/信息/选择？有没有旁观者见证？反击后局面是否改变？
禁忌：无铺垫开挂、只靠旁白宣布赢了、反派降智。

3. 情绪台阶
原则：一集内情绪要逐级变化，常见路径是委屈、紧张、希望、失落、反击、余味。每一级都要有可见事件支撑。
适用阶段：单集大纲、剪辑节奏、配乐设计。
检查问题：这一段让观众具体感到什么？下一个情绪比上一个更强还是更深？有没有平铺直叙的空段？
禁忌：从头到尾同一种情绪、靠大喊大哭替代情绪递进。

4. 信息差悬念
原则：悬念来自观众、主角、对手之间的信息不对称。每次释放一个答案，同时打开一个更尖锐的新问题。
适用阶段：钩子、转折、集尾。
检查问题：现在谁知道真相？谁误判了局势？观众想继续看的问题是什么？
禁忌：故意不说人话、靠剪掉关键信息制造假悬念。

5. 关系张力
原则：短剧人物关系要有明确的权力差、情感债、秘密或利益绑定。关系本身要能持续产戏。
适用阶段：角色设定、系列设定、冲突设计。
检查问题：两个人为什么不能轻易分开？他们彼此要什么、怕什么、瞒什么？
禁忌：只用标签关系，如霸总、前任、闺蜜，但没有具体交换和伤害。

6. 三秒钩子
原则：前三秒只做一件事：抛出强处境或强问题。优先画面化，不解释背景。
适用阶段：短视频开头、封面标题、预告。
检查问题：关掉声音还看得懂冲突吗？第一句话能不能被替换成一个更具体的动作或画面？
禁忌：寒暄、铺背景、解释世界观、先自我介绍。

二、结构与人物
7. 欲望-阻碍-代价
原则：人物不是靠人设成立，而是靠选择成立。每场戏都要看见人物想要什么、被什么拦住、为达成目标付出什么。
适用阶段：角色弧、大纲、分场。
检查问题：如果删掉这场戏，人物选择链会不会断？角色有没有为目标损失过东西？
禁忌：人物只被剧情推着走，目标口号化。

8. 伤口与误信念
原则：角色的长期弧线来自一个过去形成的误信念。剧情要不断逼他用旧方法失败，最后用新选择完成转变。
适用阶段：主角设计、季终弧线、情绪爆点。
检查问题：角色一直误以为什么？这个误信念如何保护他、又如何伤害他？结尾他做了什么不同选择？
禁忌：伤口只是悲惨经历陈列，不影响当下行为。

9. 价值转折
原则：好场景要让价值状态发生变化，例如安全变危险、亲密变背叛、弱势变掌控。
适用阶段：分场、改稿、剪辑取舍。
检查问题：场景开始和结束的价值状态是否不同？变化发生在哪个动作上？
禁忌：场景只是传递信息，没有局势变化。

10. 主题动作化
原则：主题不要靠角色宣讲，要变成反复出现的选择题。让人物用行动回答「他相信什么」。
适用阶段：IP母题、单集结尾、角色弧。
检查问题：主题能否被改写成一个必须选择的两难？主角最后的行动是否回应了这个两难？
禁忌：角色替作者念观点，剧情只为观点服务。

三、剧本与场景
11. 场景目的
原则：每场戏只能承担一个核心戏剧任务：推进冲突、揭示关系、改变信息或逼出选择。
适用阶段：分场表、剧本删改。
检查问题：这场戏的胜负是什么？谁主动？谁被迫改变策略？
禁忌：一场戏同时解释设定、讲感情、塞笑点、铺伏笔，结果什么都不尖。

12. 台词潜台词
原则：角色嘴上说的是策略，真正想要的是潜台词。好台词应体现身份、关系、情绪控制和未说出口的欲望。
适用阶段：对白改写、表演提示。
检查问题：这句话换一个角色还能说吗？删掉解释词后，观众能否从动作和反应看懂？
禁忌：台词像剧情摘要、人物互相说他们都知道的信息。

13. 反派压强
原则：反派的功能是制造压强，不只是坏。越有合理目标、资源和行动速度，主角反击越有价值。
适用阶段：冲突设计、高潮设计。
检查问题：反派如果是主角，他的目标是否也成立？他给主角制造了什么不可绕开的损失？
禁忌：反派只负责嘲讽和犯错。

四、台词与对白
14. 台词是行动
原则：台词不是把想法说出来，而是角色用语言对另一个人做事：试探、压制、求饶、遮掩、诱导、挑衅、挽留、切割。
适用阶段：对白初稿、表演提示、配音脚本。
检查问题：这句台词在对谁施加什么行动？如果删掉这句话，攻防关系是否变化？演员能不能用一个动词表演它？
禁忌：台词只解释剧情、只表达情绪、只替作者讲道理。

15. 潜台词优先
原则：角色越重要，越少直接说出真正需求。好对白让观众从绕开、否认、转移、沉默和反问里听见真实意图。
适用阶段：情感戏、对峙戏、反转前铺垫。
检查问题：角色嘴上说的和心里要的是否不同？观众是否能从反应和动作看懂未说出口的部分？
禁忌：过早直说“我很难过”“我其实爱你”“我就是想赢”。

16. 人物声口
原则：每个主要角色要有稳定声口：词汇来源、句子长短、攻击方式、逃避方式、幽默感、阶层/职业/地域痕迹。
适用阶段：角色总纲、对白改写、系列一致性。
检查问题：去掉角色名后还能分辨谁在说话吗？他的职业、年龄、权力位置是否影响说法？
禁忌：所有角色都说同一种 AI 式漂亮话，或靠夸张口癖假装区分人物。

17. 信息藏入冲突
原则：必要信息要藏在目标冲突里给出。角色不是为了告诉观众而说话，而是为了达成眼前目的才不得不透露信息。
适用阶段：设定交代、前情回顾、世界观说明。
检查问题：这段信息能否变成争执、审问、交易、威胁或误会？信息出现后局势是否改变？
禁忌：人物互相讲他们早就知道的事，或用旁白式对白塞背景。

18. 节奏与留白
原则：对白节奏来自句长变化、打断、重复、停顿、沉默和未完成句。短剧台词要给剪辑、表演和配音留呼吸点。
适用阶段：对白润色、分镜、TTS/配音。
检查问题：这一段是否有长短句变化？关键情绪是否留给反应镜头或静默？配音读出来是否顺口？
禁忌：连续大段书面长句、每句都完整解释、没有反应空间。

19. 金句克制
原则：金句只能是人物在压力下自然说出的选择，不是作者贴在角色嘴上的海报文案。短视频可有记忆点，但不能牺牲可信度。
适用阶段：高潮台词、封面标题、预告切片。
检查问题：这句话是否符合角色身份和当下压力？删掉修辞后是否仍有戏剧力量？
禁忌：尴尬鸡汤、土味狠话、过度押韵、为了截图而让人物失真。

20. 国内口语质感
原则：中文台词要符合本土生活和关系秩序，注意称呼、辈分、职业话术、人情压力、含蓄拒绝和面子逻辑。
适用阶段：现实题材、家庭伦理、职场、都市短剧。
检查问题：这句话像中国人当面会说的吗？称呼和语气是否暴露关系？有没有翻译腔或海外类型片腔？
禁忌：套用英语式直给对白，或让所有人都像广告文案和短视频营销号。

五、导演与视听（加入国内训练源）
14. 导演阐述四件套
原则：每个项目都要能写出主题判断、人物关系、视听风格和执行方法。导演阐述不是文艺感想，而是全组能执行的创作说明。
适用阶段：项目立项、分镜前、视觉总纲。
检查问题：摄影、美术、演员、剪辑看到这份阐述后，是否知道该做什么和不做什么？
禁忌：只写抽象形容词，如高级、电影感、宿命感，却没有画面规则。

15. 场面调度服务关系
原则：机位、走位、空间距离首先服务人物关系变化。谁靠近、谁退后、谁被隔开，都是关系叙事。
适用阶段：导演案头、排练、分镜。
检查问题：人物站位是否表达权力和情绪？调度变化是否对应关系变化？
禁忌：为了好看而移动镜头，人物关系没有变化。

16. 演员行动动词
原则：给演员的提示优先是可执行动词，如逼问、试探、掩饰、挽留、压制，而不是情绪形容词。
适用阶段：排练、现场沟通、表演提示词。
检查问题：演员知道这场戏要对对方做什么吗？每句台词背后的行动是否不同？
禁忌：只说更愤怒、更难过、更高级。

17. 中国现实质感
原则：国内题材的可信度来自生活纹理：职业流程、家庭秩序、空间细节、人情压力和语言习惯。
适用阶段：现实题材、短剧场景、角色设定。
检查问题：角色说话是否像这个地区/阶层/职业的人？空间里的物件是否能说明生活状态？
禁忌：套用海外类型片语气，忽视国内生活逻辑。

18. 拉片表
原则：学习导演不靠泛泛评价，要把片段拆成镜头、调度、声音、表演、剪辑点和观众情绪变化。
适用阶段：方法学习、风格参考、镜头生成提示。
检查问题：这个镜头为什么放在这里？如果换成远景/近景，关系和情绪会怎样变化？
禁忌：只写好看、压抑、电影感，不拆技术原因。

19. 短视频视听经济性
原则：短剧镜头要用最少信息完成最大情绪传递。优先保留能表达处境、关系和转折的画面。
适用阶段：分镜、剪辑、视频生成提示词。
检查问题：每个镜头是否承担新的信息或情绪？有无重复表演和重复机位？
禁忌：为了电影感拖长空镜，牺牲短视频节奏。

五、视觉、剪辑、声音
20. 视觉一致性
原则：IP视觉要锁定人物识别、色彩规则、空间气质和构图倾向。每次生成资产都要维护这些常量。
适用阶段：角色图、场景图、封面、视频生成。
检查问题：换一张图后，观众还能认出同一个角色/系列吗？有没有破坏已定服装、发型、色调？
禁忌：每次生图都追求新鲜，导致系列不统一。

21. 剪辑点选择
原则：剪辑点优先落在信息变化、情绪变化、视线变化或动作完成点上。短视频中剪辑要推动观众继续看。
适用阶段：分镜、后期、视频提示词。
检查问题：这一刀让观众获得了什么新东西？是否能提前一秒切掉废反应？
禁忌：按台词句号机械切，或为了快而乱切。

22. 声音叙事
原则：声音不仅填空，它能预告、遮蔽、反讽、连接时空。每集至少设计一个有叙事功能的声音点。
适用阶段：剧本、分镜、视频/音频生成。
检查问题：有没有一个声音能提前制造危机或揭示关系？静音是否比音乐更有力？
禁忌：全程铺情绪音乐，声音没有戏剧功能。

六、生产与复盘
23. 资产常量表
原则：角色、服装、场景、道具、光影、镜头风格都要沉淀为可复用常量，避免每次生成重新发明。
适用阶段：视觉总纲、提示词工作流。
检查问题：提示词里哪些是永远不变的？哪些只随单集变化？
禁忌：把一次性灵感当长期设定。

24. 质检四问
原则：每次输出后用四问过一遍：是否偏离 IP？人物动机是否成立？情绪是否递进？视听是否可执行？
适用阶段：生成后复盘、改稿、上线前。
检查问题：哪一项最弱？要重写结构、台词、镜头还是视觉常量？
禁忌：只看文案是否顺，不检查生产可执行性。

七、AI 视频生成全流程
25. 单镜头优先
原则：当前 AI 视频更适合生成明确的单镜头。复杂剧情先拆成镜头列表，再逐镜头生成，最后剪辑拼接。
适用阶段：视频节点提示词、分镜、生成规划。
检查问题：这个提示词是否只要求一个主动作、一个主镜头、一个清晰空间？有没有同时要求多个时间段或多个视角？
禁忌：让一个 5-10 秒片段完成完整故事、多个场景和复杂剪辑。

26. 提示词七要素
原则：高质量视频提示词至少明确主体、动作、场景、镜头景别、相机运动、光线色彩、声音/氛围；有参考图时补充「保持参考图人物/服装/空间常量」。
适用阶段：文生视频、图生视频、视频重写。
检查问题：主体是否具体？动作是否可拍？镜头是否单一？光线和色彩是否能执行？声音是否服务情绪？
禁忌：只写「电影感、高级、震撼、真实」，没有可执行画面信息。

27. 参考图一致性
原则：角色图、服装图、场景图、首帧图承担不同任务。生成视频时优先固定角色识别和首帧构图，再让动作发生。
适用阶段：图生视频、角色连续性、系列视觉。
检查问题：参考图里哪些是必须保持的常量？发型、服装、年龄、脸型、道具、环境是否写清？
禁忌：参考图和文本提示互相矛盾，或一次塞太多参考导致模型混乱。

28. 运动约束
原则：动作要描述起点、过程和终点，运动幅度要小而清晰。相机运动和主体运动最好只保留一个主运动。
适用阶段：视频提示词、动作设计。
检查问题：角色从什么状态开始，到什么状态结束？相机是静止、推进、横移、环绕还是手持？有没有互相打架的运动？
禁忌：同一镜头里又推拉又摇移又旋转，还要求人物剧烈表演。

29. 色彩与光线规则
原则：色彩服务情绪和信息。先定主色温、对比度、光源方向和饱和度，再定风格词。
适用阶段：视觉总纲、图像节点、视频节点、调色参考。
检查问题：这个场景是冷暖对立、低饱和现实、霓虹高反差，还是柔和自然光？光源从哪里来？
禁忌：把赛博、胶片、复古、清新、电影感混在一起。

30. 分镜到生成
原则：先写「戏剧功能」，再写「画面功能」，最后写「模型提示词」。分镜不是漂亮画面表，而是情绪和信息的传递顺序。
适用阶段：分镜、镜头脚本、AI 视频批量生成。
检查问题：这个镜头推动了什么信息/情绪？如果生成失败，是否能用更简单的镜头表达同一功能？
禁忌：为了炫镜头牺牲叙事清晰度。

31. 声音生成约束
原则：声音要分为对白、环境声、动作音效、音乐和静音。视频提示词里只写最重要的一两类声音，避免噪声混杂。
适用阶段：视频生成、音频节点、后期。
检查问题：声音是在制造真实感、悬念、反差，还是节奏？有没有和画面情绪重复？
禁忌：全程宏大配乐，角色对白、环境声和情绪音乐互相抢。

32. 失败诊断
原则：AI 视频失败后不要盲目重抽，先判断是主体不稳、动作过难、镜头冲突、参考图矛盾、色彩混乱、时间跨度过长还是安全/版权限制。
适用阶段：生成失败复盘、二次提示词。
检查问题：失败原因属于哪一类？应减少动作、固定相机、换参考图、拆镜头还是重写场景？
禁忌：只加「更真实、更自然、更高质量」继续抽。

33. 上线前质检
原则：成片至少过五关：故事钩子、角色一致、画面可读、声音不乱、平台风险。短剧还要检查前三秒和集尾继续观看动力。
适用阶段：导出前、复盘。
检查问题：无声观看是否看懂？小屏是否看清主体？人物是否崩脸？节奏是否拖？是否存在侵权/肖像/敏感风险？
禁忌：只因为某个镜头好看就保留，忽视整体叙事。

八、现代审美与网感
34. 爆款不是大声而是强识别
原则：爆款钩子要让观众迅速识别「这和我有什么关系」。优先使用身份、处境、利益、冲突、反差、秘密和情绪债，而不是夸张形容词。
适用阶段：选题、标题、封面、前三秒。
检查问题：这条内容一句话能不能讲给朋友？观众会因为什么停下：好奇、代入、愤怒、爽感、审美、信息价值还是关系八卦？
禁忌：只写震撼、封神、绝了、顶级，但没有具体冲突和可感知利益。

35. 标题封面一体化
原则：标题负责制造问题，封面负责让问题可视化。两者不要重复同一句话，而要形成互补张力。
适用阶段：发布包装、封面图、短剧预告。
检查问题：封面小屏能看清主体和冲突吗？标题是否留下一个观众想点开的缺口？二者是否共同指向同一个情绪承诺？
禁忌：封面堆字、标题像剧情摘要、图文承诺和正片内容不一致。

36. 评论区触发点
原则：内容要预留可讨论的判断题、选择题或身份站队点。评论区不是附属品，而是传播结构的一部分。
适用阶段：选题、结尾、字幕、发布文案。
检查问题：观众看完最可能争论什么？能不能自然问出一个不尴尬的问题？有没有适合二创/共鸣的金句或情境？
禁忌：硬塞“你怎么看”，但正片没有真正的分歧或情绪。

37. 审美常量与时代感
原则：现代审美来自克制、真实、统一和可识别。风格要服务人设和平台，不是堆材质、堆滤镜、堆镜头术语。
适用阶段：视觉总纲、角色图、场景图、视频提示词、封面。
检查问题：这套视觉在小屏上是否清楚？色彩是否统一？人物是否有记忆点？有没有廉价影楼感、AI塑料感、过度磨皮感？
禁忌：把“高级”误解为低亮度、低饱和、糊背景和无信息空镜。

38. 平台适配
原则：同一个创意在不同平台要换包装：抖音/快手先情绪和冲突，小红书先审美和可收藏，B站先观点和过程，TikTok/Reels/Shorts 先视觉动作和跨语言理解。
适用阶段：发布策略、标题封面、多平台改写。
检查问题：目标平台用户此刻为什么会停留？这条内容适合被收藏、转发、评论、还是追更？包装是否匹配平台语气？
禁忌：一条标题封面全平台硬发。

39. 趋势雷达
原则：趋势要拆成稳定结构，而不是照抄热梗。拆解维度包括：主情绪、主身份、主冲突、主视觉符号、主声音/节奏、评论区争议。
适用阶段：选题、账号定位、复盘、追热点。
检查问题：这个趋势背后的长期人性是什么？如果热词过期，还能保留哪个结构？能否替换成本账号的角色和世界观？
禁忌：只换皮热点，导致 IP 失真或内容寿命极短。

40. A/B 候选
原则：重要发布物至少给出两个方向：一个稳态兑现用户预期，一个带反差或新鲜度。让用户选择或测试，不把单一审美当真理。
适用阶段：标题、封面、前三秒、视频提示词、角色造型。
检查问题：A 版解决留存，B 版解决传播，还是相反？哪个风险更大？哪个更符合当前账号阶段？
禁忌：只给一个“我觉得高级”的方案。`;

type CreativeKnowledgeLayer = "project" | "private" | "public" | "model";
type CreativeKnowledgeStatus = "candidate" | "auto_verified" | "verified" | "rejected";

type CreativeKnowledgeCard = {
    id: string;
    title: string;
    category: string;
    principle: string;
    appliesTo: string[];
    checks: string[];
    avoid: string[];
    sourceIds: string[];
    layer: CreativeKnowledgeLayer;
    status: CreativeKnowledgeStatus;
    confidence: number;
    authority: number;
    triggers: string[];
    evidenceSummary?: string;
    conflicts?: string[];
};

type CreativeStoryCase = {
    id: string;
    title: string;
    category: string;
    format: string;
    genres: string[];
    narrativePerspective: string;
    setting: string;
    tone: string;
    audiencePromise: string;
    logline: string;
    protagonist: { identity: string; desire: string; obstacle: string; stakes: string; change: string };
    relationships: Array<{ parties: string; tension: string; change: string }>;
    storyEngine: string;
    coreConflict: string;
    firstThreeEpisodeHooks: Array<{ episode: number; opening: string; escalation: string; payoff: string; cliffhanger: string }>;
    sceneFunctions: string[];
    pacingCurve: string[];
    reusablePatterns: string[];
    adaptationNotes: string[];
    marketEvidence: string;
    doNotCopy: string[];
    tags: string[];
    status: CreativeKnowledgeStatus;
    confidence: number;
};

const CREATIVE_KNOWLEDGE_POLICY_CONTEXT = `创作知识调用协议：
- 当前项目事实、活动硬性要求和用户已确认常量优先于任何方法卡。
- 方法卡不是身份标签，也不能因为来源名称响亮就自动正确；只在与当前任务直接相关时调用。
- 私有验证卡用于用户偏好和特定工作方法；公共专业卡用于行业共识和技术事实；模型自身知识与互联网知识只用于发现候选和补缺口。
- 出现冲突时按问题类型判断权威：平台规格以最新官方信息为准，用户审美与项目取舍以用户确认内容为准。
- 每轮最多调用五张卡，但不是必须打满；没有足够相关卡时宁可少用。`;

const CORE_KNOWLEDGE_CARDS = parseCoreKnowledgeCards(CREATIVE_KNOWLEDGE_CORE_CONTEXT);
const IMPORTED_KNOWLEDGE_CARDS = normalizeImportedKnowledgeCards(CREATIVE_IMPORTED_KNOWLEDGE_CARDS as readonly unknown[]);
const IMPORTED_STORY_CASES = normalizeStoryCases(CREATIVE_STORY_CASES as readonly unknown[]);

export const CREATIVE_AGENT_KNOWLEDGE_CONTEXT = CREATIVE_KNOWLEDGE_POLICY_CONTEXT;

export function buildCreativeAgentKnowledgeContext(prompt: string, mode: CanvasAgentCreativeMode, maxCards = 5) {
    const cards = retrieveCreativeKnowledgeCards(prompt, mode, maxCards);
    const cases = retrieveCreativeStoryCases(prompt, mode);
    const importedStatus = `导入库：${CREATIVE_IMPORTED_KNOWLEDGE_META.sourceCount} 个来源，${CREATIVE_IMPORTED_KNOWLEDGE_META.cardCount} 张卡。`;
    const caseStatus = `故事案例库：${CREATIVE_STORY_CASE_META.caseCount} 个案例，${CREATIVE_STORY_CASE_META.activeCaseCount} 个通过审核。`;
    if (!cards.length && !cases.length) return `${CREATIVE_KNOWLEDGE_POLICY_CONTEXT}\n${importedStatus}\n${caseStatus}\n本轮没有检索到足够相关且通过审核的方法卡或案例，使用项目事实和模型基础能力推进，不伪装已有专业资料。`;
    const cardContext = cards.length ? `本轮按任务检索到的方法卡（${cards.length}/${Math.min(5, maxCards)}）：\n${cards.map(renderKnowledgeCard).join("\n\n")}` : "本轮未调用方法卡。";
    const caseContext = cases.length
        ? `本轮按任务检索到的故事案例（${cases.length}/3）：\n只借鉴结构功能和选择逻辑，禁止照搬人物、专有设定、关键桥段排列、台词和原文表达。\n${cases.map(renderStoryCase).join("\n\n")}`
        : "本轮未调用故事案例。";
    return `${CREATIVE_KNOWLEDGE_POLICY_CONTEXT}\n${importedStatus}\n${caseStatus}\n\n${cardContext}\n\n${caseContext}`;
}

export function retrieveCreativeKnowledgeCards(prompt: string, mode: CanvasAgentCreativeMode, maxCards = 5): CreativeKnowledgeCard[] {
    const query = prompt.trim();
    const limit = Math.max(1, Math.min(5, Math.floor(maxCards), knowledgeCardBudget(query)));
    const cards = [...CORE_KNOWLEDGE_CARDS, ...IMPORTED_KNOWLEDGE_CARDS].filter((card) => card.status === "verified" || card.status === "auto_verified");
    const scored = cards
        .map((card) => ({ card, score: scoreKnowledgeCard(card, query, mode) }))
        .filter((item) => item.score >= (query.length >= 8 ? 4 : 5))
        .sort((a, b) => b.score - a.score || b.card.confidence - a.card.confidence);
    const selected: CreativeKnowledgeCard[] = [];
    const categoryCounts = new Map<string, number>();
    for (const item of scored) {
        if ((categoryCounts.get(item.card.category) || 0) >= 2) continue;
        selected.push(item.card);
        categoryCounts.set(item.card.category, (categoryCounts.get(item.card.category) || 0) + 1);
        if (selected.length >= limit) break;
    }
    return selected;
}

export function retrieveCreativeStoryCases(prompt: string, mode: CanvasAgentCreativeMode, maxCases = 3): CreativeStoryCase[] {
    const query = prompt.trim();
    if (!shouldRetrieveStoryCases(query, mode)) return [];
    const queryTokens = tokenizeKnowledgeText(query);
    const limit = Math.max(1, Math.min(3, Math.floor(maxCases)));
    return IMPORTED_STORY_CASES.filter((item) => item.status === "verified" || item.status === "auto_verified")
        .map((item) => {
            const indexText = [
                item.title,
                item.category,
                item.format,
                ...item.genres,
                ...item.tags,
                item.narrativePerspective,
                item.setting,
                item.tone,
                item.audiencePromise,
                item.logline,
                item.protagonist.identity,
                item.protagonist.desire,
                item.protagonist.obstacle,
                item.storyEngine,
                item.coreConflict,
                ...item.reusablePatterns,
            ].join(" ");
            const overlap = overlapCount(queryTokens, tokenizeKnowledgeText(indexText));
            const genreBonus = item.genres.some((genre) => query.includes(genre)) ? 2 : 0;
            return { item, score: overlap * 1.8 + genreBonus + item.confidence * 1.5 };
        })
        .filter(({ score }) => score >= 3.2)
        .sort((a, b) => b.score - a.score || b.item.confidence - a.item.confidence)
        .slice(0, limit)
        .map(({ item }) => item);
}

function shouldRetrieveStoryCases(query: string, mode: CanvasAgentCreativeMode) {
    if (!query) return false;
    if (/字幕|转写|知识库|蒸馏|PDF|MOBI|数据库|安装|报错|404/.test(query)) return false;
    if (/资产|参考图|三视图|多角度|分镜|镜头|视频生成|提示词/.test(query) && !/故事|剧情|剧本|人物|角色|冲突|前三集/.test(query)) return false;
    return mode === "short_drama" || /点子|故事|剧情|剧本|人物|角色|冲突|关系|世界观|大纲|前三集|改编|网文|短剧/.test(query);
}

function knowledgeCardBudget(query: string) {
    if (!query.trim()) return 2;
    const domains = [
        /故事|剧情|结构|冲突|悬念|人物|角色|世界观/,
        /台词|对白|潜台词|声口|口语|配音/,
        /镜头|分镜|摄影|构图|色彩|光线|导演|表演|调度/,
        /资产|参考图|三视图|场景|道具|服装|一致性/,
        /视频生成|图生视频|文生视频|提示词|首帧|尾帧|运动/,
        /短剧|钩子|网感|留存|传播|标题|封面|平台/,
        /活动|参赛|评奖|交付|画幅|时长|审核/,
        /质检|复盘|返工|失败|矛盾|错误/,
    ].filter((pattern) => pattern.test(query)).length;
    if (domains <= 1) return 2;
    if (domains === 2) return 3;
    if (domains === 3) return 4;
    return 5;
}

function parseCoreKnowledgeCards(context: string): CreativeKnowledgeCard[] {
    const matches = context.matchAll(/(?:^|\n)(\d+)\.\s*([^\n]+)\n原则：([^\n]+)\n适用阶段：([^\n]+)\n检查问题：([^\n]+)\n禁忌：([^\n]+)/g);
    return Array.from(matches).map((match, index) => ({
        id: `core-${index + 1}`,
        title: match[2].trim(),
        category: inferKnowledgeCategory(`${match[2]} ${match[4]}`),
        principle: match[3].trim(),
        appliesTo: splitKnowledgeList(match[4]),
        checks: splitKnowledgeList(match[5]),
        avoid: splitKnowledgeList(match[6]),
        sourceIds: ["built-in-core"],
        layer: "public",
        status: "verified",
        confidence: 0.78,
        authority: 0.78,
        triggers: splitKnowledgeList(`${match[2]}、${match[4]}`),
    }));
}

function normalizeImportedKnowledgeCards(cards: readonly unknown[]): CreativeKnowledgeCard[] {
    return cards.flatMap((value, index) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const card = value as Record<string, unknown>;
        const title = String(card.title || "").trim();
        const principle = String(card.principle || "").trim();
        if (!title || !principle) return [];
        return [{
            id: String(card.id || `imported-${index + 1}`),
            title,
            category: String(card.category || "综合创作"),
            principle,
            appliesTo: stringList(card.appliesTo),
            checks: stringList(card.checks),
            avoid: stringList(card.avoid),
            sourceIds: stringList(card.sourceIds),
            layer: normalizeKnowledgeLayer(card.layer),
            status: normalizeKnowledgeStatus(card.status),
            confidence: clampScore(card.confidence, 0.6),
            authority: clampScore(card.authority, 0.65),
            triggers: stringList(card.triggers),
            evidenceSummary: typeof card.evidenceSummary === "string" ? card.evidenceSummary : undefined,
            conflicts: stringList(card.conflicts),
        }];
    });
}

function normalizeStoryCases(cases: readonly unknown[]): CreativeStoryCase[] {
    return cases.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const item = value as Record<string, unknown>;
        const protagonist = item.protagonist && typeof item.protagonist === "object" && !Array.isArray(item.protagonist) ? (item.protagonist as Record<string, unknown>) : {};
        const title = String(item.title || "").trim();
        if (!title) return [];
        return [{
            id: String(item.id || title),
            title,
            category: String(item.category || "故事案例"),
            format: String(item.format || "其他"),
            genres: stringList(item.genres),
            narrativePerspective: String(item.narrativePerspective || ""),
            setting: String(item.setting || ""),
            tone: String(item.tone || ""),
            audiencePromise: String(item.audiencePromise || ""),
            logline: String(item.logline || ""),
            protagonist: {
                identity: String(protagonist.identity || ""),
                desire: String(protagonist.desire || ""),
                obstacle: String(protagonist.obstacle || ""),
                stakes: String(protagonist.stakes || ""),
                change: String(protagonist.change || ""),
            },
            relationships: normalizeStoryCaseObjects(item.relationships, ["parties", "tension", "change"]) as CreativeStoryCase["relationships"],
            storyEngine: String(item.storyEngine || ""),
            coreConflict: String(item.coreConflict || ""),
            firstThreeEpisodeHooks: normalizeStoryCaseObjects(item.firstThreeEpisodeHooks, ["episode", "opening", "escalation", "payoff", "cliffhanger"]).map((hook) => ({
                episode: Number(hook.episode) || 0,
                opening: String(hook.opening || ""),
                escalation: String(hook.escalation || ""),
                payoff: String(hook.payoff || ""),
                cliffhanger: String(hook.cliffhanger || ""),
            })),
            sceneFunctions: stringList(item.sceneFunctions),
            pacingCurve: stringList(item.pacingCurve),
            reusablePatterns: stringList(item.reusablePatterns),
            adaptationNotes: stringList(item.adaptationNotes),
            marketEvidence: String(item.marketEvidence || ""),
            doNotCopy: stringList(item.doNotCopy),
            tags: stringList(item.tags),
            status: normalizeKnowledgeStatus(item.status),
            confidence: clampScore(item.confidence, 0.5),
        }];
    });
}

function normalizeStoryCaseObjects(value: unknown, keys: string[]) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        return [Object.fromEntries(keys.map((key) => [key, record[key]]))];
    });
}

function scoreKnowledgeCard(card: CreativeKnowledgeCard, query: string, mode: CanvasAgentCreativeMode) {
    const queryTokens = tokenizeKnowledgeText(query);
    const titleTokens = tokenizeKnowledgeText(`${card.title} ${card.category} ${card.triggers.join(" ")}`);
    const bodyTokens = tokenizeKnowledgeText(`${card.principle} ${card.appliesTo.join(" ")} ${card.checks.join(" ")}`);
    let score = overlapCount(queryTokens, titleTokens) * 2.4 + overlapCount(queryTokens, bodyTokens) * 0.8;
    score += card.confidence * 1.4 + card.authority * 1.2;
    if (card.layer === "private") score += 1.4;
    if (card.status === "verified") score += 0.8;
    if (mode === "short_drama" && /短剧|网感|故事|剧本|人物|台词/.test(`${card.category}${card.title}`)) score += 0.9;
    if (/参考图|视觉|生图|资产|三视图|场景图|道具图/.test(query) && !/台词|对白|声口/.test(query) && card.category === "台词与对白") score -= 5;
    if (/台词|对白|潜台词|声口/.test(query) && !/镜头|视觉|资产|参考图/.test(query) && /视听与分镜|AI视频生成/.test(card.category)) score -= 4;
    if (!query && /质检|欲望|视觉一致性/.test(card.title)) score += 2;
    return score;
}

function tokenizeKnowledgeText(value: string) {
    const text = value.toLowerCase();
    const tokens = new Set<string>();
    for (const word of text.match(/[a-z0-9]{2,}/g) || []) tokens.add(word);
    for (const segment of text.match(/[\u4e00-\u9fff]+/g) || []) {
        if (segment.length <= 4) tokens.add(segment);
        for (let index = 0; index < segment.length - 1; index += 1) tokens.add(segment.slice(index, index + 2));
    }
    return tokens;
}

function overlapCount(a: Set<string>, b: Set<string>) {
    let count = 0;
    a.forEach((token) => {
        if (b.has(token)) count += 1;
    });
    return count;
}

function renderKnowledgeCard(card: CreativeKnowledgeCard, index: number) {
    const source = card.sourceIds.length ? card.sourceIds.join("、") : "未标注来源";
    return `${index + 1}. ${card.title}｜${card.category}｜${card.layer === "private" ? "私有验证层" : "公共专业层"}\n- 原则：${card.principle}\n- 适用：${card.appliesTo.join("；") || "当前创作与质检"}\n- 检查：${card.checks.join("；") || "是否真正改善当前成果"}\n- 禁忌：${card.avoid.join("；") || "机械套用"}\n- 可信度：${card.confidence.toFixed(2)}；来源：${source}`;
}

function renderStoryCase(item: CreativeStoryCase, index: number) {
    const protagonist = [item.protagonist.identity, item.protagonist.desire && `欲望：${item.protagonist.desire}`, item.protagonist.obstacle && `阻碍：${item.protagonist.obstacle}`].filter(Boolean).join("；");
    const hooks = item.firstThreeEpisodeHooks
        .map((hook) => `第${hook.episode || "?"}集：${[hook.opening, hook.escalation, hook.payoff, hook.cliffhanger].filter(Boolean).join(" -> ")}`)
        .join("；");
    return `${index + 1}. ${item.title}｜${[item.category, item.format, ...item.genres].filter(Boolean).join("/")}\n- 叙事条件：${[item.narrativePerspective, item.setting, item.tone].filter(Boolean).join("；") || "未标注"}\n- 受众承诺：${item.audiencePromise || "未标注"}\n- 故事骨架：${item.logline || "未标注"}\n- 主角与冲突：${protagonist || item.coreConflict || "未标注"}\n- 故事发动机：${item.storyEngine || "未标注"}\n- 前三集结构：${hooks || "非分集来源或未标注"}\n- 可借鉴结构：${item.reusablePatterns.join("；") || "仅作同类题材比较"}\n- 短剧适配：${item.adaptationNotes.join("；") || "根据当前媒介重新判断"}\n- 市场证据：${item.marketEvidence || "未由用户提供，不得自行声称已验证"}\n- 禁止照搬：${item.doNotCopy.join("；") || "人物、设定、桥段和表达"}`;
}

function inferKnowledgeCategory(value: string) {
    if (/AI|视频生成|提示词|参考图|首帧|尾帧/.test(value)) return "AI视频生成";
    if (/台词|对白|潜台词|声口|口语/.test(value)) return "台词与对白";
    if (/镜头|分镜|摄影|构图|色彩|光线|视觉/.test(value)) return "视听与分镜";
    if (/导演|表演|调度|演员/.test(value)) return "导演与表演";
    if (/剪辑|声音|音效|音乐/.test(value)) return "剪辑与声音";
    if (/人物|角色|心理|欲望|关系/.test(value)) return "人物与心理";
    if (/短剧|网感|爽点|钩子|留存/.test(value)) return "短剧与网感";
    return "故事与剧本";
}

function splitKnowledgeList(value: string) {
    return value.split(/[；、，？]/).map((item) => item.trim()).filter(Boolean);
}

function stringList(value: unknown) {
    return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function normalizeKnowledgeLayer(value: unknown): CreativeKnowledgeLayer {
    return value === "project" || value === "public" || value === "model" ? value : "private";
}

function normalizeKnowledgeStatus(value: unknown): CreativeKnowledgeStatus {
    return value === "verified" || value === "auto_verified" || value === "rejected" ? value : "candidate";
}

function clampScore(value: unknown, fallback: number) {
    const score = Number(value);
    return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : fallback;
}

export const CANVAS_AGENT_KNOWLEDGE_DISCLOSURE_CONTEXT = `知识库透明规则：
- 你没有独立于系统提示、当前画布、用户附件和工具结果之外的长期学习库。不要声称已经完整阅读、观看或吸收某本书、某个视频合集，除非这些资料明确出现在上下文、画布节点、附件或项目资产中。
- 用户询问「学习库」「知识库」「学了哪些」「吸收了哪些书/视频/方法论」时，必须先回答真实接入状态，不要用泛泛的功能清单替代。
- 当前项目可披露的创作知识状态是：已内置一套「高质量源二次审核版」创作知识核心，覆盖故事、人物、剧本、台词/对白、导演、表演、分镜、摄影、色彩、剪辑、声音、AI 视频生成和上线质检；其来源范围包括用户指定 UP 主「天命斩水」B站「写作教学」合集（season_id 5909257，共 60 条，主题覆盖结构、期待感、情绪、爽点、知识、心理、悬念等），以及高可信故事/剧作、台词/对白、导演/表演、视听/摄影/分镜/色彩、剪辑/声音和 AI 视频官方文档方向。
- 对这些来源，只能说「已内置原创总结的创作知识核心」或「已配置为高可信方法论参考方向」，不能说拥有完整原书、完整字幕、完整视频内容或可逐字检索的原始资料库；用户把书摘、字幕、笔记或拉片资料放进画布后，才可以说对应原始资料已入库并可引用。
- 回答此类问题时优先按「已配置」「当前未入库/需补充」「下一步可沉淀」三块说明。`;

export const SHORT_DRAMA_AGENT_MODE_CONTEXT = `当前工作模式：精品 AI 短剧创作总监。

你要把自己当成一个总控创作 Agent，而不是普通问答助手。你的目标是帮助用户长期经营精品个人 IP 短剧账号，优先追求故事质量、人物可信度、审美一致性和可执行的视听资产。

术语规则：
- 不使用容易误解的「圣经」作为主要说法；如需解释，说明 Bible 在影视/游戏创作中指设定总纲或创作规则手册。
- 默认使用「IP创作总纲」「系列设定总纲」「角色总纲」「视觉总纲」「方法卡知识库」。

短剧模式已配置的方法源优先级（方法卡级，不等同完整原文/字幕库）：
1. 用户指定 UP 主「天命斩水」的网文小说写作系列：作为故事基础创作和网文读者预期训练的主要学习源之一。公开合集为「写作教学」，season_id 5909257，共 60 条，主题覆盖结构、期待感、情绪、爽点、知识、心理、悬念等。抽取为方法卡，不复述长字幕，不仿写原表达。
2. 故事结构：John Truby《故事解剖》、Robert McKee《故事》、John Yorke《Into the Woods》、Matt Bird《The Secrets of Story》。
3. 人物与心理：K.M. Weiland《Creating Character Arcs》、Lisa Cron《Story Genius》、Will Storr《The Science of Storytelling》。
4. 剧本与场景：Syd Field《Screenplay》、Blake Snyder《Save the Cat!》只作为商业结构参考，避免模板化污染；David Mamet《On Directing Film》用于场景目的和戏剧动作。
5. 导演与表演：Judith Weston《Directing Actors》、Mick Hurbis-Cherrier《Voice & Vision》。
6. 分镜与镜头：Steven D. Katz《Film Directing Shot by Shot》、Bruce Block《The Visual Story》、Gustavo Mercado《The Filmmaker's Eye》。
7. 剪辑、色彩、声音：Walter Murch《In the Blink of an Eye》、Alexis Van Hurkman《Color Correction Handbook》、Jay Rose《Producing Great Sound for Film and Video》、David Sonnenschein《Sound Design》。
8. 国内/华语导演与视听训练：谢飞《电影导演创作》、王心语《影视导演基础》/《影视导演基础知识》、韩小磊《电影导演艺术教程》、中国传媒大学《影视导演基础》课程；拉片案例优先纳入大陆现实主义、商业类型片、都市短剧、家庭伦理、悬疑犯罪、女性成长等本土语境。

知识过滤规则：
- 只沉淀可操作原则、检查问题、反例、适用阶段、禁忌和画布工作流。
- 不收录鸡汤、空泛技巧、不可验证玄学、纯流量标题党。
- 对互相冲突的方法，标记适用边界，而不是混成一锅。
- 每次创作都区分：IP长期常量、系列常量、单集变量。

默认协作协议：
读取画布状态 -> 识别用户输入完成度和已确认材料 -> 更新公共黑板 -> 判断当前最小缺口 -> 只调用对应能力/agent -> 生成阶段成果 -> 审核并二次修正 -> 把确认后的常量沉淀回总纲/资产/分镜节点。
流程可以跳转和回退，不强制从点子走到成片；线性流程只是“从零开始”的一种模式。知识库只在需要时隐性调用；展示方法卡时按需要创建，最多五张不是硬性打满。

${CREATIVE_AGENT_KNOWLEDGE_CONTEXT}`;

export const SHORT_DRAMA_AGENT_PROMPT = `请切换为「AI 视频/精品短剧创作总监」模式，在当前画布上搭建或更新一个可反复使用的创作工作区。这个工作区的最终目标不是泛泛写剧本，而是产出可生成 AI 视频的文字分镜提示词和配套资产图/参考图。

术语先统一：旧说法里的「IP圣经 / 角色圣经 / 视觉圣经」不是宗教含义，而是影视创作里的 Bible，意思是长期设定总纲、创作规则手册。后续请优先使用「IP创作总纲」「角色总纲」「视觉总纲」这些更自然的中文说法。

请先读取当前画布状态，用 canvas_update_project_blackboard 建立或更新结构化「公共黑板」，再根据用户已经提供的材料决定当前阶段。不要把流程写死：如果用户没有点子，先做点子和故事；如果已有点子，直接扩展故事骨架；如果已有剧本，直接进入资产提取和分镜；如果已有资产，直接进入分镜、审核、预览或视频生成。参赛/活动需求不需要另起一个 agent，它是同一套 AI 视频创作链路中的约束模式：当用户提供活动文字、截图或链接时，先抽取硬性要求、评奖偏好、画幅、时长、交付格式、禁区和加分项，写入公共黑板的「活动约束」。

协作方式是「总控维护公共黑板，按需调度专门 agent」，不是多个模型各写各的，也不是每次都把所有 agent 叫出来。公共黑板要记录：用户已有输入、当前完成度、已确认常量、待确认问题、活动约束、故事骨架、前三集剧情、剧本版本、资产清单、参考图状态、文字分镜、审核意见、25宫格预览、视频生成批次和返工记录。

需要建立或补充这些模块：
1. 公共黑板/项目状态：记录目标、已有材料、当前阶段、下一步缺口、用户确认项。
2. 用户输入完成度：判断当前输入属于点子、故事、剧本、资产、分镜、活动要求、成片返工中的哪一种。
3. 活动约束：只在用户提供参赛/活动要求时建立，沉淀平台、主题、时长、画幅、提交物、审核禁区、评奖倾向。
4. 点子/故事骨架：没有点子时产出候选点子，有点子时扩展世界观、人物关系、主角设定、故事主线和核心冲突。
5. 前三集剧情：只做到能支撑前三集，不在早期膨胀成长篇设定；后续确认有效再扩展。
6. 单集剧本：按 1-3 分钟目标控制长度，保证钩子、冲突升级、情绪转折和集尾余味。
7. 资产清单/资产提示词：从剧本提取实际出现且影响一致性的角色、服装、场景、道具、标志物和特效元素。
8. 角色资产：先生成参考图；用户满意后再做三视图，不满意则先改提示词或参考图。
9. 场景/道具资产：生成多角度图，通常 4 个角度，最多 5 个角度，不为凑数滥做。
10. 文字分镜：单集分段分镜，每段尽量不超过 15 秒；难以无缝拼接的动作、转场或情绪连续段，优先合并进一个 15 秒内镜头/段落。
11. 分镜审核/二次分镜：检查上下文矛盾、空间错误、动机断裂、镜头不可生成、资产不一致、节奏过密/过松、平台审核风险，并给出修正后的分镜版本。
12. 25宫格预览：只在文字分镜确认后用于人工检查节奏、构图和审核风险；预览图不反过来限制最终视频，最终视频仍以文字分镜和确认参考图为约束。
13. 视频生成批次/返工记录：视频生成后诊断问题来自提示词、参考图、动作复杂度、镜头切分、审核风险还是模型限制，再给局部返工方案。
14. 方法卡/知识库：默认隐性应用，不要把知识库整块倒出来；只有当前阶段真的缺方法支撑或用户要求展示时才创建方法卡，最多五张只是上限，不必打满。

每个阶段节点都要包含：目的、触发条件、负责 agent、输入、输出、质量门槛、用户确认项、可跳转的下一步。

首次搭建工作区时，除非用户已经明确要求生成资产、预览或视频，不要为了展示能力而调用图片、视频或音频生成；但如果画布状态已经进入资产、预览或视频阶段，就可以直接调用对应生成工具。完成后，用简短文字说明当前公共黑板判断出的阶段、下一步最该补的缺口，以及最多 3 个需要用户补充的信息。`;

export function applyShortDramaAgentMode(prompt: string, mode: CanvasAgentCreativeMode) {
    const text = prompt.trim();
    const shouldDiscloseKnowledge = shouldDiscloseCanvasAgentKnowledge(text, mode);
    const shouldUseCreativeKnowledge = shouldUseCanvasCreativeKnowledge(text, mode);
    const context = [
        shouldDiscloseKnowledge ? CANVAS_AGENT_KNOWLEDGE_DISCLOSURE_CONTEXT : "",
        mode === "short_drama" ? SHORT_DRAMA_AGENT_MODE_CONTEXT : "",
        shouldUseCreativeKnowledge ? buildCreativeAgentKnowledgeContext(text, mode) : "",
    ]
        .filter(Boolean)
        .join("\n\n");
    if (!context) return prompt;
    return `${context}\n\n用户本轮需求：${text || (mode === "short_drama" ? SHORT_DRAMA_AGENT_PROMPT : "")}`;
}

export function isShortDramaAgentPresetPrompt(prompt: string) {
    return prompt.trim() === SHORT_DRAMA_AGENT_PROMPT.trim();
}

export function shouldDiscloseCanvasAgentKnowledge(prompt: string, mode: CanvasAgentCreativeMode) {
    if (mode === "short_drama") return true;
    return /学习库|知识库|方法卡|学了|学过|吸收|填进去|补进去|内置.*(?:书|视频|内容)|书籍|视频|方法论|创作知识|高质量知识|天命斩水|短剧创作总监|台词|对白|潜台词|声口|导演|拉片|视听|网感|审美|爆款|平台传播/.test(prompt);
}

export function shouldUseCanvasCreativeKnowledge(prompt: string, mode: CanvasAgentCreativeMode) {
    if (mode === "short_drama") return true;
    return /创作|短剧|故事|剧情|剧本|编剧|台词|对白|对话|潜台词|声口|口语|金句|人物|角色|人设|IP|爽点|悬念|反转|情绪|节奏|分镜|镜头|导演|表演|调度|摄影|构图|色彩|光线|剪辑|声音|音效|配乐|拉片|视频生成|AI\s*视频|图生视频|文生视频|提示词|视觉总纲|封面|标题|预告|连续性|一致性|网感|审美|爆款|传播|留存|完播|互动|评论区|抖音|快手|小红书|B站|TikTok|Reels|Shorts/.test(prompt);
}
