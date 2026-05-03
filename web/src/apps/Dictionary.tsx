import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Search, X, Star, History, Shuffle, BookOpen, ChevronRight,
  Volume2, Bookmark, Trash2, Copy, Check, Sparkles
} from 'lucide-react';

/* ─────────────── types ─────────────── */

interface DictEntry {
  word: string;
  pronunciation: string;
  pos: string; // part of speech
  translation: string;
  definition: string;
  examples: string[];
  category: string;
  isChinese?: boolean;
}

/* ─────────────── 500+ dictionary entries ─────────────── */

const DICTIONARY: DictEntry[] = [
  // ===== Chinese cultural terms =====
  { word: "墨", pronunciation: "mò", pos: "noun", translation: "ink; Chinese ink; writing brush ink", definition: "A black pigment traditionally used in Chinese calligraphy and painting, made from soot and animal glue.", examples: ["笔墨纸砚 — the four treasures of the study", "水墨画 — ink wash painting"], category: "Cultural" },
  { word: "山水", pronunciation: "shān shuǐ", pos: "noun", translation: "mountains and water; landscape painting", definition: "A traditional Chinese painting genre depicting natural landscapes, particularly mountains and water scenes.", examples: ["山水画是中国传统绘画的重要题材。", "Shān shuǐ huà shì Zhōngguó chuántǒng huìhuà de zhòngyào tícái. — Landscape painting is an important subject in traditional Chinese painting."], category: "Cultural" },
  { word: "意境", pronunciation: "yì jìng", pos: "noun", translation: "artistic mood/conception; the mood created in a work of art", definition: "The artistic conception or mood created in a literary or artistic work, a key concept in Chinese aesthetics.", examples: ["这首诗意境深远。", "Zhè shǒu shī yìjìng shēnyuǎn. — This poem has a profound artistic mood."], category: "Cultural" },
  { word: "书法", pronunciation: "shū fǎ", pos: "noun", translation: "calligraphy; the art of writing", definition: "The art of beautiful handwriting, especially the artistic tradition of writing Chinese characters with a brush.", examples: ["他练习书法已有十年。", "Tā liànxí shūfǎ yǐ yǒu shí nián. — He has practiced calligraphy for ten years."], category: "Cultural" },
  { word: "茶道", pronunciation: "chá dào", pos: "noun", translation: "tea ceremony; the way of tea", definition: "The traditional art of preparing and serving tea, emphasizing mindfulness and aesthetic appreciation.", examples: ["茶道不仅是饮茶，更是一种生活美学。", "Chádào bùjǐn shì yǐn chá, gèng shì yì zhǒng shēnghuó měixué. — Tea ceremony is not just about drinking tea, but a philosophy of life."], category: "Cultural" },
  { word: "太极", pronunciation: "tài jí", pos: "noun", translation: "Tai Chi; supreme ultimate", definition: "A Chinese martial art practiced for defense training, health benefits, and meditation, characterized by slow, flowing movements.", examples: ["每天早上他在公园打太极。", "Měitiān zǎoshang tā zài gōngyuán dǎ tàijí. — He practices Tai Chi in the park every morning."], category: "Cultural" },
  { word: "阴阳", pronunciation: "yīn yáng", pos: "noun", translation: "yin and yang; dualism of complementary forces", definition: "A concept in Chinese philosophy describing how seemingly opposite or contrary forces may actually be complementary and interconnected.", examples: ["阴阳是中国哲学的核心概念。", "Yīnyáng shì Zhōngguó zhéxué de héxīn gàiniàn. — Yin and Yang are core concepts of Chinese philosophy."], category: "Cultural" },
  { word: "功夫", pronunciation: "gōng fu", pos: "noun", translation: "kung fu; martial arts; skill", definition: "Chinese martial arts, or more broadly any skill achieved through hard work and practice.", examples: ["他花了很多年学功夫。", "Tā huā le hěn duō nián xué gōngfu. — He spent many years learning kung fu."], category: "Cultural" },
  { word: "风水", pronunciation: "fēng shuǐ", pos: "noun", translation: "feng shui; geomancy", definition: "A traditional Chinese practice of arranging spaces to create balance with the natural world and promote harmony.", examples: ["这座房子的风水很好。", "Zhè zuò fángzi de fēngshuǐ hěn hǎo. — This house has good feng shui."], category: "Cultural" },
  { word: "禅宗", pronunciation: "chán zōng", pos: "noun", translation: "Zen Buddhism; Chan school", definition: "A school of Mahayana Buddhism that originated in China, emphasizing meditation and direct experience of enlightenment.", examples: ["禅宗强调通过冥想获得觉悟。", "Chánzōng qiángdiào tōngguò míngxiǎng huòdé juéwù. — Zen Buddhism emphasizes achieving enlightenment through meditation."], category: "Cultural" },
  { word: "瓷器", pronunciation: "cí qì", pos: "noun", translation: "porcelain; china (ceramics)", definition: "A ceramic material made by heating materials in a kiln, China is famous for its high-quality porcelain.", examples: ["中国瓷器闻名世界。", "Zhōngguó cíqì wénmíng shìjiè. — Chinese porcelain is world-famous."], category: "Cultural" },
  { word: "丝绸", pronunciation: "sī chóu", pos: "noun", translation: "silk", definition: "A fine, strong, soft, lustrous fiber produced by silkworms in making cocoons, for which China was historically famous.", examples: ["丝绸之路连接了东西方。", "Sīchóu zhī lù liánjiē le dōngxī fāng. — The Silk Road connected East and West."], category: "Cultural" },
  { word: "针灸", pronunciation: "zhēn jiǔ", pos: "noun", translation: "acupuncture and moxibustion", definition: "A traditional Chinese medicine treatment involving inserting thin needles into specific points on the body.", examples: ["针灸可以有效缓解疼痛。", "Zhēnjiǔ kěyǐ yǒuxiào huǎnjiě téngtòng. — Acupuncture can effectively relieve pain."], category: "Cultural" },
  { word: "水墨画", pronunciation: "shuǐ mò huà", pos: "noun", translation: "ink wash painting", definition: "A type of Chinese painting that uses black ink, the same as used in Chinese calligraphy, in various concentrations.", examples: ["水墨画讲究留白。", "Shuǐmòhuà jiǎngjiū liúbái. — Ink wash painting emphasizes the use of blank space."], category: "Cultural" },
  { word: "国画", pronunciation: "guó huà", pos: "noun", translation: "traditional Chinese painting", definition: "The traditional style of painting in China, typically using ink and water-based colors on paper or silk.", examples: ["她正在学习国画技巧。", "Tā zhèngzài xuéxí guóhuà jìqiǎo. — She is learning techniques of traditional Chinese painting."], category: "Cultural" },
  { word: "京剧", pronunciation: "jīng jù", pos: "noun", translation: "Peking opera; Beijing opera", definition: "A form of traditional Chinese theatre that combines music, vocal performance, mime, dance, and acrobatics.", examples: ["京剧是中国的国粹。", "Jīngjù shì Zhōngguó de guócuì. — Peking opera is the quintessence of Chinese culture."], category: "Cultural" },
  { word: "围棋", pronunciation: "wéi qí", pos: "noun", translation: "Go (board game)", definition: "An abstract strategy board game for two players in which the aim is to surround more territory than the opponent.", examples: ["围棋起源于中国，已有四千多年历史。", "Wéiqí qǐyuán yú Zhōngguó, yǐ yǒu sìqiān duō nián lìshǐ. — Go originated in China with over four thousand years of history."], category: "Cultural" },
  { word: "气功", pronunciation: "qì gōng", pos: "noun", translation: "qigong; breathing exercise", definition: "A holistic system of coordinated body posture, movement, breathing, and meditation used for health and spirituality.", examples: ["许多老年人早晨在公园练气功。", "Xǔduō lǎoniánrén zǎochén zài gōngyuán liàn qìgōng. — Many elderly people practice qigong in the park in the morning."], category: "Cultural" },
  { word: "成语", pronunciation: "chéng yǔ", pos: "noun", translation: "idiom; set phrase (usually 4 characters)", definition: "A traditional Chinese expression consisting of four characters, often carrying a deeper meaning or allusion.", examples: ["画龙点睛是一个常用的成语。", "Huàlóngdiǎnjīng shì yí ge chángyòng de chéngyǔ. — 'Adding eyes to a painted dragon' is a commonly used idiom."], category: "Cultural" },
  { word: "对联", pronunciation: "duì lián", pos: "noun", translation: "couplet; poetic duet", definition: "A pair of lines of poetry, usually posted on doorways during Chinese New Year, matching in structure and meaning.", examples: ["春节时家家户户贴对联。", "Chūnjié shí jiājiāhùhù tiē duìlián. — During Spring Festival every household posts couplets."], category: "Cultural" },

  // ===== Academic =====
  { word: "serendipity", pronunciation: "/ˌser.ənˈdɪp.ə.ti/", pos: "noun", translation: "意外发现珍奇事物的能力", definition: "The occurrence and development of events by chance in a happy or beneficial way.", examples: ["Finding that rare book in a secondhand store was pure serendipity.", "许多科学发现都源于serendipity。"], category: "Academic" },
  { word: "ephemeral", pronunciation: "/ɪˈfem.ər.əl/", pos: "adjective", translation: "短暂的，朝生暮死的", definition: "Lasting for a very short time; transitory.", examples: ["Fashion trends are often ephemeral.", "The beauty of cherry blossoms is ephemeral."], category: "Academic" },
  { word: "paradigm", pronunciation: "/ˈpær.ə.daɪm/", pos: "noun", translation: "范例；范式；模式", definition: "A typical example or pattern of something; a model or worldview underlying a theory.", examples: ["The discovery caused a paradigm shift in physics.", "We need a new paradigm for understanding this problem."], category: "Academic" },
  { word: "empirical", pronunciation: "/ɪmˈpɪr.ɪ.kəl/", pos: "adjective", translation: "经验主义的；以实验为依据的", definition: "Based on, concerned with, or verifiable by observation or experience rather than theory or pure logic.", examples: ["The theory lacks empirical evidence.", "Scientific research relies on empirical methods."], category: "Academic" },
  { word: "hypothesis", pronunciation: "/haɪˈpɒθ.ə.sɪs/", pos: "noun", translation: "假设；假说", definition: "A supposition or proposed explanation made on the basis of limited evidence as a starting point for further investigation.", examples: ["We tested the hypothesis through a series of experiments.", "Her hypothesis was later confirmed by data."], category: "Academic" },
  { word: "methodology", pronunciation: "/ˌmeθ.əˈdɒl.ə.dʒi/", pos: "noun", translation: "方法论；研究方法", definition: "A system of methods used in a particular area of study or activity.", examples: ["The research methodology was clearly explained.", "We need to improve our teaching methodology."], category: "Academic" },
  { word: "synthesize", pronunciation: "/ˈsɪn.θə.saɪz/", pos: "verb", translation: "综合；合成", definition: "Combine (a number of things) into a coherent whole; produce (a substance) by chemical reaction.", examples: ["The report synthesizes data from multiple studies.", "The body synthesizes vitamin D from sunlight."], category: "Academic" },
  { word: "quantitative", pronunciation: "/ˈkwɒn.tɪ.tə.tɪv/", pos: "adjective", translation: "定量的；数量的", definition: "Relating to, measuring, or measured by the quantity of something rather than its quality.", examples: ["The study uses quantitative analysis methods.", "We need both quantitative and qualitative data."], category: "Academic" },
  { word: "qualitative", pronunciation: "/ˈkwɒl.ɪ.tə.tɪv/", pos: "adjective", translation: "定性的；性质的", definition: "Relating to, measuring, or measured by the quality of something rather than its quantity.", examples: ["Qualitative research provides deeper insights.", "We conducted qualitative interviews with participants."], category: "Academic" },
  { word: "rhetoric", pronunciation: "/ˈret.ər.ɪk/", pos: "noun", translation: "修辞；修辞学；华丽的辞藻", definition: "The art of effective or persuasive speaking or writing; language designed to have a persuasive effect.", examples: ["Political rhetoric often differs from policy reality.", "He studied classical rhetoric at university."], category: "Academic" },
  { word: "thesis", pronunciation: "/ˈθiː.sɪs/", pos: "noun", translation: "论文；论点", definition: "A statement or theory that is put forward as a premise to be maintained or proved; a long essay for a university degree.", examples: ["Her thesis explores climate change effects on coral reefs.", "The main thesis of the book is controversial."], category: "Academic" },
  { word: "discourse", pronunciation: "/ˈdɪs.kɔːs/", pos: "noun", translation: "话语；论述；交谈", definition: "Written or spoken communication or debate; a formal discussion of a subject.", examples: ["The discourse around artificial intelligence is evolving rapidly.", "Academic discourse requires precision and clarity."], category: "Academic" },
  { word: "juxtapose", pronunciation: "/ˌdʒʌk.stəˈpəʊz/", pos: "verb", translation: "并置；并列", definition: "Place or deal with close together for contrasting effect.", examples: ["The artist juxtaposes modern and traditional elements.", "The film juxtaposes comedy with tragedy."], category: "Academic" },
  { word: "ubiquitous", pronunciation: "/juːˈbɪk.wɪ.təs/", pos: "adjective", translation: "无处不在的；普遍存在的", definition: "Present, appearing, or found everywhere.", examples: ["Smartphones have become ubiquitous in modern life.", "Coffee shops are ubiquitous in this city."], category: "Academic" },
  { word: "pragmatic", pronunciation: "/præɡˈmæt.ɪk/", pos: "adjective", translation: "实用的；务实的", definition: "Dealing with things sensibly and realistically in a way that is based on practical considerations.", examples: ["We need a pragmatic approach to this problem.", "She is known for her pragmatic leadership style."], category: "Academic" },
  { word: "nuance", pronunciation: "/ˈnjuː.ɒns/", pos: "noun", translation: "细微差别；微妙之处", definition: "A subtle difference in or shade of meaning, expression, or sound.", examples: ["Understanding cultural nuances is key to effective communication.", "The nuances of his performance were remarkable."], category: "Academic" },
  { word: "coherent", pronunciation: "/kəʊˈhɪə.rənt/", pos: "adjective", translation: "连贯的；一致的；清晰的", definition: "(of an argument, theory, or policy) logical and consistent; forming a unified whole.", examples: ["She presented a coherent argument for the proposal.", "The essay lacks a coherent structure."], category: "Academic" },
  { word: "ambiguous", pronunciation: "/æmˈbɪɡ.ju.əs/", pos: "adjective", translation: "模棱两可的；含糊不清的", definition: "Open to more than one interpretation; having a double meaning; unclear or inexact.", examples: ["The contract contains ambiguous language.", "His response was deliberately ambiguous."], category: "Academic" },
  { word: "deductive", pronunciation: "/dɪˈdʌk.tɪv/", pos: "adjective", translation: "演绎的；推论的", definition: "Reasoning from general principles to specific conclusions; the opposite of inductive reasoning.", examples: ["Deductive reasoning starts with a general premise.", "Sherlock Holmes used deductive reasoning to solve cases."], category: "Academic" },
  { word: "inductive", pronunciation: "/ɪnˈdʌk.tɪv/", pos: "adjective", translation: "归纳的；诱导的", definition: "Reasoning from specific observations to general conclusions; the opposite of deductive reasoning.", examples: ["Scientific discoveries often use inductive reasoning.", "Inductive logic moves from specific examples to general rules."], category: "Academic" },

  // ===== Common / Daily =====
  { word: "gratitude", pronunciation: "/ˈɡræt.ɪ.tjuːd/", pos: "noun", translation: "感激；感恩；感谢", definition: "The quality of being thankful; readiness to show appreciation and return kindness.", examples: ["She expressed her gratitude to everyone who helped.", "Practicing gratitude can improve mental health."], category: "Common" },
  { word: "resilience", pronunciation: "/rɪˈzɪl.i.əns/", pos: "noun", translation: "韧性；恢复力；适应力", definition: "The capacity to recover quickly from difficulties; toughness.", examples: ["Children often show remarkable resilience.", "Building resilience is important for mental health."], category: "Common" },
  { word: "empathy", pronunciation: "/ˈem.pə.θi/", pos: "noun", translation: "共情；同理心", definition: "The ability to understand and share the feelings of another person.", examples: ["Empathy is essential for building strong relationships.", "She showed great empathy toward her friend's situation."], category: "Common" },
  { word: "perspective", pronunciation: "/pəˈspek.tɪv/", pos: "noun", translation: "视角；观点；透视", definition: "A particular attitude toward or way of regarding something; a point of view.", examples: ["Traveling gives you a new perspective on life.", "From my perspective, this is a good decision."], category: "Common" },
  { word: "initiative", pronunciation: "/ɪˈnɪʃ.ə.tɪv/", pos: "noun", translation: "主动性；倡议；积极性", definition: "The ability to assess and act independently; a fresh approach to something.", examples: ["She took the initiative to organize the event.", "The government launched a new environmental initiative."], category: "Common" },
  { word: "integrity", pronunciation: "/ɪnˈteɡ.rə.ti/", pos: "noun", translation: "正直；诚实；完整", definition: "The quality of being honest and having strong moral principles; the state of being whole.", examples: ["He is a man of great integrity.", "The structural integrity of the building was compromised."], category: "Common" },
  { word: "advocate", pronunciation: "/ˈæd.və.keɪt/", pos: "verb/noun", translation: "提倡；拥护；倡导者", definition: "Publicly recommend or support; a person who publicly supports a particular cause.", examples: ["She advocates for children's rights.", "He is a strong advocate of free education."], category: "Common" },
  { word: "compromise", pronunciation: "/ˈkɒm.prə.maɪz/", pos: "noun/verb", translation: "妥协；折中；让步", definition: "An agreement reached by each side making concessions; to settle a dispute by mutual concession.", examples: ["In marriage, you sometimes have to compromise.", "We reached a compromise on the budget."], category: "Common" },
  { word: "advocate", pronunciation: "/ˈæd.və.keɪt/", pos: "verb", translation: "主张；拥护", definition: "To publicly support or recommend a particular cause or policy.", examples: ["She advocates for equal pay for women.", "The organization advocates environmental protection."], category: "Common" },
  { word: "controversial", pronunciation: "/ˌkɒn.trəˈvɜː.ʃəl/", pos: "adjective", translation: "有争议的", definition: "Giving rise or likely to give rise to public disagreement.", examples: ["The new law is highly controversial.", "Climate change remains a controversial topic in some circles."], category: "Common" },
  { word: "phenomenon", pronunciation: "/fɪˈnɒm.ɪ.nən/", pos: "noun", translation: "现象；非凡的人", definition: "A fact or situation that is observed to exist or happen; an remarkable person or thing.", examples: ["The northern lights are a natural phenomenon.", "Global warming is a serious phenomenon."], category: "Common" },
  { word: "consequence", pronunciation: "/ˈkɒn.sɪ.kwəns/", pos: "noun", translation: "结果；后果；影响", definition: "A result or effect of an action or condition; importance.", examples: ["You must face the consequences of your actions.", "The economic consequences were severe."], category: "Common" },
  { word: "opportunity", pronunciation: "/ˌɒp.əˈtjuː.nə.ti/", pos: "noun", translation: "机会；机遇", definition: "A set of circumstances that makes it possible to do something; a favorable moment.", examples: ["This job is a great opportunity for you.", "Don't miss this opportunity."], category: "Common" },
  { word: "accommodate", pronunciation: "/əˈkɒm.ə.deɪt/", pos: "verb", translation: "容纳；适应；提供住宿", definition: "Provide lodging or sufficient space for; fit in with the wishes or needs of.", examples: ["The hotel can accommodate up to 200 guests.", "We must accommodate the needs of all students."], category: "Common" },
  { word: "procrastinate", pronunciation: "/prəˈkræs.tɪ.neɪt/", pos: "verb", translation: "拖延；耽搁", definition: "Delay or postpone action; put off doing something.", examples: ["I tend to procrastinate when facing difficult tasks.", "Stop procrastinating and start working!"], category: "Common" },
  { word: "spontaneous", pronunciation: "/spɒnˈteɪ.ni.əs/", pos: "adjective", translation: "自发的；自然的；一时冲动的", definition: "Performed or occurring as a result of a sudden impulse without premeditation.", examples: ["The audience burst into spontaneous applause.", "We made a spontaneous decision to go to the beach."], category: "Common" },
  { word: "eloquent", pronunciation: "/ˈel.ə.kwənt/", pos: "adjective", translation: "雄辩的；有说服力的", definition: "Fluent or persuasive in speaking or writing; clearly expressing ideas.", examples: ["She gave an eloquent speech about education reform.", "His writing is both eloquent and moving."], category: "Common" },
  { word: "meticulous", pronunciation: "/məˈtɪk.jə.ləs/", pos: "adjective", translation: "一丝不苟的；细致的", definition: "Showing great attention to detail; very careful and precise.", examples: ["He is meticulous about keeping records.", "The painting shows meticulous attention to detail."], category: "Common" },
  { word: "versatile", pronunciation: "/ˈvɜː.sə.taɪl/", pos: "adjective", translation: "多才多艺的；多用途的", definition: "Able to adapt or be adapted to many different functions or activities.", examples: ["She is a versatile actress who can play many roles.", "This tool is incredibly versatile."], category: "Common" },
  { word: "vulnerable", pronunciation: "/ˈvʌl.nər.ə.bəl/", pos: "adjective", translation: "脆弱的；易受伤害的", definition: "Susceptible to physical or emotional attack or harm; in need of special care.", examples: ["The elderly are particularly vulnerable during heatwaves.", "She felt vulnerable sharing her story."], category: "Common" },
  { word: "ambiguous", pronunciation: "/æmˈbɪɡ.ju.əs/", pos: "adjective", translation: "模棱两可的；含糊的", definition: "Open to more than one interpretation; having a double meaning.", examples: ["His instructions were ambiguous and confusing.", "The ending of the movie was deliberately ambiguous."], category: "Common" },
  { word: "sustainable", pronunciation: "/səˈsteɪ.nə.bəl/", pos: "adjective", translation: "可持续的", definition: "Able to be maintained at a certain rate or level; conserving ecological balance.", examples: ["We need to find sustainable energy sources.", "Sustainable development is crucial for our future."], category: "Common" },
  { word: "contemplate", pronunciation: "/ˈkɒn.təm.pleɪt/", pos: "verb", translation: "沉思；考虑；打算", definition: "Look thoughtfully for a long time; think deeply and carefully about.", examples: ["She sat on the hill, contemplating the sunset.", "I need time to contemplate this decision."], category: "Common" },
  { word: "demonstrate", pronunciation: "/ˈdem.ən.streɪt/", pos: "verb", translation: "展示；证明；示威", definition: "Clearly show the existence or truth of; give a practical exhibition.", examples: ["The study demonstrates a clear link between diet and health.", "He demonstrated how to use the software."], category: "Common" },
  { word: "enthusiastic", pronunciation: "/ɪnˌθjuː.ziˈæs.tɪk/", pos: "adjective", translation: "热情的；热心的", definition: "Having or showing intense and eager enjoyment, interest, or approval.", examples: ["The audience was enthusiastic about the performance.", "She is an enthusiastic supporter of the project."], category: "Common" },
  { word: "inevitable", pronunciation: "/ɪˈnev.ɪ.tə.bəl/", pos: "adjective", translation: "不可避免的；必然的", definition: "Certain to happen; unavoidable.", examples: ["Change is inevitable in life.", "The team's victory seemed inevitable."], category: "Common" },
  { word: "contemporary", pronunciation: "/kənˈtem.pər.ər.i/", pos: "adjective", translation: "当代的；现代的", definition: "Belonging to or occurring in the present; following modern ideas or fashions.", examples: ["She enjoys contemporary art.", "The novel is set in contemporary London."], category: "Common" },
  { word: "extraordinary", pronunciation: "/ɪkˈstrɔː.dən.ər.i/", pos: "adjective", translation: "非凡的；特别的", definition: "Very unusual or remarkable; beyond what is ordinary.", examples: ["She has an extraordinary talent for music.", "The view from the summit was extraordinary."], category: "Common" },
  { word: "sophisticated", pronunciation: "/səˈfɪs.tɪ.keɪ.tɪd/", pos: "adjective", translation: "复杂的；精致的；老练的", definition: "Developed to a high degree of complexity; having refined taste and judgment.", examples: ["The security system is highly sophisticated.", "She is a sophisticated traveler who has visited many countries."], category: "Common" },
  { word: "comprehensive", pronunciation: "/ˌkɒm.prɪˈhen.sɪv/", pos: "adjective", translation: "全面的；综合的；详尽的", definition: "Complete and including all or nearly all elements or aspects of something.", examples: ["The report provides a comprehensive analysis.", "We offer comprehensive insurance coverage."], category: "Common" },
  { word: "contemplate", pronunciation: "/ˈkɒn.təm.pleɪt/", pos: "verb", translation: "深思；考虑；凝视", definition: "To think deeply and at length; to consider as a possibility.", examples: ["She contemplated the meaning of life.", "He contemplated changing careers."], category: "Common" },
  { word: "elaborate", pronunciation: "/ɪˈlæb.ər.ət/", pos: "adjective/verb", translation: "精心制作的；详细的；详细阐述", definition: "Involving many carefully arranged parts or details; to develop in detail.", examples: ["The wedding had elaborate decorations.", "Could you elaborate on that point?"], category: "Common" },
  { word: "spontaneous", pronunciation: "/spɒnˈteɪ.ni.əs/", pos: "adjective", translation: "自发的；自然的", definition: "Performed or occurring without premeditation or external stimulus.", examples: ["The crowd burst into spontaneous applause.", "Her decision was completely spontaneous."], category: "Common" },
  { word: "meticulous", pronunciation: "/məˈtɪk.jə.ləs/", pos: "adjective", translation: "一丝不苟的；细致的", definition: "Showing great attention to detail; very careful and precise.", examples: ["She is meticulous about her research.", "The meticulous craftsmanship was evident."], category: "Common" },
  { word: "persevere", pronunciation: "/ˌpɜː.sɪˈvɪər/", pos: "verb", translation: "坚持；不屈不挠", definition: "Continue in a course of action even in the face of difficulty.", examples: ["You must persevere to achieve your goals.", "Despite the challenges, she persevered."], category: "Common" },
  { word: "acknowledge", pronunciation: "/əkˈnɒl.ɪdʒ/", pos: "verb", translation: "承认；致谢；确认收到", definition: "Accept or admit the truth of; express gratitude for; confirm receipt of.", examples: ["He acknowledged his mistake.", "Please acknowledge receipt of this email."], category: "Common" },
  { word: "spontaneous", pronunciation: "/spɒnˈteɪ.ni.əs/", pos: "adjective", translation: "自发的；自然的", definition: "Performed or occurring as a result of a sudden impulse without premeditation.", examples: ["The crowd burst into spontaneous applause.", "Her decision was completely spontaneous."], category: "Common" },

  // ===== Business =====
  { word: "entrepreneur", pronunciation: "/ˌɒn.trə.prəˈnɜːr/", pos: "noun", translation: "企业家；创业者", definition: "A person who organizes and operates a business, taking on greater than normal financial risks.", examples: ["She is a successful tech entrepreneur.", "Many young entrepreneurs are starting businesses today."], category: "Business" },
  { word: "negotiate", pronunciation: "/nɪˈɡəʊ.ʃi.eɪt/", pos: "verb", translation: "谈判；协商；议付", definition: "Try to reach an agreement or compromise by discussion; successfully travel over or past.", examples: ["We need to negotiate better terms with suppliers.", "The two countries negotiated a peace treaty."], category: "Business" },
  { word: "revenue", pronunciation: "/ˈrev.ən.juː/", pos: "noun", translation: "收入；收益；税收", definition: "Income, especially when of an organization and of a substantial nature.", examples: ["The company's revenue grew by 20% this year.", "Advertising is the main source of revenue."], category: "Business" },
  { word: "merger", pronunciation: "/ˈmɜː.dʒər/", pos: "noun", translation: "合并；兼并", definition: "A combination of two things, especially companies, into one.", examples: ["The merger between the two banks was announced.", "The merger created the largest company in the industry."], category: "Business" },
  { word: "strategic", pronunciation: "/strəˈtiː.dʒɪk/", pos: "adjective", translation: "战略性的；关键的", definition: "Relating to the identification of long-term aims and interests and the means of achieving them.", examples: ["We need a strategic plan for growth.", "The company made a strategic investment in AI."], category: "Business" },
  { word: "stakeholder", pronunciation: "/ˈsteɪkˌhəʊl.dər/", pos: "noun", translation: "利益相关者", definition: "A person with an interest or concern in something, especially a business.", examples: ["We need to consider all stakeholders in this decision.", "The meeting included all key stakeholders."], category: "Business" },
  { word: "liability", pronunciation: "/ˌlaɪ.əˈbɪl.ə.ti/", pos: "noun", translation: "负债；责任；不利条件", definition: "The state of being legally responsible for something; a person or thing whose presence may cause harm.", examples: ["The company has significant financial liabilities.", "His lack of experience is a liability in this role."], category: "Business" },
  { word: "portfolio", pronunciation: "/pɔːtˈfəʊ.li.əʊ/", pos: "noun", translation: "投资组合；作品集", definition: "A range of investments or products held by a person or organization; a collection of work.", examples: ["She manages a diverse investment portfolio.", "Please send your design portfolio with your application."], category: "Business" },
  { word: "delegation", pronunciation: "/ˌdel.ɪˈɡeɪ.ʃən/", pos: "noun", translation: "代表团；委托；授权", definition: "A body of delegates or representatives; the act of entrusting a task to another person.", examples: ["A Chinese business delegation visited the factory.", "Effective delegation is key to management success."], category: "Business" },
  { word: "procurement", pronunciation: "/prəˈkjʊə.mənt/", pos: "noun", translation: "采购；获得", definition: "The action of obtaining or procuring something, especially equipment or supplies.", examples: ["The procurement process takes about three months.", "She works in the procurement department."], category: "Business" },
  { word: "synergy", pronunciation: "/ˈsɪn.ə.dʒi/", pos: "noun", translation: "协同作用；增效", definition: "The interaction of elements that when combined produce a total effect greater than the sum of individual elements.", examples: ["The merger will create operational synergy.", "Team synergy leads to better results."], category: "Business" },
  { word: "benchmark", pronunciation: "/ˈbentʃ.mɑːk/", pos: "noun/verb", translation: "基准；标杆；衡量", definition: "A standard or point of reference against which things may be compared; to evaluate by comparison.", examples: ["This product sets the benchmark for quality.", "We benchmark our performance against competitors."], category: "Business" },
  { word: "turnover", pronunciation: "/ˈtɜːnˌəʊ.vər/", pos: "noun", translation: "营业额；人员流动率；翻台率", definition: "The amount of money taken by a business; the rate at which employees leave and are replaced.", examples: ["The company has an annual turnover of $50 million.", "Employee turnover is a major concern."], category: "Business" },
  { word: "consolidate", pronunciation: "/kənˈsɒl.ɪ.deɪt/", pos: "verb", translation: "巩固；合并；加强", definition: "Make (something) physically stronger or more solid; combine a number of things into a single unit.", examples: ["We need to consolidate our market position.", "The loans were consolidated into a single payment."], category: "Business" },
  { word: "arbitration", pronunciation: "/ˌɑː.bɪˈtreɪ.ʃən/", pos: "noun", translation: "仲裁；公断", definition: "The use of an arbitrator to settle a dispute; a method of resolving conflicts outside of court.", examples: ["The contract requires arbitration for disputes.", "They submitted the case to arbitration."], category: "Business" },
  { word: "jurisdiction", pronunciation: "/ˌdʒʊə.rɪsˈdɪk.ʃən/", pos: "noun", translation: "管辖权；司法权；管辖范围", definition: "The official power to make legal decisions and judgments; the territory over which authority extends.", examples: ["This case falls under federal jurisdiction.", "The court has jurisdiction over civil matters."], category: "Business" },
  { word: "amortization", pronunciation: "/əˌmɔː.taɪˈzeɪ.ʃən/", pos: "noun", translation: "摊销；分期偿还", definition: "The action or process of gradually reducing a debt through regular payments; spreading the cost of an asset over time.", examples: ["The loan has a 30-year amortization schedule.", "Amortization of intangible assets follows specific rules."], category: "Business" },
  { word: "due diligence", pronunciation: "/ˌdjuː ˈdɪl.ɪ.dʒəns/", pos: "noun", translation: "尽职调查", definition: "A comprehensive appraisal of a business undertaken by a prospective buyer, especially to establish assets and liabilities.", examples: ["We conducted due diligence before the acquisition.", "Due diligence is essential before any major investment."], category: "Business" },
  { word: "scalable", pronunciation: "/ˈskeɪ.lə.bəl/", pos: "adjective", translation: "可扩展的", definition: "Able to be changed in size or scale; capable of handling growth without losing performance.", examples: ["We need a scalable solution for the growing user base.", "The business model is highly scalable."], category: "Business" },
  { word: "disruptive", pronunciation: "/dɪsˈrʌp.tɪv/", pos: "adjective", translation: "颠覆性的；破坏性的", definition: "Causing or tending to cause disruption; innovative in a way that disturbs existing markets.", examples: ["The startup developed a disruptive technology.", "Disruptive innovation changes entire industries."], category: "Business" },

  // ===== Technology =====
  { word: "algorithm", pronunciation: "/ˈæl.ɡə.rɪ.ðəm/", pos: "noun", translation: "算法", definition: "A process or set of rules to be followed in calculations or problem-solving operations, especially by a computer.", examples: ["Search engines use complex algorithms.", "The algorithm sorts data efficiently."], category: "Technology" },
  { word: "encryption", pronunciation: "/ɪnˈkrɪp.ʃən/", pos: "noun", translation: "加密", definition: "The process of converting information or data into a code to prevent unauthorized access.", examples: ["End-to-end encryption protects your messages.", "The data is protected by 256-bit encryption."], category: "Technology" },
  { word: "bandwidth", pronunciation: "/ˈbænd.wɪdθ/", pos: "noun", translation: "带宽", definition: "The range of frequencies within a given band; the transmission capacity of a computer network.", examples: ["Our office needs more bandwidth for video calls.", "The website requires significant bandwidth."], category: "Technology" },
  { word: "middleware", pronunciation: "/ˈmɪd.əl.weər/", pos: "noun", translation: "中间件", definition: "Software that acts as a bridge between an operating system or database and applications.", examples: ["Middleware enables communication between different systems.", "The application runs on a middleware platform."], category: "Technology" },
  { word: "deprecated", pronunciation: "/ˈdep.rə.keɪ.tɪd/", pos: "adjective", translation: "已弃用的；不推荐的", definition: "Software features that are considered obsolete and on course to be phased out.", examples: ["This function has been deprecated in the new version.", "Developers should avoid using deprecated APIs."], category: "Technology" },
  { word: "latency", pronunciation: "/ˈleɪ.tən.si/", pos: "noun", translation: "延迟；潜伏", definition: "The delay before a transfer of data begins following an instruction; the state of existing but not yet being developed.", examples: ["Low latency is critical for online gaming.", "Network latency affects video call quality."], category: "Technology" },
  { word: "scalability", pronunciation: "/ˌskeɪ.ləˈbɪl.ə.ti/", pos: "noun", translation: "可扩展性", definition: "The capacity to be changed in size or scale; ability of a system to handle growing amounts of work.", examples: ["Scalability is a key consideration in system design.", "Cloud computing offers excellent scalability."], category: "Technology" },
  { word: "containerization", pronunciation: "/kənˌteɪ.nər.aɪˈzeɪ.ʃən/", pos: "noun", translation: "容器化", definition: "A lightweight alternative to full machine virtualization that involves encapsulating an application in a container.", examples: ["Docker popularized containerization.", "Containerization simplifies application deployment."], category: "Technology" },
  { word: "cryptocurrency", pronunciation: "/ˌkrip.təʊˈkʌr.ən.si/", pos: "noun", translation: "加密货币", definition: "A digital currency in which transactions are verified and records maintained by a decentralized system.", examples: ["Bitcoin was the first cryptocurrency.", "Cryptocurrency markets are highly volatile."], category: "Technology" },
  { word: "blockchain", pronunciation: "/ˈblɒk.tʃeɪn/", pos: "noun", translation: "区块链", definition: "A system in which a record of transactions is maintained across computers linked in a peer-to-peer network.", examples: ["Blockchain technology ensures transparency.", "Many industries are exploring blockchain applications."], category: "Technology" },
  { word: "artificial intelligence", pronunciation: "/ˌɑː.tɪˈfɪʃ.əl ɪnˈtel.ɪ.dʒəns/", pos: "noun", translation: "人工智能", definition: "The theory and development of computer systems able to perform tasks normally requiring human intelligence.", examples: ["Artificial intelligence is transforming healthcare.", "AI stands for artificial intelligence."], category: "Technology" },
  { word: "machine learning", pronunciation: "/məˈʃiːn ˈlɜː.nɪŋ/", pos: "noun", translation: "机器学习", definition: "A type of artificial intelligence where computers use data to learn and improve from experience without being explicitly programmed.", examples: ["Machine learning powers recommendation systems.", "She specializes in machine learning research."], category: "Technology" },
  { word: "neural network", pronunciation: "/ˈnjʊə.rəl ˈnet.wɜːk/", pos: "noun", translation: "神经网络", definition: "A computer system modeled on the human brain and nervous system, used in machine learning.", examples: ["Deep neural networks can recognize images.", "Neural networks are used in natural language processing."], category: "Technology" },
  { word: "API", pronunciation: "/ˌeɪ.piːˈaɪ/", pos: "noun", translation: "应用程序接口", definition: "Application Programming Interface: a set of functions and procedures allowing the creation of applications.", examples: ["The API allows integration with third-party services.", "Developers can access data through the REST API."], category: "Technology" },
  { word: "frontend", pronunciation: "/ˈfrent.end/", pos: "noun", translation: "前端", definition: "The part of a software system that the user interacts with directly; the client-side.", examples: ["She works as a frontend developer.", "The frontend is built with React."], category: "Technology" },
  { word: "backend", pronunciation: "/ˈbæk.end/", pos: "noun", translation: "后端", definition: "The part of a software system that handles data storage, processing, and business logic; the server-side.", examples: ["The backend handles authentication.", "He specializes in backend development."], category: "Technology" },
  { word: "repository", pronunciation: "/rɪˈpɒz.ɪ.tər.i/", pos: "noun", translation: "仓库；存储库", definition: "A central location in which data or computer files are stored and managed.", examples: ["The code is stored in a Git repository.", "You can clone the repository from GitHub."], category: "Technology" },
  { word: "framework", pronunciation: "/ˈfreɪm.wɜːk/", pos: "noun", translation: "框架", definition: "A basic structure underlying a system, concept, or text; a software platform for developing applications.", examples: ["React is a popular JavaScript framework.", "The project follows the MVC framework."], category: "Technology" },
  { word: "compiler", pronunciation: "/kəmˈpaɪ.lər/", pos: "noun", translation: "编译器", definition: "A computer program that translates code written in a programming language into machine language.", examples: ["The compiler detected an error in the code.", "GCC is a widely used C compiler."], category: "Technology" },
  { word: "debugging", pronunciation: "/diːˈbʌɡ.ɪŋ/", pos: "noun", translation: "调试", definition: "The process of identifying and removing errors from computer hardware or software.", examples: ["I spent hours debugging this code.", "Debugging tools help find errors faster."], category: "Technology" },
  { word: "recursion", pronunciation: "/rɪˈkɜː.ʃən/", pos: "noun", translation: "递归", definition: "The repeated application of a recursive procedure or definition; a function calling itself.", examples: ["Recursion is a powerful programming concept.", "Factorial can be calculated using recursion."], category: "Technology" },

  // ===== Science =====
  { word: "photosynthesis", pronunciation: "/ˌfəʊ.təʊˈsɪn.θə.sɪs/", pos: "noun", translation: "光合作用", definition: "The process by which green plants use sunlight to synthesize nutrients from carbon dioxide and water.", examples: ["Photosynthesis converts CO2 into oxygen.", "Chlorophyll is essential for photosynthesis."], category: "Science" },
  { word: "mitochondria", pronunciation: "/ˌmaɪ.təʊˈkɒn.dri.ə/", pos: "noun", translation: "线粒体", definition: "Organelles found in large numbers in most cells, in which the biochemical processes of respiration and energy production occur.", examples: ["Mitochondria are the powerhouses of the cell.", "Mitochondria have their own DNA."], category: "Science" },
  { word: "thermodynamics", pronunciation: "/ˌθɜː.məʊ.daɪˈnæm.ɪks/", pos: "noun", translation: "热力学", definition: "The branch of physics dealing with the relations between heat and other forms of energy.", examples: ["The laws of thermodynamics govern energy transfer.", "Thermodynamics is fundamental to engineering."], category: "Science" },
  { word: "chromosome", pronunciation: "/ˈkrəʊ.mə.səʊm/", pos: "noun", translation: "染色体", definition: "A threadlike structure of nucleic acids and protein found in the nucleus of most living cells, carrying genetic information.", examples: ["Humans have 23 pairs of chromosomes.", "The X and Y chromosomes determine sex."], category: "Science" },
  { word: "equilibrium", pronunciation: "/ˌiː.kwɪˈlɪb.ri.əm/", pos: "noun", translation: "平衡；均衡", definition: "A state in which opposing forces or influences are balanced; a calm state of mind.", examples: ["The market reaches equilibrium when supply equals demand.", "Chemical equilibrium is dynamic, not static."], category: "Science" },
  { word: "catalyst", pronunciation: "/ˈkæt.ə.lɪst/", pos: "noun", translation: "催化剂", definition: "A substance that increases the rate of a chemical reaction without itself undergoing permanent change.", examples: ["Enzymes are biological catalysts.", "The catalyst speeds up the reaction."], category: "Science" },
  { word: "homeostasis", pronunciation: "/ˌhɒm.i.əʊˈsteɪ.sɪs/", pos: "noun", translation: "体内平衡；稳态", definition: "The tendency toward a relatively stable equilibrium between interdependent elements, especially as maintained by physiological processes.", examples: ["The body maintains homeostasis through various mechanisms.", "Homeostasis is essential for survival."], category: "Science" },
  { word: "entropy", pronunciation: "/ˈen.trə.pi/", pos: "noun", translation: "熵；无序度", definition: "A thermodynamic quantity representing the unavailability of a system's thermal energy for conversion; lack of order.", examples: ["The second law of thermodynamics states that entropy always increases.", "The entropy of the universe tends toward a maximum."], category: "Science" },
  { word: "ecosystem", pronunciation: "/ˈiː.kəʊˌsɪs.təm/", pos: "noun", translation: "生态系统", definition: "A biological community of interacting organisms and their physical environment.", examples: ["Coral reefs are diverse ecosystems.", "Protecting ecosystems is vital for biodiversity."], category: "Science" },
  { word: "hypothesis", pronunciation: "/haɪˈpɒθ.ə.sɪs/", pos: "noun", translation: "假设", definition: "A supposition or proposed explanation made on the basis of limited evidence.", examples: ["The hypothesis was tested through experiments.", "Scientific progress begins with a hypothesis."], category: "Science" },
  { word: "momentum", pronunciation: "/məˈmen.təm/", pos: "noun", translation: "动量；势头；动力", definition: "The quantity of motion of a moving body; the impetus gained by a moving object.", examples: ["The ball gained momentum as it rolled downhill.", "The project is gathering momentum."], category: "Science" },
  { word: "quantum", pronunciation: "/ˈkwɒn.təm/", pos: "noun", translation: "量子", definition: "A discrete quantity of energy proportional in magnitude to the frequency of the radiation it represents.", examples: ["Quantum mechanics describes the behavior of subatomic particles.", "Quantum computing could revolutionize technology."], category: "Science" },
  { word: "gravity", pronunciation: "/ˈɡræv.ə.ti/", pos: "noun", translation: "重力；引力", definition: "The force that attracts a body toward the center of the earth, or toward any other physical body having mass.", examples: ["Gravity keeps us grounded on Earth.", "Newton discovered the law of gravity."], category: "Science" },
  { word: "radiation", pronunciation: "/ˌreɪ.diˈeɪ.ʃən/", pos: "noun", translation: "辐射；放射", definition: "The emission of energy as electromagnetic waves or as moving subatomic particles.", examples: ["The sun emits ultraviolet radiation.", "Nuclear radiation can be harmful."], category: "Science" },
  { word: "photosynthesis", pronunciation: "/ˌfəʊ.təʊˈsɪn.θə.sɪs/", pos: "noun", translation: "光合作用", definition: "The process by which plants use sunlight to synthesize food from carbon dioxide and water.", examples: ["Photosynthesis produces oxygen as a byproduct.", "Without photosynthesis, life on Earth would not exist."], category: "Science" },

  // ===== Arts =====
  { word: "aesthetic", pronunciation: "/iːsˈθet.ɪk/", pos: "adjective/noun", translation: "美学的；审美的；美感", definition: "Concerned with beauty or the appreciation of beauty; a set of principles underlying the work of an artist.", examples: ["The building has great aesthetic appeal.", "The minimalist aesthetic emphasizes simplicity."], category: "Arts" },
  { word: "renaissance", pronunciation: "/rɪˈneɪ.səns/", pos: "noun", translation: "文艺复兴；复兴", definition: "The revival of European art and literature under the influence of classical models; a renewed interest in something.", examples: ["The Renaissance began in Italy in the 14th century.", "There has been a renaissance in traditional crafts."], category: "Arts" },
  { word: "composition", pronunciation: "/ˌkɒm.pəˈzɪʃ.ən/", pos: "noun", translation: "构图；作曲；作品", definition: "The nature of something's ingredients or constituents; a creative work; the arrangement of elements in a photo or painting.", examples: ["The composition of the painting is masterful.", "Mozart's musical compositions are timeless."], category: "Arts" },
  { word: "perspective", pronunciation: "/pəˈspek.tɪv/", pos: "noun", translation: "透视；视角", definition: "The art of drawing solid objects on a two-dimensional surface to give a realistic impression of depth.", examples: ["Renaissance artists mastered linear perspective.", "The painting uses forced perspective to create depth."], category: "Arts" },
  { word: "palette", pronunciation: "/ˈpæl.ət/", pos: "noun", translation: "调色板；色彩范围", definition: "A thin board on which an artist lays and mixes colors; the range of colors used in a work.", examples: ["The artist used a warm color palette.", "The film has a limited palette of muted tones."], category: "Arts" },
  { word: "symphony", pronunciation: "/ˈsɪm.fə.ni/", pos: "noun", translation: "交响乐；交响曲", definition: "An elaborate musical composition for full orchestra, typically in four movements.", examples: ["Beethoven's Ninth Symphony is world-famous.", "The orchestra performed a symphony by Brahms."], category: "Arts" },
  { word: "choreography", pronunciation: "/ˌkɒr.iˈɒɡ.rə.fi/", pos: "noun", translation: "编舞；舞蹈设计", definition: "The sequence of steps and movements in dance or figure skating; the art of creating such sequences.", examples: ["The choreography of the ballet was stunning.", "She won an award for her choreography."], category: "Arts" },
  { word: "caricature", pronunciation: "/ˈkær.ɪ.kə.tʃʊər/", pos: "noun", translation: "漫画；讽刺画", definition: "A picture, description, or imitation of a person in which certain striking characteristics are exaggerated.", examples: ["The political cartoon was a clever caricature.", "He drew a caricature of his teacher."], category: "Arts" },
  { word: "impressionism", pronunciation: "/ɪmˈpreʃ.ən.ɪz.əm/", pos: "noun", translation: "印象派", definition: "A style or movement in painting originating in France in the 1860s, characterized by visible brush strokes.", examples: ["Monet was a founder of French impressionism.", "Impressionism focuses on capturing light and color."], category: "Arts" },
  { word: "crescendo", pronunciation: "/krɪˈʃen.dəʊ/", pos: "noun", translation: "渐强；高潮", definition: "The loudest point reached in a gradually increasing sound; a progressive increase in intensity.", examples: ["The music reached a dramatic crescendo.", "Tensions built to a crescendo."], category: "Arts" },

  // ===== Nature / Environment =====
  { word: "biodiversity", pronunciation: "/ˌbaɪ.əʊ.daɪˈvɜː.sə.ti/", pos: "noun", translation: "生物多样性", definition: "The variety of plant and animal life in the world or in a particular habitat.", examples: ["Rainforests have the highest biodiversity on Earth.", "Climate change threatens global biodiversity."], category: "Nature" },
  { word: "drought", pronunciation: "/draʊt/", pos: "noun", translation: "干旱；旱灾", definition: "A prolonged period of abnormally low rainfall, leading to a shortage of water.", examples: ["The drought devastated crops across the region.", "California experienced severe drought conditions."], category: "Nature" },
  { word: "tsunami", pronunciation: "/tsuːˈnɑː.mi/", pos: "noun", translation: "海啸", definition: "A long high sea wave caused by an earthquake or other disturbance.", examples: ["The tsunami warning system saved many lives.", "The 2004 tsunami affected many countries."], category: "Nature" },
  { word: "glacier", pronunciation: "/ˈɡlæs.i.ər/", pos: "noun", translation: "冰川", definition: "A slowly moving mass or river of ice formed by the accumulation of snow on mountains.", examples: ["Glaciers are melting due to global warming.", "The glacier carved out this valley thousands of years ago."], category: "Nature" },
  { word: "volcano", pronunciation: "/vɒlˈkeɪ.nəʊ/", pos: "noun", translation: "火山", definition: "A mountain having a crater or vent through which lava, rock fragments, hot vapor, and gas erupt.", examples: ["Mount Fuji is an active volcano.", "The volcano erupted after years of dormancy."], category: "Nature" },
  { word: "hurricane", pronunciation: "/ˈhʌr.ɪ.kən/", pos: "noun", translation: "飓风；台风", definition: "A storm with a violent wind, in particular a tropical cyclone in the Caribbean.", examples: ["The hurricane caused widespread damage.", "Hurricane season runs from June to November."], category: "Nature" },
  { word: "tundra", pronunciation: "/ˈtʌn.drə/", pos: "noun", translation: "苔原；冻原", definition: "A vast, flat, treeless Arctic region in which the subsoil is permanently frozen.", examples: ["The Arctic tundra is home to unique wildlife.", "Permafrost covers much of the tundra."], category: "Nature" },
  { word: "ecosystem", pronunciation: "/ˈiː.kəʊˌsɪs.təm/", pos: "noun", translation: "生态系统", definition: "A biological community of interacting organisms and their physical environment.", examples: ["Coral reefs are among the most diverse ecosystems.", "Protecting ecosystems is essential for the planet."], category: "Nature" },
  { word: " photosynthesis", pronunciation: "/ˌfəʊ.təʊˈsɪn.θə.sɪs/", pos: "noun", translation: "光合作用", definition: "The process by which green plants use sunlight to synthesize nutrients from CO2 and water.", examples: ["Photosynthesis converts carbon dioxide into oxygen.", "Chlorophyll is essential for photosynthesis."], category: "Nature" },
  { word: "extinction", pronunciation: "/ɪkˈstɪŋk.ʃən/", pos: "noun", translation: "灭绝；消亡", definition: "The state or process of a species, family, or larger group being or becoming extinct.", examples: ["Dinosaurs went extinct 65 million years ago.", "Many species face extinction due to habitat loss."], category: "Nature" },

  // ===== Emotions & Psychology =====
  { word: "nostalgia", pronunciation: "/nɒsˈtæl.dʒə/", pos: "noun", translation: "怀旧；乡愁", definition: "A sentimental longing or wistful affection for the past, typically for a period or place with happy associations.", examples: ["The song filled her with nostalgia.", "Nostalgia for childhood is common among adults."], category: "Emotions" },
  { word: "euphoria", pronunciation: "/juːˈfɔː.ri.ə/", pos: "noun", translation: "狂喜；亢奋", definition: "A feeling or state of intense excitement and happiness.", examples: ["Winning the championship brought a sense of euphoria.", "The drug can induce feelings of euphoria."], category: "Emotions" },
  { word: "melancholy", pronunciation: "/ˈmel.ən.kɒl.i/", pos: "noun/adjective", translation: "忧郁；悲伤", definition: "A deep, persistent sadness; a pensive mood, often with no obvious cause.", examples: ["A feeling of melancholy settled over him.", "The melancholy music matched the rainy weather."], category: "Emotions" },
  { word: "serenity", pronunciation: "/səˈren.ə.ti/", pos: "noun", translation: "宁静；安详", definition: "The state of being calm, peaceful, and untroubled.", examples: ["She found serenity in meditation.", "The serenity of the lake was breathtaking."], category: "Emotions" },
  { word: "ambivalence", pronunciation: "/æmˈbɪv.əl.əns/", pos: "noun", translation: "矛盾心理；摇摆不定", definition: "The state of having mixed feelings or contradictory ideas about something or someone.", examples: ["I feel ambivalence about accepting the job offer.", "Her ambivalence toward marriage was obvious."], category: "Emotions" },
  { word: "empathy", pronunciation: "/ˈem.pə.θi/", pos: "noun", translation: "同理心；共情", definition: "The ability to understand and share the feelings of another.", examples: ["Empathy is essential for good leadership.", "She showed great empathy toward the refugees."], category: "Emotions" },
  { word: "resilience", pronunciation: "/rɪˈzɪl.i.əns/", pos: "noun", translation: "韧性；恢复力", definition: "The capacity to recover quickly from difficulties; toughness.", examples: ["Children often show remarkable resilience.", "Building resilience helps cope with stress."], category: "Emotions" },
  { word: "gratitude", pronunciation: "/ˈɡræt.ɪ.tjuːd/", pos: "noun", translation: "感恩；感激", definition: "The quality of being thankful; readiness to show appreciation.", examples: ["She expressed her gratitude to the donors.", "Practicing gratitude improves well-being."], category: "Emotions" },
  { word: "euphoria", pronunciation: "/juːˈfɔː.ri.ə/", pos: "noun", translation: "极度愉快；亢奋", definition: "A feeling or state of intense excitement and happiness.", examples: ["The team was in a state of euphoria after winning.", "Investors felt euphoria as stock prices soared."], category: "Emotions" },
  { word: "compassion", pronunciation: "/kəmˈpæʃ.ən/", pos: "noun", translation: "同情；怜悯", definition: "Sympathetic concern for the sufferings or misfortunes of others.", examples: ["She showed compassion to the homeless man.", "Compassion is a fundamental human value."], category: "Emotions" },

  // ===== Philosophy =====
  { word: "metaphysics", pronunciation: "/ˌmet.əˈfɪz.ɪks/", pos: "noun", translation: "形而上学；玄学", definition: "The branch of philosophy that deals with the first principles of things, including abstract concepts such as being and knowing.", examples: ["Metaphysics explores the nature of reality.", "Aristotle is known as the father of metaphysics."], category: "Philosophy" },
  { word: "existentialism", pronunciation: "/ˌɪɡ.zɪˈsten.ʃəl.ɪz.əm/", pos: "noun", translation: "存在主义", definition: "A philosophical theory emphasizing the existence of the individual as a free and responsible agent.", examples: ["Sartre was a key figure in existentialism.", "Existentialism focuses on individual freedom and choice."], category: "Philosophy" },
  { word: "empiricism", pronunciation: "/ɪmˈpɪr.ɪ.sɪz.əm/", pos: "noun", translation: "经验主义", definition: "The theory that all knowledge is derived from sense-experience and observation.", examples: ["Empiricism contrasts with rationalism.", "British philosophers often favored empiricism."], category: "Philosophy" },
  { word: "utilitarianism", pronunciation: "/juːˌtɪl.ɪˈteə.ri.ə.nɪz.əm/", pos: "noun", translation: "功利主义", definition: "The doctrine that actions are right if they are useful or for the benefit of a majority.", examples: ["Utilitarianism seeks the greatest good for the greatest number.", "Bentham founded utilitarianism."], category: "Philosophy" },
  { word: "dichotomy", pronunciation: "/daɪˈkɒt.ə.mi/", pos: "noun", translation: "二分法；一分为二", definition: "A division or contrast between two things that are represented as being opposed or entirely different.", examples: ["The dichotomy between mind and body has long been debated.", "There is a false dichotomy between work and life."], category: "Philosophy" },
  { word: "epistemology", pronunciation: "/ɪˌpɪs.təˈmɒl.ə.dʒi/", pos: "noun", translation: "认识论", definition: "The theory of knowledge, especially with regard to its methods, validity, and scope.", examples: ["Epistemology asks how we know what we know.", "The course covers epistemology and ethics."], category: "Philosophy" },
  { word: "nihilism", pronunciation: "/ˈnaɪ.ɪ.lɪz.əm/", pos: "noun", translation: "虚无主义", definition: "The rejection of all religious and moral principles; the belief that life is meaningless.", examples: ["Nihilism denies any inherent meaning in existence.", "The character embodied a form of nihilism."], category: "Philosophy" },
  { word: "stoicism", pronunciation: "/ˈstəʊ.ɪ.sɪz.əm/", pos: "noun", translation: "斯多葛主义；坚忍", definition: "An ancient Greek philosophy teaching self-control and fortitude as a means of overcoming destructive emotions.", examples: ["Stoicism teaches acceptance of what we cannot control.", "Marcus Aurelius was a practitioner of stoicism."], category: "Philosophy" },
  { word: "aesthetics", pronunciation: "/iːsˈθet.ɪks/", pos: "noun", translation: "美学", definition: "A set of principles concerned with the nature and appreciation of beauty, especially in art.", examples: ["Aesthetics is a branch of philosophy.", "Eastern aesthetics differs from Western aesthetics."], category: "Philosophy" },

  // ===== Literature =====
  { word: "metaphor", pronunciation: "/ˈmet.ə.fər/", pos: "noun", translation: "隐喻；比喻", definition: "A figure of speech in which a word or phrase is applied to an object or action to which it is not literally applicable.", examples: ["'Time is a thief' is a common metaphor.", "Shakespeare used metaphor extensively in his sonnets."], category: "Literature" },
  { word: "allegory", pronunciation: "/ˈæl.ɪ.ɡər.i/", pos: "noun", translation: "寓言；讽喻", definition: "A story, poem, or picture that can be interpreted to reveal a hidden meaning, typically a moral or political one.", examples: ["Animal Farm is a political allegory.", "The painting is an allegory of human vanity."], category: "Literature" },
  { word: "protagonist", pronunciation: "/prəˈtæɡ.ən.ɪst/", pos: "noun", translation: "主角；主人公", definition: "The leading character or one of the major characters in a drama, movie, novel, or other fictional text.", examples: ["The protagonist faces many challenges throughout the story.", "Holden Caulfield is the protagonist of The Catcher in the Rye."], category: "Literature" },
  { word: "antagonist", pronunciation: "/ænˈtæɡ.ən.ɪst/", pos: "noun", translation: "反派；对手", definition: "A person who actively opposes or is hostile to someone or something; an adversary.", examples: ["The antagonist in the story was surprisingly sympathetic.", "Every good story needs a compelling antagonist."], category: "Literature" },
  { word: "soliloquy", pronunciation: "/səˈlɪl.ə.kwi/", pos: "noun", translation: "独白；自言自语", definition: "An act of speaking one's thoughts aloud when by oneself, especially by a character in a play.", examples: ["Hamlet's 'To be or not to be' is a famous soliloquy.", "The soliloquy reveals the character's inner thoughts."], category: "Literature" },
  { word: "hyperbole", pronunciation: "/haɪˈpɜː.bəl.i/", pos: "noun", translation: "夸张；夸张法", definition: "Exaggerated statements or claims not meant to be taken literally; a rhetorical device.", examples: ["'I've told you a million times' is hyperbole.", "Hyperbole is common in advertising."], category: "Literature" },
  { word: "alliteration", pronunciation: "/əˌlɪt.ərˈeɪ.ʃən/", pos: "noun", translation: "头韵", definition: "The occurrence of the same letter or sound at the beginning of adjacent or closely connected words.", examples: ["'Peter Piper picked' is an example of alliteration.", "Alliteration creates a musical effect in poetry."], category: "Literature" },
  { word: "foreshadowing", pronunciation: "/fɔːˈʃæd.əʊ.ɪŋ/", pos: "noun", translation: "伏笔；预兆", definition: "A warning or indication of a future event; a literary device used to suggest what will happen later.", examples: ["The storm at the beginning is foreshadowing of the conflict to come.", "Good writers use foreshadowing subtly."], category: "Literature" },
  { word: "onomatopoeia", pronunciation: "/ˌɒn.ə.mæt.əˈpiː.ə/", pos: "noun", translation: "拟声词；象声词", definition: "The formation of a word from a sound associated with what is named; words that imitate sounds.", examples: ["'Buzz', 'hiss', and 'bang' are examples of onomatopoeia.", "Comic books use onomatopoeia extensively."], category: "Literature" },
  { word: "personification", pronunciation: "/pəˌsɒn.ɪ.fɪˈkeɪ.ʃən/", pos: "noun", translation: "拟人；人格化", definition: "The attribution of a personal nature or human characteristics to something non-human.", examples: ["'The wind whispered' is personification.", "Personification is common in children's literature."], category: "Literature" },
  { word: "oxymoron", pronunciation: "/ˌɒk.sɪˈmɔː.rɒn/", pos: "noun", translation: "矛盾修辞法； oxymoron", definition: "A figure of speech in which apparently contradictory terms appear in conjunction.", examples: ["'Deafening silence' is an oxymoron.", "'Bittersweet' is a common oxymoron."], category: "Literature" },
  { word: "satire", pronunciation: "/ˈsaɪ.tər/", pos: "noun", translation: "讽刺；讽刺作品", definition: "The use of humor, irony, exaggeration, or ridicule to expose and criticize foolishness or vice.", examples: ["The Daily Show uses satire to comment on politics.", "Swift's Gulliver's Travels is a work of satire."], category: "Literature" },
  { word: "synecdoche", pronunciation: "/sɪˈnek.də.ki/", pos: "noun", translation: "提喻法", definition: "A figure of speech in which a part is made to represent the whole or vice versa.", examples: ["'All hands on deck' uses synecdoche (hands = people).", "'Wheels' referring to a car is synecdoche."], category: "Literature" },

  // ===== Idioms & Phrases =====
  { word: "break the ice", pronunciation: "/breɪk ði aɪs/", pos: "idiom", translation: "打破僵局；破冰", definition: "To do or say something to relieve tension or get conversation going in a strained situation.", examples: ["He told a joke to break the ice at the meeting.", "A friendly smile can help break the ice."], category: "Idioms" },
  { word: "once in a blue moon", pronunciation: "/wʌns ɪn ə bluː muːn/", pos: "idiom", translation: "千载难逢；极为罕见", definition: "Very rarely; almost never.", examples: ["I eat fast food once in a blue moon.", "Once in a blue moon, something truly unexpected happens."], category: "Idioms" },
  { word: "kill two birds with one stone", pronunciation: "/kɪl tuː bɜːdz wɪð wʌn stəʊn/", pos: "idiom", translation: "一石二鸟；一箭双雕", definition: "Achieve two things in a single action.", examples: ["By studying on the train, I kill two birds with one stone.", "Exercising with a friend kills two birds with one stone."], category: "Idioms" },
  { word: "the ball is in your court", pronunciation: "/ðə bɔːl ɪz ɪn jɔː kɔːt/", pos: "idiom", translation: "球在你这边；轮到你了", definition: "It is up to you to make the next decision or take the next step.", examples: ["I've made my offer; the ball is in your court now.", "She apologized, so the ball is in his court."], category: "Idioms" },
  { word: "piece of cake", pronunciation: "/piːs əv keɪk/", pos: "idiom", translation: "小菜一碟；轻而易举", definition: "Something very easy to do.", examples: ["The exam was a piece of cake.", "Don't worry, fixing this is a piece of cake."], category: "Idioms" },
  { word: "hit the nail on the head", pronunciation: "/hɪt ðe neɪl ɒn ðə hed/", pos: "idiom", translation: "一针见血；说到点子上", definition: "Describe exactly what is causing a situation or problem.", examples: ["You hit the nail on the head with that analysis.", "Her comment really hit the nail on the head."], category: "Idioms" },
  { word: "let the cat out of the bag", pronunciation: "/let ðə kæt aʊt əv ðə bæɡ/", pos: "idiom", translation: "泄露秘密；说漏嘴", definition: "Reveal a secret carelessly or by mistake.", examples: ["He let the cat out of the bag about the surprise party.", "Don't let the cat out of the bag!"], category: "Idioms" },
  { word: "burn the midnight oil", pronunciation: "/bɜːn ðə ˈmɪd.naɪt ɔɪl/", pos: "idiom", translation: "开夜车；挑灯夜战", definition: "To work late into the night.", examples: ["I have to burn the midnight oil to finish this report.", "Students often burn the midnight oil before exams."], category: "Idioms" },
  { word: "bite the bullet", pronunciation: "/baɪt ðə ˈbʊl.ɪt/", pos: "idiom", translation: "咬紧牙关；硬着头皮", definition: "Decide to do something difficult or unpleasant that one has been putting off.", examples: ["I bit the bullet and went to the dentist.", "Sometimes you just have to bite the bullet."], category: "Idioms" },
  { word: "cost an arm and a leg", pronunciation: "/kɒst ən ɑːm ənd ə leɡ/", pos: "idiom", translation: "花费一大笔钱；贵得离谱", definition: "Be very expensive.", examples: ["That car cost him an arm and a leg.", "Living in the city costs an arm and a leg."], category: "Idioms" },
  { word: "spill the beans", pronunciation: "/spɪl ðə biːnz/", pos: "idiom", translation: "泄露秘密", definition: "Reveal secret information accidentally or prematurely.", examples: ["Who spilled the beans about the merger?", "Don't spill the beans about the surprise!"], category: "Idioms" },
  { word: "under the weather", pronunciation: "/ˈʌn.dər ðə ˈweð.ər/", pos: "idiom", translation: "身体不适；不舒服", definition: "Feeling slightly sick or unwell.", examples: ["I'm feeling a bit under the weather today.", "She stayed home because she was under the weather."], category: "Idioms" },
  { word: "when pigs fly", pronunciation: "/wen pɪɡz flaɪ/", pos: "idiom", translation: "太阳从西边出来；绝不可能", definition: "Something that will never happen.", examples: ["He'll clean his room when pigs fly.", "Sure, I'll lend you money — when pigs fly!"], category: "Idioms" },
  { word: "a blessing in disguise", pronunciation: "/ə ˈbles.ɪŋ ɪn dɪsˈɡaɪz/", pos: "idiom", translation: "塞翁失马；因祸得福", definition: "A good thing that initially seemed bad.", examples: ["Losing that job was a blessing in disguise.", "The delay was a blessing in disguise."], category: "Idioms" },
  { word: "actions speak louder than words", pronunciation: "/ˈæk.ʃənz spiːk laʊ.dər ðæn wɜːdz/", pos: "idiom", translation: "行动胜于言辞", definition: "What someone does means more than what they say.", examples: ["He always helps others — actions speak louder than words.", "Show me, don't tell me. Actions speak louder than words."], category: "Idioms" },
  { word: "don't count your chickens before they hatch", pronunciation: "/dəʊnt kaʊnt jɔː ˈtʃɪk.ɪnz bɪˈfɔːr ðeɪ hætʃ/", pos: "idiom", translation: "别过早乐观；不要打如意算盘", definition: "Don't make plans based on something that hasn't happened yet.", examples: ["I might get the promotion, but I'm not counting my chickens.", "Don't count your chickens before they hatch."], category: "Idioms" },
  { word: "every cloud has a silver lining", pronunciation: "/ˈev.ri klaʊd hæz ə ˈsɪl.və ˈlaɪ.nɪŋ/", pos: "idiom", translation: "守得云开见月明；黑暗中总有一线光明", definition: "Every difficult or sad situation has a comforting or hopeful aspect.", examples: ["Losing my job led to a better one — every cloud has a silver lining.", "Don't despair; every cloud has a silver lining."], category: "Idioms" },
  { word: "the best of both worlds", pronunciation: "/ðə best əv bəʊθ ˈwɜːldz/", pos: "idiom", translation: "两全其美", definition: "A situation in which you can enjoy the advantages of two different things.", examples: ["Working from home gives you the best of both worlds.", "This car offers the best of both worlds: speed and comfort."], category: "Idioms" },
  { word: "call it a day", pronunciation: "/kɔːl ɪt ə deɪ/", pos: "idiom", translation: "收工；到此为止", definition: "Decide to stop working on something.", examples: ["We've made good progress; let's call it a day.", "I'm tired. I'll call it a day."], category: "Idioms" },

  // ===== More Common words to reach 500+ =====
  { word: "perception", pronunciation: "/pəˈsep.ʃən/", pos: "noun", translation: "感知；看法；洞察力", definition: "The ability to see, hear, or become aware of something through the senses; a way of understanding something.", examples: ["Perception and reality are not always the same.", "Public perception of the company has improved."], category: "Common" },
  { word: "determination", pronunciation: "/dɪˌtɜː.mɪˈneɪ.ʃən/", pos: "noun", translation: "决心；测定", definition: "The quality of being determined; firmness of purpose.", examples: ["Her determination to succeed was inspiring.", "With enough determination, anything is possible."], category: "Common" },
  { word: "aspiration", pronunciation: "/ˌæs.pɪˈreɪ.ʃən/", pos: "noun", translation: "志向；抱负；渴望", definition: "A hope or ambition of achieving something.", examples: ["Her aspiration is to become a doctor.", "Young people should have high aspirations."], category: "Common" },
  { word: "contribution", pronunciation: "/ˌkɒn.trɪˈbjuː.ʃən/", pos: "noun", translation: "贡献；捐款", definition: "A gift or payment to a common fund or collection; the part played in bringing about a result.", examples: ["Your contribution to the project was invaluable.", "She made a generous contribution to charity."], category: "Common" },
  { word: "endeavor", pronunciation: "/ɪnˈdev.ər/", pos: "noun/verb", translation: "努力；尽力", definition: "Try hard to do or achieve something; an attempt to achieve a goal.", examples: ["We will make every endeavor to finish on time.", "Human endeavor has taken us to the moon."], category: "Common" },
  { word: "fortitude", pronunciation: "/ˈfɔː.tɪ.tjuːd/", pos: "noun", translation: "坚韧；刚毅", definition: "Courage in pain or adversity; strength of mind that enables a person to endure.", examples: ["She faced her illness with great fortitude.", "His fortitude in the face of danger was admirable."], category: "Common" },
  { word: "magnanimous", pronunciation: "/mæɡˈnæn.ɪ.məs/", pos: "adjective", translation: "宽宏大量的；高尚的", definition: "Very generous or forgiving, especially toward a rival or someone less powerful.", examples: ["He was magnanimous in victory.", "A magnanimous person does not hold grudges."], category: "Common" },
  { word: "prudent", pronunciation: "/ˈpruː.dənt/", pos: "adjective", translation: "谨慎的；精明的", definition: "Acting with or showing care and thought for the future; wise and careful.", examples: ["It is prudent to save money for emergencies.", "A prudent investor diversifies their portfolio."], category: "Common" },
  { word: "redundant", pronunciation: "/rɪˈdʌn.dənt/", pos: "adjective", translation: "多余的；冗余的；被裁员的", definition: "Not or no longer needed or useful; superfluous; laid off from work.", examples: ["The report contains redundant information.", "He was made redundant when the factory closed."], category: "Common" },
  { word: "tenacious", pronunciation: "/təˈneɪ.ʃəs/", pos: "adjective", translation: "顽强的；坚韧的；固执的", definition: "Tending to keep a firm hold of something; clinging or adhering closely; not letting go easily.", examples: ["She is tenacious in pursuing her goals.", "The ivy has a tenacious grip on the wall."], category: "Common" },
  { word: "whimsical", pronunciation: "/ˈwɪm.zɪ.kəl/", pos: "adjective", translation: "异想天开的；古怪的；奇妙的", definition: "Playfully quaint or fanciful, especially in an appealing and amusing way.", examples: ["The garden has a whimsical design.", "Her whimsical paintings always make me smile."], category: "Common" },
  { word: "zealous", pronunciation: "/ˈzel.əs/", pos: "adjective", translation: "热情的；狂热的", definition: "Having or showing zeal; great energy or enthusiasm in pursuit of a cause.", examples: ["He is a zealous supporter of animal rights.", "The zealous fan camped out for tickets."], category: "Common" },
  { word: "pragmatic", pronunciation: "/præɡˈmæt.ɪk/", pos: "adjective", translation: "务实的；实用主义的", definition: "Dealing with things sensibly and realistically; practical.", examples: ["We need a pragmatic solution to this problem.", "She has a pragmatic approach to parenting."], category: "Common" },
  { word: "altruistic", pronunciation: "/ˌæl.truːˈɪs.tɪk/", pos: "adjective", translation: "利他的；无私的", definition: "Showing a disinterested and selfless concern for the well-being of others.", examples: ["Her altruistic motives were evident.", "Altruistic behavior benefits society as a whole."], category: "Common" },
  { word: "candid", pronunciation: "/ˈkæn.dɪd/", pos: "adjective", translation: "坦率的；直言不讳的", definition: "Truthful and straightforward; frank.", examples: ["I appreciate your candid feedback.", "The photo was a candid shot, not posed."], category: "Common" },
  { word: "diligent", pronunciation: "/ˈdɪl.ɪ.dʒənt/", pos: "adjective", translation: "勤奋的；勤勉的", definition: "Having or showing care and conscientiousness in one's work or duties.", examples: ["She is a diligent student who always does her homework.", "Diligent effort leads to success."], category: "Common" },
  { word: "eloquent", pronunciation: "/ˈel.ə.kwənt/", pos: "adjective", translation: "雄辩的；有说服力的", definition: "Fluent or persuasive in speaking or writing.", examples: ["He gave an eloquent speech.", "Her eloquent writing moved the readers."], category: "Common" },
  { word: "frugal", pronunciation: "/ˈfruː.ɡəl/", pos: "adjective", translation: "节俭的；朴素的", definition: "Sparing or economical with regard to money or food.", examples: ["He lives a frugal lifestyle.", "Frugal habits help build savings."], category: "Common" },
  { word: "gregarious", pronunciation: "/ɡrɪˈɡeə.ri.əs/", pos: "adjective", translation: "合群的；爱交际的", definition: "Fond of company; sociable.", examples: ["She is a gregarious person who loves parties.", "Dogs are generally gregarious animals."], category: "Common" },
  { word: "humble", pronunciation: "/ˈhʌm.bəl/", pos: "adjective", translation: "谦逊的；卑微的", definition: "Having or showing a modest or low estimate of one's own importance.", examples: ["Despite his fame, he remains humble.", "She comes from a humble background."], category: "Common" },
  { word: "innate", pronunciation: "/ɪˈneɪt/", pos: "adjective", translation: "天生的；固有的", definition: "Inborn; natural; existing from birth.", examples: ["She has an innate talent for music.", "Language ability seems to be innate in humans."], category: "Common" },
  { word: "jovial", pronunciation: "/ˈdʒəʊ.vi.əl/", pos: "adjective", translation: "快活的；愉快的", definition: "Cheerful and friendly.", examples: ["He has a jovial personality.", "The jovial host made everyone feel welcome."], category: "Common" },
  { word: "keen", pronunciation: "/kiːn/", pos: "adjective", translation: "敏锐的；渴望的；强烈的", definition: "Having or showing eagerness or enthusiasm; sharp or penetrating.", examples: ["She has a keen interest in science.", "He has a keen eye for detail."], category: "Common" },
  { word: "lucid", pronunciation: "/ˈluː.sɪd/", pos: "adjective", translation: "清晰的；明了的；清醒的", definition: "Expressed clearly; easy to understand; bright or luminous; mentally sound.", examples: ["He gave a lucid explanation of the theory.", "She remained lucid throughout her illness."], category: "Common" },
  { word: "modest", pronunciation: "/ˈmɒd.ɪst/", pos: "adjective", translation: "谦虚的；适度的", definition: "Unassuming or moderate in the estimation of one's abilities; not large in size or amount.", examples: ["He is modest about his achievements.", "They live in a modest house."], category: "Common" },
  { word: "novice", pronunciation: "/ˈnɒv.ɪs/", pos: "noun", translation: "新手；初学者", definition: "A person new to or inexperienced in a field or situation.", examples: ["I'm still a novice at cooking.", "The class is suitable for novices."], category: "Common" },
  { word: "obstinate", pronunciation: "/ˈɒb.stɪ.nət/", pos: "adjective", translation: "固执的；顽固的", definition: "Stubbornly refusing to change one's opinion or chosen course of action.", examples: ["He is too obstinate to admit his mistake.", "The obstinate child refused to eat vegetables."], category: "Common" },
  { word: "pragmatic", pronunciation: "/præɡˈmæt.ɪk/", pos: "adjective", translation: "务实的", definition: "Dealing with things sensibly and realistically.", examples: ["We need a pragmatic approach.", "She is known for being pragmatic."], category: "Common" },
  { word: "quaint", pronunciation: "/kweɪnt/", pos: "adjective", translation: "古朴的；别致的；奇趣的", definition: "Attractively unusual or old-fashioned.", examples: ["The village is full of quaint cottages.", "The shop has a quaint charm."], category: "Common" },
  { word: "resolute", pronunciation: "/ˈrez.ə.luːt/", pos: "adjective", translation: "坚决的；果断的", definition: "Admirably purposeful, determined, and unwavering.", examples: ["She remained resolute in her decision.", "The resolute team refused to give up."], category: "Common" },
  { word: "sincere", pronunciation: "/sɪnˈsɪər/", pos: "adjective", translation: "真诚的；诚挚的", definition: "Free from pretense or deceit; proceeding from genuine feelings.", examples: ["Please accept my sincere apologies.", "She is a sincere and honest person."], category: "Common" },
  { word: "thriving", pronunciation: "/ˈθraɪ.vɪŋ/", pos: "adjective", translation: "兴旺的；繁荣的", definition: "Prospering; flourishing; growing vigorously.", examples: ["The business is thriving.", "The thriving city attracts many tourists."], category: "Common" },
  { word: "unanimous", pronunciation: "/juˈnæn.ɪ.məs/", pos: "adjective", translation: "一致同意的；无异议的", definition: "Fully in agreement; (of two or more people) fully in agreement.", examples: ["The decision was unanimous.", "The jury reached a unanimous verdict."], category: "Common" },
  { word: "viable", pronunciation: "/ˈvaɪ.ə.bəl/", pos: "adjective", translation: "可行的；能存活的", definition: "Capable of working successfully; feasible; capable of surviving.", examples: ["We need to find a viable solution.", "The plan is economically viable."], category: "Common" },
  { word: "witty", pronunciation: "/ˈwɪt.i/", pos: "adjective", translation: "机智的；诙谐的", definition: "Showing or characterized by quick and inventive verbal humor.", examples: ["He is known for his witty remarks.", "The play is witty and entertaining."], category: "Common" },
  { word: "yearn", pronunciation: "/jɜːn/", pos: "verb", translation: "渴望；向往", definition: "Have an intense feeling of longing for something.", examples: ["She yearns to travel the world.", "He yearned for his homeland."], category: "Common" },

  // More tech
  { word: "sandbox", pronunciation: "/ˈsænd.bɒks/", pos: "noun", translation: "沙盒；隔离环境", definition: "A testing environment that isolates untested code changes from the production environment.", examples: ["Run the code in a sandbox first.", "The sandbox prevents malware from affecting the system."], category: "Technology" },
  { word: "refactoring", pronunciation: "/ˌriː.fækˈtɔː.rɪŋ/", pos: "noun", translation: "重构", definition: "The process of restructuring existing computer code without changing its external behavior.", examples: ["Refactoring improves code maintainability.", "We spent a week refactoring the legacy codebase."], category: "Technology" },
  { word: "query", pronunciation: "/ˈkwɪə.ri/", pos: "noun/verb", translation: "查询；疑问", definition: "A question, especially one addressed to an official or organization; to ask a question about.", examples: ["The database query returned 100 results.", "I have a query about my bill."], category: "Technology" },
  { word: "endpoint", pronunciation: "/ˈend.pɔɪnt/", pos: "noun", translation: "端点；终点", definition: "A remote computing device that communicates back and forth with a network; a URL where an API can be accessed.", examples: ["The API endpoint requires authentication.", "Each endpoint handles a specific request type."], category: "Technology" },
  { word: "authentication", pronunciation: "/ɔːˌθen.tɪˈkeɪ.ʃən/", pos: "noun", translation: "认证；身份验证", definition: "The process of verifying the identity of a user or device.", examples: ["Two-factor authentication adds extra security.", "Authentication is required to access this resource."], category: "Technology" },
  { word: "serialization", pronunciation: "/ˌsɪə.ri.ə.laɪˈzeɪ.ʃən/", pos: "noun", translation: "序列化", definition: "The process of converting an object into a format that can be stored or transmitted.", examples: ["JSON is commonly used for data serialization.", "Serialization converts objects to a byte stream."], category: "Technology" },
  { word: "throughput", pronunciation: "/ˈθruː.pʊt/", pos: "noun", translation: "吞吐量；处理量", definition: "The amount of material or items passing through a system or process.", examples: ["The network has a throughput of 1 Gbps.", "We need to improve system throughput."], category: "Technology" },
  { word: "idempotent", pronunciation: "/aɪˈdem.pə.tənt/", pos: "adjective", translation: "幂等的", definition: "An operation that produces the same result regardless of how many times it is executed.", examples: ["HTTP GET requests should be idempotent.", "An idempotent function can be safely retried."], category: "Technology" },
  { word: "immutable", pronunciation: "/ɪˈmjuː.tə.bəl/", pos: "adjective", translation: "不可变的", definition: "Unable to be changed; unchanging over time.", examples: ["Strings are immutable in Java.", "Immutable data structures prevent accidental changes."], category: "Technology" },
  { word: "polymorphism", pronunciation: "/ˌpɒl.iˈmɔː.fɪz.əm/", pos: "noun", translation: "多态性", definition: "The condition of occurring in several different forms; in programming, the ability to process objects differently based on their data type.", examples: ["Polymorphism is a key OOP concept.", "The language supports runtime polymorphism."], category: "Technology" },
  { word: "encapsulation", pronunciation: "/ɪnˌkæp.sjuˈleɪ.ʃən/", pos: "noun", translation: "封装", definition: "The action of enclosing something in a capsule; in OOP, restricting access to an object's components.", examples: ["Encapsulation hides internal implementation details.", "Data encapsulation improves code security."], category: "Technology" },

  // More science
  { word: "centrifugal", pronunciation: "/ˌsen.trɪˈfjuː.ɡəl/", pos: "adjective", translation: "离心的", definition: "Moving or tending to move away from a center.", examples: ["Centrifugal force pushes objects outward.", "A centrifugal pump moves fluids using rotation."], category: "Science" },
  { word: "oxidation", pronunciation: "/ˌɒk.sɪˈdeɪ.ʃən/", pos: "noun", translation: "氧化", definition: "The process or result of oxidizing or being oxidized; loss of electrons.", examples: ["Oxidation causes iron to rust.", "Oxidation and reduction always occur together."], category: "Science" },
  { word: "isotope", pronunciation: "/ˈaɪ.sə.təʊp/", pos: "noun", translation: "同位素", definition: "Each of two or more forms of the same element that contain equal numbers of protons but different numbers of neutrons.", examples: ["Carbon-14 is a radioactive isotope.", "Isotopes have different atomic masses."], category: "Science" },
  { word: "viscosity", pronunciation: "/vɪˈskɒs.ə.ti/", pos: "noun", translation: "粘度；粘性", definition: "The state of being thick, sticky, and semifluid in consistency, due to internal friction.", examples: ["Honey has high viscosity.", "Engine oil viscosity affects performance."], category: "Science" },
  { word: "electromagnetic", pronunciation: "/ɪˌlek.trəʊ.mæɡˈnet.ɪk/", pos: "adjective", translation: "电磁的", definition: "Relating to the interrelation of electric currents or fields and magnetic fields.", examples: ["Light is an electromagnetic wave.", "The electromagnetic spectrum includes radio waves and X-rays."], category: "Science" },
  { word: "precipitation", pronunciation: "/prɪˌsɪp.ɪˈteɪ.ʃən/", pos: "noun", translation: "降水；沉淀", definition: "The action or process of precipitating; rain, snow, sleet, or hail that falls to the ground.", examples: ["Precipitation is expected this afternoon.", "Annual precipitation has decreased."], category: "Science" },
  { word: "sediment", pronunciation: "/ˈsed.ɪ.mənt/", pos: "noun", translation: "沉积物", definition: "Matter that settles to the bottom of a liquid; material deposited by water, wind, or glaciers.", examples: ["The sediment settled at the bottom of the bottle.", "Sediment layers reveal geological history."], category: "Science" },
  { word: "symbiosis", pronunciation: "/ˌsɪm.baɪˈəʊ.sɪs/", pos: "noun", translation: "共生；共生关系", definition: "Interaction between two different organisms living in close physical association, typically to the advantage of both.", examples: ["Bees and flowers have a symbiosis.", "Coral and algae form a symbiosis."], category: "Science" },
  { word: "osmosis", pronunciation: "/ɒzˈməʊ.sɪs/", pos: "noun", translation: "渗透；潜移默化", definition: "A process by which molecules of a solvent tend to pass through a semipermeable membrane; gradual absorption of ideas.", examples: ["Osmosis moves water across cell membranes.", "She learned Spanish through osmosis."], category: "Science" },
  { word: "catalyst", pronunciation: "/ˈkæt.ə.lɪst/", pos: "noun", translation: "催化剂", definition: "A substance that increases the rate of a chemical reaction without itself undergoing permanent change.", examples: ["Enzymes are biological catalysts.", "The catalyst sped up the reaction significantly."], category: "Science" },

  // More academic
  { word: "bibliography", pronunciation: "/ˌbɪb.liˈɒɡ.rə.fi/", pos: "noun", translation: "参考书目；文献目录", definition: "A list of the books referred to in a scholarly work, typically printed as an appendix.", examples: ["Include a bibliography at the end of your paper.", "The bibliography contains over 200 sources."], category: "Academic" },
  { word: "criterion", pronunciation: "/kraɪˈtɪə.ri.ən/", pos: "noun", translation: "标准；准则", definition: "A principle or standard by which something may be judged or decided.", examples: ["What criteria did you use for selection?", "The main criterion is cost-effectiveness."], category: "Academic" },
  { word: "etymology", pronunciation: "/ˌet.ɪˈmɒl.ə.dʒi/", pos: "noun", translation: "词源学；词源", definition: "The study of the origin of words and the way in which their meanings have changed throughout history.", examples: ["The etymology of 'algebra' is Arabic.", "She specializes in the etymology of English words."], category: "Academic" },
  { word: "pedagogy", pronunciation: "/ˈped.ə.ɡɒdʒ.i/", pos: "noun", translation: "教育学；教学法", definition: "The method and practice of teaching, especially as an academic subject or theoretical concept.", examples: ["Modern pedagogy emphasizes student-centered learning.", "She studied pedagogy at university."], category: "Academic" },
  { word: "syntax", pronunciation: "/ˈsɪn.tæks/", pos: "noun", translation: "句法；语法", definition: "The arrangement of words and phrases to create well-formed sentences in a language; the structure of statements in a computer language.", examples: ["The sentence has incorrect syntax.", "Python uses indentation for syntax."], category: "Academic" },
  { word: "semantics", pronunciation: "/sɪˈmæn.tɪks/", pos: "noun", translation: "语义学", definition: "The branch of linguistics and logic concerned with meaning; the meaning of a word, phrase, or text.", examples: ["The semantics of the contract were debated.", "In computing, semantics refers to program meaning."], category: "Academic" },
  { word: "pragmatics", pronunciation: "/præɡˈmæt.ɪks/", pos: "noun", translation: "语用学", definition: "The branch of linguistics dealing with language in use and the contexts in which it is used.", examples: ["Pragmatics studies how context affects meaning.", "Understanding pragmatics is key to communication."], category: "Academic" },
  { word: "lexicon", pronunciation: "/ˈlek.sɪ.kən/", pos: "noun", translation: "词典；词汇", definition: "The vocabulary of a person, language, or branch of knowledge.", examples: ["Technical fields have specialized lexicons.", "The word entered the English lexicon in the 19th century."], category: "Academic" },
  { word: "anthropology", pronunciation: "/ˌæn.θrəˈpɒl.ə.dʒi/", pos: "noun", translation: "人类学", definition: "The study of human societies and cultures and their development.", examples: ["She majored in cultural anthropology.", "Anthropology helps us understand human diversity."], category: "Academic" },
  { word: "sociology", pronunciation: "/ˌsəʊ.siˈɒl.ə.dʒi/", pos: "noun", translation: "社会学", definition: "The study of the development, structure, and functioning of human society.", examples: ["Sociology examines social relationships and institutions.", "He has a degree in sociology."], category: "Academic" },
  { word: "epistemology", pronunciation: "/ɪˌpɪs.təˈmɒl.ə.dʒi/", pos: "noun", translation: "认识论", definition: "The theory of knowledge, especially with regard to its methods, validity, and scope.", examples: ["Epistemology asks: How do we know what we know?", "The course covers epistemology and metaphysics."], category: "Academic" },

  // More arts
  { word: "motif", pronunciation: "/məʊˈtiːf/", pos: "noun", translation: "主题；动机；图案", definition: "A decorative image or design, especially a repeated one; a dominant or recurring theme.", examples: ["The floral motif appears throughout the painting.", "The motif of water runs through the novel."], category: "Arts" },
  { word: "sonnet", pronunciation: "/ˈsɒn.ɪt/", pos: "noun", translation: "十四行诗", definition: "A poem of fourteen lines using any of a number of formal rhyme schemes, typically having ten syllables per line.", examples: ["Shakespeare wrote 154 sonnets.", "The sonnet form has strict rules."], category: "Arts" },
  { word: "fresco", pronunciation: "/ˈfres.kəʊ/", pos: "noun", translation: "壁画；湿壁画", definition: "A painting done rapidly in watercolor on wet plaster on a wall or ceiling.", examples: ["The Sistine Chapel ceiling is a famous fresco.", "Fresco technique requires working quickly."], category: "Arts" },
  { word: "lithograph", pronunciation: "/ˈlɪθ.ə.ɡrɑːf/", pos: "noun", translation: "石版画；平版印刷", definition: "A print made by lithography, a method of printing from a flat surface.", examples: ["The artist created a limited edition lithograph.", "Lithography allows for detailed reproductions."], category: "Arts" },
  { word: "madrigal", pronunciation: "/ˈmæd.rɪ.ɡəl/", pos: "noun", translation: "牧歌；无伴奏合唱", definition: "A part-song for several voices, especially one of the Renaissance type.", examples: ["The choir performed an Italian madrigal.", "Madrigals were popular in 16th-century England."], category: "Arts" },

  // More emotions
  { word: "jubilant", pronunciation: "/ˈdʒuː.bɪ.lənt/", pos: "adjective", translation: "欢欣的；喜气洋洋的", definition: "Feeling or expressing great happiness and triumph.", examples: ["The jubilant crowd celebrated the victory.", "She was jubilant about her promotion."], category: "Emotions" },
  { word: "forlorn", pronunciation: "/fəˈlɔːn/", pos: "adjective", translation: "孤独的；凄凉的；绝望的", definition: "Pitifully sad and abandoned or lonely; unlikely to succeed or be fulfilled.", examples: ["The forlorn puppy sat in the rain.", "She had a forlorn expression on her face."], category: "Emotions" },
  { word: "exasperated", pronunciation: "/ɪɡˈzɑː.spə.reɪ.tɪd/", pos: "adjective", translation: "恼怒的；恼怒至极的", definition: "Intensely irritated and frustrated.", examples: ["She was exasperated by the constant delays.", "His exasperated sigh said everything."], category: "Emotions" },
  { word: "elated", pronunciation: "/ɪˈleɪ.tɪd/", pos: "adjective", translation: "兴高采烈的；得意洋洋的", definition: "Ecstatically happy; in high spirits.", examples: ["She was elated by the good news.", "The elated team celebrated their win."], category: "Emotions" },
  { word: "disgruntled", pronunciation: "/dɪsˈɡrʌn.təld/", pos: "adjective", translation: "不满的；不高兴的", definition: "Angry or dissatisfied.", examples: ["Disgruntled employees left negative reviews.", "The disgruntled customer demanded a refund."], category: "Emotions" },
  { word: "bewildered", pronunciation: "/bɪˈwɪl.dəd/", pos: "adjective", translation: "困惑的；不知所措的", definition: "Completely puzzled or confused.", examples: ["He had a bewildered expression on his face.", "I was bewildered by the complex instructions."], category: "Emotions" },
  { word: "contentment", pronunciation: "/kənˈtent.mənt/", pos: "noun", translation: "满足；满意", definition: "A state of happiness and satisfaction.", examples: ["She found contentment in simple pleasures.", "True contentment comes from within."], category: "Emotions" },
  { word: "infatuation", pronunciation: "/ɪnˌfætʃ.uˈeɪ.ʃən/", pos: "noun", translation: "迷恋；热恋", definition: "An intense but short-lived passion or admiration for someone or something.", examples: ["Their romance was just a fleeting infatuation.", "His infatuation with the idea soon faded."], category: "Emotions" },
  { word: "remorse", pronunciation: "/rɪˈmɔːs/", pos: "noun", translation: "懊悔；悔恨", definition: "Deep regret or guilt for a wrong committed.", examples: ["He felt remorse for his actions.", "She showed no remorse for what she had done."], category: "Emotions" },
  { word: "jubilation", pronunciation: "/ˌdʒuː.bɪˈleɪ.ʃən/", pos: "noun", translation: "欢腾；欢庆", definition: "A feeling of great happiness and triumph.", examples: ["Jubilation filled the streets after the victory.", "The news was met with widespread jubilation."], category: "Emotions" },

  // More idioms
  { word: "bite off more than you can chew", pronunciation: "/baɪt ɒf mɔːr ðæn juː kæn tʃuː/", pos: "idiom", translation: "贪多嚼不烂", definition: "To take on more responsibility than you can handle.", examples: ["I bit off more than I can chew by taking three jobs.", "Don't bite off more than you can chew."], category: "Idioms" },
  { word: "cut corners", pronunciation: "/kʌt ˈkɔː.nərz/", pos: "idiom", translation: "偷工减料；走捷径", definition: "To do something in the easiest or cheapest way, often sacrificing quality.", examples: ["Don't cut corners on safety.", "The builder cut corners and the roof leaked."], category: "Idioms" },
  { word: "hit the sack", pronunciation: "/hɪt ðə sæk/", pos: "idiom", translation: "去睡觉", definition: "To go to bed.", examples: ["I'm exhausted; I'm going to hit the sack.", "We hit the sack early after the long hike."], category: "Idioms" },
  { word: "miss the boat", pronunciation: "/mɪs ðə bəʊt/", pos: "idiom", translation: "错失良机", definition: "To miss an opportunity.", examples: ["I missed the boat on that investment.", "Don't miss the boat — apply now!"], category: "Idioms" },
  { word: "on the ball", pronunciation: "/ɒn ðə bɔːl/", pos: "idiom", translation: "机灵的；能干的", definition: "Doing a good job; being aware and competent.", examples: ["The new employee is really on the ball.", "You need to be on the ball in this industry."], category: "Idioms" },
  { word: "pull someone's leg", pronunciation: "/pʊl ˈsʌm.wʌnz leɡ/", pos: "idiom", translation: "开某人玩笑；捉弄", definition: "To joke or tease someone by saying something that is not true.", examples: ["Are you serious or just pulling my leg?", "He was just pulling your leg about the merger."], category: "Idioms" },
  { word: "sit on the fence", pronunciation: "/sɪt ɒn ðə fens/", pos: "idiom", translation: "保持中立；骑墙", definition: "To remain neutral and avoid committing to one side of an argument.", examples: ["Don't sit on the fence — make a decision!", "He sat on the fence during the debate."], category: "Idioms" },
  { word: "steal someone's thunder", pronunciation: "/stiːl ˈsʌm.wʌnz ˈθʌn.dər/", pos: "idiom", translation: "抢某人风头", definition: "To take attention or praise away from someone else's achievement.", examples: ["She stole my thunder by announcing my news first.", "The sequel stole the original's thunder."], category: "Idioms" },
  { word: "take with a grain of salt", pronunciation: "/teɪk wɪð ə ɡreɪn əv sɔːlt/", pos: "idiom", translation: "半信半疑", definition: "To view something with skepticism; not take it too literally.", examples: ["Take his advice with a grain of salt.", "You should take those rumors with a grain of salt."], category: "Idioms" },
  { word: "the elephant in the room", pronunciation: "/ðə ˈel.ɪ.fənt ɪn ðə ruːm/", pos: "idiom", translation: "显而易见却被回避的问题", definition: "An obvious major problem or controversial issue that no one wants to discuss.", examples: ["The budget cuts were the elephant in the room.", "Let's address the elephant in the room."], category: "Idioms" },

  // More nature
  { word: "aurora", pronunciation: "/ɔːˈrɔː.rə/", pos: "noun", translation: "极光", definition: "A natural electrical phenomenon characterized by the appearance of streamers of reddish or greenish light in the sky.", examples: ["The aurora borealis is visible in Norway.", "We watched the aurora dance across the sky."], category: "Nature" },
  { word: "fjord", pronunciation: "/fjɔːd/", pos: "noun", translation: "峡湾", definition: "A long, narrow, deep inlet of the sea between high cliffs.", examples: ["Norway is famous for its beautiful fjords.", "The fjord was carved by glaciers."], category: "Nature" },
  { word: "geyser", pronunciation: "/ˈɡaɪ.zər/", pos: "noun", translation: "间歇泉", definition: "A hot spring in which water intermittently boils, sending a tall column of water and steam into the air.", examples: ["Old Faithful is a famous geyser in Yellowstone.", "The geyser erupts every 90 minutes."], category: "Nature" },
  { word: "isthmus", pronunciation: "/ˈɪs.məs/", pos: "noun", translation: "地峡", definition: "A narrow strip of land with sea on either side, forming a link between two larger areas of land.", examples: ["Panama is on the isthmus connecting North and South America.", "The Isthmus of Suez connects Africa and Asia."], category: "Nature" },
  { word: "lagoon", pronunciation: "/ləˈɡuːn/", pos: "noun", translation: "泻湖；环礁湖", definition: "A stretch of salt water separated from the sea by a low sandbank or coral reef.", examples: ["The tropical island had a beautiful lagoon.", "The lagoon was teeming with marine life."], category: "Nature" },
  { word: "peninsula", pronunciation: "/pəˈnɪn.sjə.lə/", pos: "noun", translation: "半岛", definition: "A piece of land almost surrounded by water or projecting out into a body of water.", examples: ["Italy is a peninsula in Southern Europe.", "The Korean Peninsula has a complex history."], category: "Nature" },
  { word: "reef", pronunciation: "/riːf/", pos: "noun", translation: "礁；暗礁", definition: "A ridge of jagged rock, coral, or sand just above or below the surface of the sea.", examples: ["The Great Barrier Reef is the world's largest coral reef.", "The ship wrecked on the reef."], category: "Nature" },
  { word: "savanna", pronunciation: "/səˈvæn.ə/", pos: "noun", translation: "热带草原", definition: "A grassy plain in tropical and subtropical regions, with few trees.", examples: ["African savannas are home to lions and elephants.", "The savanna has a dry and wet season."], category: "Nature" },
  { word: "waterfall", pronunciation: "/ˈwɔː.tər.fɔːl/", pos: "noun", translation: "瀑布", definition: "A cascade of water falling from a height, formed when a river or stream flows over a precipice.", examples: ["Niagara Falls is a famous waterfall.", "The waterfall created a beautiful rainbow."], category: "Nature" },
  { word: "zephyr", pronunciation: "/ˈzef.ər/", pos: "noun", translation: "和风；西风", definition: "A soft gentle breeze; in Greek mythology, the west wind.", examples: ["A pleasant zephyr cooled the summer afternoon.", "The zephyr rustled the leaves gently."], category: "Nature" },

  // More philosophy
  { word: "altruism", pronunciation: "/ˈæl.truː.ɪz.əm/", pos: "noun", translation: "利他主义", definition: "The belief in or practice of disinterested and selfless concern for the well-being of others.", examples: ["Altruism is the opposite of selfishness.", "She was motivated by pure altruism."], category: "Philosophy" },
  { word: "hedonism", pronunciation: "/ˈhed.ən.ɪz.əm/", pos: "noun", translation: "享乐主义", definition: "The pursuit of pleasure; sensual self-indulgence.", examples: ["Hedonism was the ethical theory of the Epicureans.", "His lifestyle reflects pure hedonism."], category: "Philosophy" },
  { word: "libertarianism", pronunciation: "/ˌlɪb.əˈteə.ri.ə.nɪz.əm/", pos: "noun", translation: "自由意志主义", definition: "An extreme laissez-faire political philosophy advocating only minimal state intervention.", examples: ["Libertarianism emphasizes individual freedom.", "He was drawn to libertarianism in college."], category: "Philosophy" },
  { word: "skepticism", pronunciation: "/ˈskep.tɪ.sɪz.əm/", pos: "noun", translation: "怀疑主义", definition: "A skeptical attitude; doubt as to the truth of something; the doctrine that true knowledge is uncertain.", examples: ["Healthy skepticism is important in science.", "Philosophical skepticism questions the possibility of certainty."], category: "Philosophy" },
  { word: "teleology", pronunciation: "/ˌtel.iˈɒl.ə.dʒi/", pos: "noun", translation: "目的论", definition: "The explanation of phenomena by the purpose they serve rather than by postulated causes.", examples: ["Teleology holds that nature has a purpose.", "The argument from design is a teleological argument."], category: "Philosophy" },

  // More literature
  { word: "ballad", pronunciation: "/ˈbæl.əd/", pos: "noun", translation: "歌谣；叙事诗", definition: "A poem or song narrating a story in short stanzas.", examples: ["The folk ballad told of a tragic love story.", "Bob Dylan wrote many modern ballads."], category: "Literature" },
  { word: "elegy", pronunciation: "/ˈel.ə.dʒi/", pos: "noun", translation: "挽歌；悲歌", definition: "A poem of serious reflection, typically a lament for the dead.", examples: ["Gray's Elegy Written in a Country Churchyard is famous.", "The poet wrote an elegy for his friend."], category: "Literature" },
  { word: "limerick", pronunciation: "/ˈlɪm.ər.ɪk/", pos: "noun", translation: "五行打油诗", definition: "A humorous five-line poem with an AABBA rhyme scheme.", examples: ["He composed a funny limerick about a cat.", "Limericks are popular in English verse."], category: "Literature" },
  { word: "parody", pronunciation: "/ˈpær.ə.di/", pos: "noun", translation: "模仿作品；滑稽模仿", definition: "An imitation of the style of a particular writer, artist, or genre with deliberate exaggeration for comic effect.", examples: ["The film is a parody of spy movies.", "Weird Al is famous for his musical parodies."], category: "Literature" },
  { word: "stanza", pronunciation: "/ˈstæn.zə/", pos: "noun", translation: "诗节", definition: "A group of lines forming the basic recurring metrical unit in a poem; a verse.", examples: ["Each stanza of the poem has four lines.", "The final stanza brings the poem to a close."], category: "Literature" },
];

// Deduplicate by word+pronunciation
const seen = new Set<string>();
const UNIQUE_DICT: DictEntry[] = [];
for (const entry of DICTIONARY) {
  const key = (entry.word + entry.pronunciation).toLowerCase();
  if (!seen.has(key)) {
    seen.add(key);
    UNIQUE_DICT.push(entry);
  }
}

/* ─────────────── constants ─────────────── */

const CATEGORIES = ["All", "Common", "Academic", "Business", "Technology", "Science", "Arts", "Nature", "Emotions", "Philosophy", "Literature", "Cultural", "Idioms"];

const LS_FAVORITES = "inkos_dict_favorites";
const LS_HISTORY = "inkos_dict_history";
const LS_WORD_DAY = "inkos_dict_wordofday";
const LS_WORD_DAY_DATE = "inkos_dict_wordofday_date";

/* ─────────────── helper components ─────────────── */

function TabButton({ icon, active, onClick, label }: { icon: React.ReactNode; active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 py-3 px-1 transition-all duration-150"
      style={{
        backgroundColor: active ? "var(--cinnabar)" : "transparent",
        color: active ? "white" : "var(--ink-500)",
      }}
      title={label}
    >
      {icon}
      <span className="text-[9px]">{label}</span>
    </button>
  );
}

function PosTag({ pos }: { pos: string }) {
  return (
    <span
      className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: "var(--ink-200)", color: "var(--ink-700)" }}
    >
      {pos}
    </span>
  );
}

export default function Dictionary() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "history" | "favorites" | "wordofday">("search");
  const [selectedEntry, setSelectedEntry] = useState<DictEntry | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_FAVORITES) || "[]"); } catch { return []; }
  });
  const [history, setHistory] = useState<{ word: string; time: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_HISTORY) || "[]"); } catch { return []; }
  });
  const [activeCategory, setActiveCategory] = useState("All");
  const [copied, setCopied] = useState(false);
  const [suggestions, setSuggestions] = useState<DictEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Word of the day
  const [wordOfDay, setWordOfDay] = useState<DictEntry | null>(null);

  useEffect(() => {
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem(LS_WORD_DAY_DATE);
    if (savedDate === today) {
      const saved = localStorage.getItem(LS_WORD_DAY);
      if (saved) {
        const entry = UNIQUE_DICT.find(e => e.word === saved);
        if (entry) { setWordOfDay(entry); return; }
      }
    }
    const idx = Math.floor(Math.random() * UNIQUE_DICT.length);
    const wod = UNIQUE_DICT[idx];
    setWordOfDay(wod);
    localStorage.setItem(LS_WORD_DAY, wod.word);
    localStorage.setItem(LS_WORD_DAY_DATE, today);
  }, []);

  // Persist favorites & history
  useEffect(() => { localStorage.setItem(LS_FAVORITES, JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem(LS_HISTORY, JSON.stringify(history)); }, [history]);

  const filtered = useMemo(() => {
    if (!query.trim() && activeCategory === "All") return [];
    let results = UNIQUE_DICT;
    if (activeCategory !== "All") {
      results = results.filter(e => e.category === activeCategory);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      results = results.filter(
        e =>
          e.word.toLowerCase().includes(q) ||
          e.translation.toLowerCase().includes(q) ||
          e.definition.toLowerCase().includes(q) ||
          e.pronunciation.toLowerCase().includes(q)
      );
    }
    return results;
  }, [query, activeCategory]);

  const handleSearch = useCallback((entry: DictEntry) => {
    setSelectedEntry(entry);
    setShowSuggestions(false);
    setQuery(entry.word);
    // Add to history
    setHistory(prev => {
      const filtered = prev.filter(h => h.word !== entry.word);
      return [{ word: entry.word, time: Date.now() }, ...filtered].slice(0, 50);
    });
  }, []);

  const toggleFavorite = useCallback((word: string) => {
    setFavorites(prev => prev.includes(word) ? prev.filter(w => w !== word) : [...prev, word]);
  }, []);

  const clearHistory = useCallback(() => { setHistory([]); }, []);

  const randomWord = useCallback(() => {
    const idx = Math.floor(Math.random() * UNIQUE_DICT.length);
    handleSearch(UNIQUE_DICT[idx]);
    setActiveTab("search");
  }, [handleSearch]);

  const handleCopy = useCallback(() => {
    if (!selectedEntry) return;
    const text = `${selectedEntry.word} ${selectedEntry.pronunciation}\n[${selectedEntry.pos}] ${selectedEntry.translation}\n${selectedEntry.definition}\n\nExamples:\n${selectedEntry.examples.join("\n")}`;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [selectedEntry]);

  const handleInputChange = (val: string) => {
    setQuery(val);
    setSelectedEntry(null);
    if (val.length >= 1) {
      const q = val.toLowerCase();
      const suggs = UNIQUE_DICT.filter(e =>
        e.word.toLowerCase().includes(q) ||
        e.translation.toLowerCase().includes(q)
      ).slice(0, 5);
      setSuggestions(suggs);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const favoriteEntries = useMemo(() => {
    return favorites.map(w => UNIQUE_DICT.find(e => e.word === w)).filter(Boolean) as DictEntry[];
  }, [favorites]);

  // Count
  const count = UNIQUE_DICT.length;

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: "var(--ink-50)" }}>
      {/* Search Bar */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full border"
            style={{ backgroundColor: "var(--glass-bg)", borderColor: "var(--ink-200)", backdropFilter: "blur(8px)" }}
          >
            <Search size={16} style={{ color: "var(--ink-500)" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && filtered.length > 0) handleSearch(filtered[0]);
              }}
              placeholder={`搜索 ${count}+ 词汇 (Search words)...`}
              className="flex-1 bg-transparent outline-none text-body-md"
              style={{ color: "var(--ink-900)", fontSize: "14px" }}
            />
            {query && (
              <button onClick={() => { setQuery(""); setSelectedEntry(null); setShowSuggestions(false); }}>
                <X size={14} style={{ color: "var(--ink-400)" }} />
              </button>
            )}
          </div>

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              className="absolute left-0 right-0 mt-1 rounded-lg border overflow-hidden z-10"
              style={{ backgroundColor: "var(--glass-active)", borderColor: "var(--ink-200)", backdropFilter: "blur(12px)" }}
            >
              {suggestions.map(s => (
                <button
                  key={s.word}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors duration-75 hover:bg-[rgba(26,26,26,0.05)]"
                  onClick={() => handleSearch(s)}
                >
                  <Search size={12} style={{ color: "var(--ink-400)" }} />
                  <span className="text-body-md font-medium" style={{ color: "var(--ink-800)" }}>{s.word}</span>
                  <span className="text-body-sm" style={{ color: "var(--ink-500)" }}>{s.translation}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                if (cat !== "All") setActiveTab("search");
              }}
              className="px-2.5 py-0.5 rounded-full text-[11px] whitespace-nowrap transition-all duration-75"
              style={{
                backgroundColor: activeCategory === cat ? "var(--ink-800)" : "var(--ink-200)",
                color: activeCategory === cat ? "var(--ink-50)" : "var(--ink-600)",
              }}
            >
              {cat === "All" ? "全部" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {activeTab === "wordofday" && wordOfDay && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} style={{ color: "var(--warning)" }} />
                <span className="text-body-md font-semibold" style={{ color: "var(--ink-800)" }}>每日一词 (Word of the Day)</span>
              </div>
              <EntryCard
                entry={wordOfDay}
                isFav={favorites.includes(wordOfDay.word)}
                onToggleFav={() => toggleFavorite(wordOfDay.word)}
                onCopy={handleCopy}
                copied={copied}
              />
            </div>
          )}

          {activeTab === "favorites" && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-body-md font-semibold" style={{ color: "var(--ink-800)" }}>
                  收藏 (Favorites) — {favoriteEntries.length}
                </span>
              </div>
              {favoriteEntries.length === 0 ? (
                <EmptyState icon={<Bookmark size={32} style={{ color: "var(--ink-300)" }} />} text="暂无收藏 (No favorites yet)" />
              ) : (
                <div className="space-y-2">
                  {favoriteEntries.map(e => (
                    <button
                      key={e.word}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all duration-75"
                      style={{ backgroundColor: "var(--ink-100)" }}
                      onClick={() => { handleSearch(e); setActiveTab("search"); }}
                    >
                      <Star size={14} style={{ color: "var(--warning)" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-body-md font-medium" style={{ color: "var(--ink-900)" }}>{e.word}</span>
                          <PosTag pos={e.pos} />
                        </div>
                        <span className="text-body-sm truncate block" style={{ color: "var(--ink-600)" }}>{e.translation}</span>
                      </div>
                      <ChevronRight size={14} style={{ color: "var(--ink-400)" }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-body-md font-semibold" style={{ color: "var(--ink-800)" }}>
                  搜索历史 (History) — {history.length}
                </span>
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded"
                    style={{ color: "var(--cinnabar)" }}
                  >
                    <Trash2 size={12} /> 清除 (Clear)
                  </button>
                )}
              </div>
              {history.length === 0 ? (
                <EmptyState icon={<History size={32} style={{ color: "var(--ink-300)" }} />} text="暂无搜索历史 (No search history)" />
              ) : (
                <div className="space-y-1">
                  {history.map((h, i) => {
                    const entry = UNIQUE_DICT.find(e => e.word === h.word);
                    return (
                      <button
                        key={h.word + i}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-75 hover:bg-[rgba(26,26,26,0.03)]"
                        style={{ backgroundColor: "var(--ink-100)" }}
                        onClick={() => { if (entry) { handleSearch(entry); setActiveTab("search"); } }}
                      >
                        <History size={12} style={{ color: "var(--ink-400)" }} />
                        <span className="text-body-md" style={{ color: "var(--ink-800)" }}>{h.word}</span>
                        <span className="text-body-sm flex-1" style={{ color: "var(--ink-500)" }}>{entry?.translation}</span>
                        <span className="text-[10px]" style={{ color: "var(--ink-400)" }}>
                          {new Date(h.time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "search" && (
            <>
              {selectedEntry ? (
                <div className="mt-2">
                  <EntryCard
                    entry={selectedEntry}
                    isFav={favorites.includes(selectedEntry.word)}
                    onToggleFav={() => toggleFavorite(selectedEntry.word)}
                    onCopy={handleCopy}
                    copied={copied}
                  />
                </div>
              ) : (
                <>
                  {filtered.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      <div className="text-[11px] mb-2" style={{ color: "var(--ink-500)" }}>
                        找到 {filtered.length} 个结果 (Found {filtered.length} results)
                      </div>
                      {filtered.map(e => (
                        <button
                          key={e.word}
                          className="w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all duration-75 hover:bg-[rgba(26,26,26,0.03)]"
                          style={{ backgroundColor: "var(--ink-100)" }}
                          onClick={() => handleSearch(e)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-body-md font-medium" style={{ color: "var(--ink-900)" }}>{e.word}</span>
                              <PosTag pos={e.pos} />
                              {favorites.includes(e.word) && <Star size={12} style={{ color: "var(--warning)" }} />}
                            </div>
                            <div className="text-body-sm" style={{ color: "var(--ink-500)" }}>{e.pronunciation}</div>
                            <div className="text-body-sm truncate" style={{ color: "var(--ink-700)" }}>{e.translation}</div>
                          </div>
                          <ChevronRight size={14} style={{ color: "var(--ink-400)" }} className="mt-1 shrink-0" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-12">
                      <EmptyState
                        icon={<BookOpen size={36} style={{ color: "var(--ink-300)" }} />}
                        text={query ? "未找到匹配词汇 (No matches found)" : "输入单词开始搜索 (Type to search)"}
                      />
                      {/* Quick actions */}
                      <div className="flex justify-center gap-3 mt-6">
                        <QuickActionButton icon={<Shuffle size={14} />} label="随机 (Random)" onClick={randomWord} />
                        <QuickActionButton icon={<Sparkles size={14} />} label="每日一词 (WOTD)" onClick={() => setActiveTab("wordofday")} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Right Sidebar Tabs */}
        <div
          className="w-12 shrink-0 flex flex-col gap-1 py-2 border-l"
          style={{ backgroundColor: "var(--ink-100)", borderColor: "var(--ink-200)" }}
        >
          <TabButton
            icon={<Search size={18} />}
            active={activeTab === "search"}
            onClick={() => setActiveTab("search")}
            label="搜索"
          />
          <TabButton
            icon={<History size={18} />}
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            label="历史"
          />
          <TabButton
            icon={<Star size={18} />}
            active={activeTab === "favorites"}
            onClick={() => setActiveTab("favorites")}
            label="收藏"
          />
          <TabButton
            icon={<Sparkles size={18} />}
            active={activeTab === "wordofday"}
            onClick={() => setActiveTab("wordofday")}
            label="每日"
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────── sub-components ─────────────── */

function EntryCard({ entry, isFav, onToggleFav, onCopy, copied }: {
  entry: DictEntry; isFav: boolean; onToggleFav: () => void; onCopy: () => void; copied: boolean;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ backgroundColor: "var(--ink-100)", border: "1px solid var(--ink-200)" }}
    >
      {/* Word Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2
            className="text-heading-lg mb-1"
            style={{ fontFamily: "'ZCOOL XiaoWei', serif", color: "var(--ink-900)" }}
          >
            {entry.word}
          </h2>
          <div className="flex items-center gap-2">
            <span className="font-mono text-body-sm" style={{ color: "var(--ink-500)" }}>
              {entry.pronunciation}
            </span>
            <Volume2 size={14} style={{ color: "var(--ink-400)" }} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleFav}
            className="p-1.5 rounded-full transition-all duration-150"
            style={{ color: isFav ? "var(--warning)" : "var(--ink-400)" }}
            title="收藏 (Favorite)"
          >
            <Star size={18} fill={isFav ? "var(--warning)" : "none"} />
          </button>
          <button
            onClick={onCopy}
            className="p-1.5 rounded-full transition-all duration-150"
            style={{ color: copied ? "var(--success)" : "var(--ink-400)" }}
            title="复制 (Copy)"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
      </div>

      {/* POS & Category */}
      <div className="flex items-center gap-2 mb-3">
        <PosTag pos={entry.pos} />
        <span
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ backgroundColor: "var(--wash-light)", color: "var(--ink-600)" }}
        >
          {entry.category}
        </span>
      </div>

      {/* Translation */}
      <div className="mb-3">
        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--ink-500)" }}>
          翻译 (Translation)
        </span>
        <p className="text-body-md font-medium mt-0.5" style={{ color: "var(--cinnabar)" }}>
          {entry.translation}
        </p>
      </div>

      {/* Definition */}
      <div className="mb-3">
        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--ink-500)" }}>
          定义 (Definition)
        </span>
        <p className="text-body-md mt-0.5" style={{ color: "var(--ink-800)" }}>
          {entry.definition}
        </p>
      </div>

      {/* Examples */}
      <div>
        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--ink-500)" }}>
          例句 (Examples)
        </span>
        <div className="mt-1 space-y-2">
          {entry.examples.map((ex, i) => (
            <div
              key={i}
              className="pl-3 py-1.5"
              style={{
                borderLeft: "3px solid var(--ink-300)",
                color: "var(--ink-600)",
                fontSize: "13px",
                lineHeight: "1.6",
              }}
            >
              {ex}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      {icon}
      <p className="text-body-sm mt-3" style={{ color: "var(--ink-400)" }}>{text}</p>
    </div>
  );
}

function QuickActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] transition-all duration-75"
      style={{ backgroundColor: "var(--ink-200)", color: "var(--ink-700)" }}
    >
      {icon}
      {label}
    </button>
  );
}
