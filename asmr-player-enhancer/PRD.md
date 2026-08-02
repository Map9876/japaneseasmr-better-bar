# PRD: ASMR Player Enhancer 浏览器扩展

**文档版本**: 2.0  
**创建时间**: 2026-05-03 12:15:36 (北京时间)  
**最后更新**: 2026-05-03  
**项目路径**: /workspace/asmr-player-enhancer  

---

## 用户原始需求（一字不落）

### 第一次对话（2026-05-03 12:15:36）

> 你好写浏览器拓展，捕捉网站播放的音频，可能具体来说是一个图片加进度条类似于视频的效果。你可以具体去看，https://japaneseasmr.com/145144/?__cf_chl_tk=nfPCy7NjKLjU1f4ratOi45.x0xMCGPVzhEbfFSc5tWA-1777748196-1.0.1.1-tUwZwZlEcqB_mLk3mX4T0.jIdur3OP7BKY6yNvL2n_Q。生成一个占满左屏幕边缘到到右侧的进度条，因为该网站手机模式下进度条太小了，一个小时的视频，然后那个图片最好也同时放大，相当于还是还有那个窗口，但是优化进度条，还有就是位于图片范围内左右拖，可以前后移动进度同时中心偏下会显示具体时间，然后就是它显示的是剩余播放时间，修改为已经播放时间，然后就是它下面有一个track列表  トラックリスト00:00:001 パパのこと……ずっと好きだったの。ダメ？♡00:11:572 パパのカ  这个点击这里文字时候，它进度条就会跳转到对应的时间位置， 我想的是怎么有个阶梯状进度条，也就是，相当于在主进度条的下面，也就是类似于视频框的图片下面。还有多段每个track的进度条，比如第一，可check的进度条就在距离主进度条最近的位置。第2个track的进度条就位于再下面一点的位置，这样我可以拖动6个进度条的位置，相当于精确调整我想要听哪一个trap的哪一个小节。问题是这样的话，将一个屏幕的横分为6段，那其实可操作的，那条线段其实很短。上面只是我随便设想的。还有一种方案就是直接在这个check是一行一行排列的他们这个标题，那直接在标题的下方每个下方都弄一个进度条即可。你可以更加考虑一下更好的用户交互设计，以及UiUx设计等等，需要注意的是，在主进度条上面的那个图片框，左右拖动的时候，前进，拖动，从最左侧推动拖动到最右侧的时间，不要前进太多，可以前进一分半钟最好，这个怎么实现呢？是直接取用户横屏的像素值，然后设定拖动这个像素，100%时前进这么多吗？我没明白怎么在网页中设计，但是在各种手机app，比如说哔哩哔哩还有或者纯的视频播放器中，反正每个app他们拖动，相同距离时，他们前进的时间各不相同，但他们每个都是固定的。他们这种是怎么实现的呢？反正我感觉哔哩哔哩的最好操作，它从屏幕最左侧推动到最右侧横屏时，也就是大概2160的像素值时，前进的分钟数刚好是1分30秒。麻烦你写一个prd开发文档，然后把我的此次所说的完整的话一字不落的写入里面精确到现在的时间。你可以使用时间api curl一下现在具体的北京时间。然后你直接进行开发即可。关于这个网站的问题，现在最你最先最先需要解决的是克隆下面这个储存库https://cnb.cool/kfc60/test/-/tree/master/japanese-asmr-parser 然后把这个Japanese asmr parser这个文件夹作为参考项目移动到workspace文件夹下即可。整个储存库克隆到/tmp后续就直接不用管他了，可以扔掉了， Ok了，你开始进行开发吧

### 第二次对话

> 非常好无敌爆炸好，麻烦你把我至今所有说过的话一字不落的继续写入包括这句。然后你这次所说的报告也写入，然后我想说的是，这是不是不利于继续开发或者给别的无记忆的ai进行多次的开发，比如未来半年后进行开发，或者一年进行开发，因为我考虑这是根据具体的元素去获取的，有没有方法直接去获取他的m3u8什么之类的，正则表达式之类的，这就跟我们之前所说的playwright一样。我还有一个发现就是chRome dev tools mcp 我一直不知道这些软件，它能不能就是直接相当于浏览器的df tools，也就是说ai打开一个软件，它可以直接有个api I可以得到该网站所有的类似于浏览器f12的所有的网络xhrjsccs静态、动态等。请求，请求头等等所有的信息。也就是说获取后。再交由ai进行动态分析。这样一个流程，而不是说像我刚才发送的那个play w right脚本一样，去使用固定的 html你的标签去锁定东西，这样的话根本就是静态的，很不灵活。不过现在反正已经搞好了，有个问题是那个长按左右拖动的时候，那两个箭头的背景有一个黑框的矩形，是黑色的。这个需要删除掉，还有这个就是左右挪动的。先把它设置一个按钮关闭掉吧，因为我发现他会影响上下拖动网页的时候会误触，而且他左右拖动的时候，那个时间轴的描述也需要实时的变化，现在没有变化。其他的都非常好，诸如我左右移动下面的分时间轴的时候，他那个音频会快进刚好，然后下方的总进度条的秒数也会根据拖动分进度条时进行秒级的变化，这点也非常好。有个问题就是每个时间轴的左上角。最好显示当前track播放的已播放时间和总时间比如说00:01/16:45 就是这个track有16分45秒，已经播放了一秒钟，不过这样可能还会略显紧凑，还有另一种方案就是我刚才说的梯度，梯形的 ui设计， 也就是说类似于文字"三" 这样。这样的外表样式。当拖动。其中一条时候，另外几条就收紧间距等等，你可以考虑一下怎么设置这个交互页面，其实就类似于传统的那种展开列表页式的手机交互页面或者亚马逊。的那种ui ux平面设计等等。我其实还有一个方案是，就是直接使用它的m3u8的链接，因为它就是直接。这些很规律的域名加路径，然后加对应的rj号就可以了。然后好像要加上该Japanese asm r.com om 的 referer就可以获取到了，也就是说我完全可以自己搭建一个基于webview的apk里面使用这个referer进行Curl并展现自己一个独立的ui，还有就是这个app，其实我也想之前我是想的另有目标，以下是之前的想法: "核心需求变更：从DLNA投屏转向双手机音频同步播放。A手机在asmr-300.com浏览+控制，B手机（枕头下）接收音频+显示歌词。同时需要下载功能（类aria2 RPC），可能基于kikoeru二次开发。
> 
> 一、项目背景
> 
> 使用场景
> 
> A手机（主力手机）：在 asmr-300.com 网站（基于开源项目 kikoeru-express）浏览音声、点击播放、操控进度
> 
> B手机（枕头下）：接收A手机发送的音频链接，同步播放，显示歌词。A手机切到别的app后B手机继续播放
> 
> 下载需求：从 asmr-300.com 下载音声文件到本地，按文件夹结构保存
> 
> 核心痛点
> 
> ASMR听音声时需要把手机塞枕头下当"耳机"，但主力手机还要用来做别的事
> 
> B手机单独播放歌词不方便看（无封面、无文件夹列表、无法快速切换）
> 
> 下载音声文件需要保留文件夹结构（一个音声就是一个文件夹，含子文件夹、mp3、lrc等）
> 
> 二、kikoeru API 分析
> 
> 基础信息
> 
> 前端网站: https://asmr-300.com
> 
> API 基础地址: https://api.asmr-300.com
> 
> 开源后端: kikoeru-express
> 
> 认证: JWT Token（部分API需要）
> 
> 核心API端点
> 
> 1. 获取音声文件夹树结构
> 
> GET /api/tracks/{id}?v=2 
> 
> 完整API响应示例（已去除R18内容，保留结构）：
> 
> [ { "type": "folder", "title": "音声标题", "children": [ { "type": "folder", "title": "特典文件夹", "children": [ { "type": "folder", "title": "mp3", "children": [ { "type": "audio", "hash": "1441165/1606208", "title": "01音频标题.mp3", "work": { "id": 1441165, "source_id": "RJ01441165", "source_type": "DLSITE" }, "workTitle": "音声完整标题", "mediaStreamUrl": "https://raw.kiko-play-niptan.one/media/stream/daily/2025-09-19/RJ01441165/.../01音频标题.mp3", "mediaDownloadUrl": "https://raw.kiko-play-niptan.one/media/download/daily/2025-09-19/RJ01441165/.../01音频标题.mp3", "streamLowQualityUrl": "", "duration": 179.04, "size": 8580443 } ] } ] }, { "type": "folder", "title": "歌词文件夹", "children": [ { "type": "text", "hash": "1441165/1606215", "title": "01歌词标题.lrc", "work": { "id": 1441165, "source_id": "RJ01441165", "source_type": "DLSITE" }, "workTitle": "音声完整标题", "mediaStreamUrl": "https://api.asmr-300.com/api/media/stream/1441165/1606215", "mediaDownloadUrl": "https://raw.kiko-play-niptan.one/media/download/...", "size": 5234 } ] }, { "type": "image", "hash": "1441165/1606230", "title": "封面.jpg", "work": { "id": 1441165, "source_id": "RJ01441165", "source_type": "DLSITE" }, "workTitle": "音声完整标题", "mediaStreamUrl": "https://raw.kiko-play-niptan.one/media/stream/...", "mediaDownloadUrl": "https://raw.kiko-play-niptan.one/media/download/..." } ] } ] 
> 
> 关键字段说明：
> 
> 字段类型说明typestringfolder / audio / text / image / otherhashstring"{workId}/{index}" 格式，用于stream/download APImediaStreamUrlstring音频流式播放URL（支持Range请求）mediaDownloadUrlstring下载URL（Content- " ，  ， 其实主要就是类似于制作一个app或者是一个基于代码的，既可以基于源码启动或者基于二进制文件，在termux中启动后，它能够开启一个Web application，这个aPK或者web application的后端都可以对asmr-300.com 网页中得到的api I的响应，里面有对应的包含文件夹结构的下载链接。根据他去下载到手机的对应位置，其实这说白了就主要是去。用一个网页的api里面提供的文件路径以及链接去下载到手机上。说白了费这么大事就是为了解决手机浏览器上没有下载文件到对应文件夹的限制，相当于自己再起一个 app或者web application其UI或者。前端都是asmr-300.com 的也就是kikoeru样式，同时具有其下载的歌词展示一级页面，说白了，这就是一个调用api作为一个模块，在套壳前端作为展示模块，以及歌词展示页面的多重架构项目，最终这可能是一个三端项目，a端浏览器拓展端，可以发送Japanese as m rl或者asm二三百网站到b端也就是app端或者是web application端，c端就是另外一个手机通过局域网什么模块或者蓝牙什么模块，同步b端播放的音频，当然这个整体的架构我还没有想好，问题是对于b端，如果是一个webview网页来说的话，注意我这里说的是兼具webview网页的功能，而不是说它单单只是一个webview的app来说，如果我想现在已经实现的 下列项目也实现在它内部的话，[浏览器扩展的declarativeNetRequest规则和manifest] 那么难不成整个abb还要重构？这样子它也不具备灵活性以及生产环境下的适用性了，也就是说或许可以参考tachiyomi的安装多个漫画源那种插件性来看，不过具体不知道他的源码是具体怎么是实现的。下面是之前的未完成b端c端项目等等，  https://cnb.cool/kfc50/ai-chat/-/tree/main/kiko-sync-app非常大，你可以clw到tmp然后只有kiko-sync-app kikoeru-express kikoeru-quasar 是此项目内相关的文件夹项目。还有一个流程是 做一个公母协议，asmr-300.com装浏览器拓展或者web application或者app里，发送到cnb云原生开发打开的服务器域名里，服务自动调用whisper翻译，公端实时读取lrc，也就是说app里接受其回传的lrc歌词到对应文件夹同时可以播放了，这主要就是为了使用云原生开发的GPU或者CPU服务器来处理，cnb的服务项目中，主页网页可以打印whisper的log精简作为进度，同时可以显示一个url schemes来打开  app 比如 app://lrc-url=https://8000.cnb.space/xxx.lrc这样就是某asmr的某个track的音声会打开，app会下载，不过这个好像其实并没有多大用，毕竟app内应该已经上面说过了app内会自己下载了，这个只能起到一个串连架构的玩具类似的作用，而且它怎么知道该打开app哪个音频，也许可以基于rj号进行基础，比如 app://rj0156886?lrc=https://cnb.space/xx.lrc 这样app内以为内核也是基于这个进行下载的，它数据库等等应该能记录某种路径这样也能启动，不过这样可能还是没法维持app内交互啊，比如我在一级页面进入后的二级页面，比如我已经下滑在音声列表文件夹页浏览了，此时进入该scheme的话，那我回退的话，不过这样回退也能正常回退，倒也没啥，不过我是说没啥动画效果，也不对这个动画无关紧要，最终这个第四端(web 翻译任务主页) 到app端的交互我感觉是个很好的注意，就类似于购物软件跳转微信，两app之间进行oauth，或者b站网页跳转app视频页一样了，我好像有点明白手机设计的交互思路和原理方法了

---

## 开发报告

### v1.0.0 初始版本（2026-05-03）
- 创建 Chrome MV3 浏览器扩展
- 全宽进度条、图片拖动快进、已播放时间显示
- 每Track独立进度条
- 问题：`dataset` 属性名含连字符导致 SyntaxError → 修复为驼峰式

### v2.0 适配网站实际DOM（2026-05-03）
- **问题**: v1 使用正则从页面文本解析track，不准确；进度条插入位置不对；图片覆盖层位置不对
- **修复**: 
  - 进度条改为 `position: fixed` 悬浮在屏幕下方30%位置
  - 从 `#plyr-chapter-playlist` 表格的 `data-value`/`data-track-title` 属性解析track
  - 在现有track列表每行下方注入独立进度条
  - 图片覆盖层放在 `.plyr__video-wrapper` 上
  - 媒体元素查找 `#cleanp_audio video`

### v2.1 UI优化（2026-05-03）
- **修复**: 拖动箭头背景黑框 → 移除 `background` 和 `padding`，改用 `text-shadow` 实现可见性
- **新增**: 切换按钮（👆/✋）控制图片拖动功能开关，防止误触
- **修复**: 拖动时进度条时间实时更新（新增 `updateProgressUIForTime` / `updateTrackProgressUIForTime`）
- **新增**: 每个Track进度条左侧显示 `已播放/总时长` 格式（如 `0:01/16:45`）

### v3.0 移除图片拖动功能 + 防误触重构（2026-05-03）

**用户原始需求（第三次对话）：**

> 你好查看这个 /workspace/asmr-player-enhancer我需要 Player窗口左右拖动进度条这个功能你设置为false也就是说关闭现在容易上下滑动浏览网页时候误触，

**用户后续反馈：**

> 不。不需要这个可视化的开关，直接关掉就可以了，因为这个开关也比较挡。而且原来这个开关是管这个作用的，你之前不说我都不知道

**变更内容：**

1. **彻底移除图片拖动快进功能**
   - 删除 `imageDragEnabled` 状态变量
   - 删除 `isDraggingImage`、`dragStartTime` 状态变量
   - 删除 `SEEK_RANGE_SECONDS` 常量（全屏拖动=90秒）
   - 删除 `findVideoWrapper()` 函数
   - 删除 `createImageOverlay()` 函数
   - 删除 `setupImageDragEvents()` 函数（含 mousedown/touchstart/mousemove/touchmove/mouseup/touchend 全部事件）
   - 删除 `setupToggleDragButton()` 函数（含切换按钮逻辑）
   - 删除浮动进度条中的切换按钮 HTML（`<button class="asmr-toggle-drag">`）
   - 删除 `injectUI()` 中创建 image overlay 和调用相关函数的代码
   - 删除 `updateLoop` 中 `isDraggingImage` 的判断条件

2. **删除相关 CSS 样式**
   - 删除 `.asmr-toggle-drag` 按钮样式
   - 删除 `.asmr-toggle-icon` 样式
   - 删除 `#asmr-image-overlay` 覆盖层样式
   - 删除 `.asmr-seek-indicator` 指示器样式
   - 删除 `.asmr-seek-direction` / `.asmr-seek-time` 样式
   - 删除 `.asmr-dragging` 状态样式
   - 删除 `@keyframes asmr-fade-in` 动画
   - 删除移动端中对应的 `.asmr-seek-direction` / `.asmr-seek-time` / `.asmr-toggle-drag` 覆盖样式

**原因**：图片区域左右拖动快进功能在手机端上下滑动浏览网页时极易误触，切换按钮本身也占用屏幕空间，且用户不知道该按钮的作用，因此直接移除整个功能。

---

### v3.1 Track进度条布局优化 + 长按防误触（2026-05-03）

**用户原始需求（第四次对话）：**

> 还有就是每个分进度条左边的时间调整到左上方也就是进度条的上面不要与进度条一个水平线了，这样多出来的位置就可以给进度条使用了。还有一问题是， 这样多个上下的并列的时间条条，类似于屏幕里就有多个横线等适量距离在屏幕内，这样我其实很容易上下滑动网页的时候误触到进度条的左右拖放，这个有啥好的UI ux交互设计呢，难不成右边的位置少显示一点吗也就是说进度条偏左

**变更内容：**

1. **时间显示移到进度条上方**
   - `.asmr-track-progress-wrapper` 改为 `flex-direction: column`（原来 `row`，时间与进度条水平排列）
   - 时间在上、进度条在下，间距 1px
   - 进度条改为 `width: 100%` 占满全宽（原来 `flex: 1` 旁边有 60px 宽的时间显示）
   - 时间文字改为左对齐（`padding-left: 2px`），移除 `min-width: 60px` 和 `text-align: right`
   - 移动端同步调整：移除 `min-width: 68px`

2. **长按激活防误触机制**
   - 新增常量 `TRACK_DRAG_DELAY = 300`（长按 300ms 后才激活拖拽）
   - 新增常量 `TRACK_DRAG_THRESHOLD = 10`（触摸移动超过 10px 视为滑动，取消拖拽）
   - 新增状态变量：`trackDragTimer`、`trackDragStartX`、`trackDragStartY`、`trackDragPending`
   - **触摸事件重写**：
     - `touchstart`：记录起始位置，启动 300ms 定时器，定时器触发后才设置 `isDraggingTrackProgress = true`
     - `touchmove`：如果还在等待期（`trackDragPending`），检测手指位移是否超过 10px，超过则调用 `cancelTrackDrag()` 取消拖拽
     - `touchend`：调用 `cancelTrackDrag()` 清理所有状态
   - **鼠标事件不受影响**：桌面端直接激活，无需长按等待
   - **CSS 配合**：进度条添加 `touch-action: pan-y`，允许浏览器正常纵向滚动

3. **新增辅助函数**
   - `cancelTrackDrag()`：清除定时器、重置所有拖拽状态

---

## 项目背景

### 目标网站
- **japaneseasmr.com**: 日语ASMR音频分享网站
- 播放器：Plyr.js + HLS/m3u8流媒体，`<video>` 在 `#cleanp_audio` 内
- 封面图区域：`.plyr__video-wrapper`（含poster）
- Track列表：`#plyr-chapter-playlist` 表格，每行 `<tr>` 含 `td.chapter_list.start_time` 和 `td.chapter_list.chapter_title`
- Track数据：`<a data-index="0" data-value="0" data-track-title="...">` 格式
- 备用播放器：`#audioplayer` 含 `<audio>` 和 `#basic-chapter-playlist`

### 网站DOM结构（实际抓取）
```
#cleanp_audio.cleanPlayer
  video[poster="..."][crossorigin]
  #plyr-chapter-playlist
    <tr> td.chapter_list.start_time > a[data-index][data-value][data-track-title]
         td.chapter_list.chapter_title > a[data-index][data-value][data-track-title]
    ...
  (Plyr.js creates .plyr__video-wrapper around the video)
#audioplayer.audio_main
  audio#audio[src="*.m3u8"]
  #basic-chapter-playlist
```

### m3u8获取方式
- 网页内 `<audio id="audio" src="https://v.weeab0o.xyz/RJ01600547.m3u8">` 
- m3u8 URL格式: `https://v.weeab0o.xyz/RJ{编号}.m3u8`
- RJ编号可从页面URL或video元素title属性获取
- 需要 `Referer: https://japaneseasmr.com/` 头才能访问

### 参考项目
- **japanese-asmr-parser** (/workspace/japanese-asmr-parser): Python CLI解析器
- **asmr-proxy-extension**: Chrome MV3代理加速扩展
- **kiko-sync-app** (https://cnb.cool/kfc50/ai-chat/-/tree/main/kiko-sync-app): B端/C端项目
- **kikoeru-express** / **kikoeru-quasar**: kikoeru后端/前端

---

## 功能需求

### F1: 全宽悬浮进度条 ✅
- `position: fixed; top: 70vh; width: 100vw`
- 始终在屏幕下方30%位置可见
- 高度28px，hover 40px，移动端36-48px

### F2: 图片区域拖动快进/快退 ❌ 已移除 (v3.0)
- 原实现：拖动灵敏度屏幕宽度 = 90秒，覆盖层在 `.plyr__video-wrapper` 上
- 移除原因：手机端上下滑动网页时极易误触；切换按钮占用空间且用户不知其用途

### F3: 显示已播放时间 ✅
- 格式: `HH:MM:SS / HH:MM:SS`

### F4: 每Track独立进度条 ✅
- 注入到 `#plyr-chapter-playlist` 现有表格每行下方
- 时间显示在进度条上方（v3.1优化，原来在左侧水平排列）
- 显示 `已播放/总时长`（如 `0:01/16:45`）
- 当前播放track高亮（橙色边框+红色标题）
- 进度条占满全宽（v3.1优化，原来左侧被时间占用60px）
- **长按防误触**（v3.1新增）：触摸需按住300ms才激活拖拽，快速滑动不触发

### F5: 拖动时实时更新时间 ✅ (v2.1) → ❌ 随图片拖动功能一起移除 (v3.0)
- 原实现：图片拖动时主进度条和track进度条时间同步更新
- 现仅底部主进度条和track进度条在正常播放时实时更新

---

## 待讨论/未来规划

### 关于可维护性
当前扩展依赖具体DOM选择器（`#plyr-chapter-playlist`, `.plyr__video-wrapper`等），网站改版可能导致失效。
**可能的改进方案**:
1. 直接解析m3u8 URL（`https://v.weeab0o.xyz/RJ{编号}.m3u8`），自建播放器
2. 使用Chrome DevTools Protocol (CDP) 动态获取网络请求信息
3. Chrome DevTools MCP: AI通过API访问浏览器F12所有信息（XHR、网络、CSS等）

### 关于Chrome DevTools MCP
用户提出：能否让AI直接访问浏览器DevTools的所有信息（网络请求、XHR、JS、CSS等），而非使用Playwright固定HTML标签锁定元素。这比静态选择器更灵活，允许AI动态分析网站结构。

### A端/B端/C端/D端架构规划
- **A端**: 浏览器扩展（当前项目），在japaneseasmr.com浏览+控制
- **B端**: App/WebApp，调用asmr-300.com API下载+播放+歌词展示
- **C端**: 另一手机，通过局域网/蓝牙同步B端音频
- **D端**: CNB云原生服务器，运行Whisper翻译，生成LRC歌词

### kikoeru API
- `GET /api/tracks/{id}?v=2` 返回文件夹树结构
- `mediaStreamUrl` / `mediaDownloadUrl` 提供音频流/下载链接
- 支持 `hash` 格式 `{workId}/{index}` 调用stream/download API

### URL Scheme交互
- `app://rj0156886?lrc=https://cnb.space/xx.lrc` 打开App内对应音声
- 类似购物软件跳转微信的跨App交互模式

---

## 技术方案

### 扩展架构
- **Manifest V3** Chrome扩展
- **Content Script** 注入到 `japaneseasmr.com` 页面
- 不需要background script或popup

### 文件结构
```
asmr-player-enhancer/
├── manifest.json      # Manifest V3
├── content.js         # 内容脚本（核心逻辑）
├── content.css        # 样式（含移动端优化）
├── icons/             # 扩展图标
└── PRD.md            # 开发文档
```

### 安装方式
1. 解压 `ASMR-Player-Enhancer-v1.0.0.tar.gz`（或 `.zip`）
2. Chrome → `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序
3. 选择解压后的文件夹
4. 访问 japaneseasmr.com 任意页面即可生效

---

### v4.0 字幕 / 歌词模块（集成自 kikoeru 项目）

**用户需求**：在浏览器扩展内提供与 asmr.one 相同的单/多音声字幕压缩包上传功能，并复用 kiko 歌词播放器窗口，显示同步歌词。

**新增功能**：
- **字幕面板（FAB「字幕」按钮）**：固定在页面左下角，点击展开。
- **字幕压缩包加载**：支持 `.zip`（内置 JSZip 解析）或单个 `.lrc / .vtt / .srt / .ass` 文件；支持点击选择 + 拖拽。
- **自动匹配 Track**：按 Track 标题相似度（归一化后包含/分词重叠）+ 前缀序号，将字幕文件匹配到 `#plyr-chapter-playlist` 各音轨；未被匹配的文件视为整作绝对时间字幕。
- **同步歌词框**：复用 kiko 的 `parseVtt` + 浮动歌词窗口逻辑。当前播放 Track 切换时自动切换该 Track 的字幕；当前行高亮、前后句灰显、自动滚动。
- **上传到字幕库（可选）**：面板内可填写 kikoeru 服务端地址（localStorage 记忆），点「上传到字幕库」将 `.zip` POST 到 `{server}/api/upload-subtitles`，集成 kikoeru 的「七步上传压缩包」流程。

**解析器**：`parseVtt` / `parseLrc` / `parseSrt` / `parseAss` 全部内置，`parseSubtitle` 按扩展名分发。

**文件变更**：
- 新增 `subtitles.js`（字幕模块内容脚本）
- 新增 `jszip.min.js`（v3.10.1，MIT，内置 zip 解析）
- `manifest.json`：version → 1.1.0；content_scripts.js 增加 `jszip.min.js`、`subtitles.js`；新增 `storage` 权限与 `<all_urls>` host_permissions（上传用）
- `content.css`：补充字幕面板与歌词框样式

**说明**：歌词框默认置于右上角（top:60px right:10px），以避开底部主进度条（top:70vh）。

---

## v1.1.1 (2026-08-03) 移动端自适应修复

- **Bug**: 字幕/歌词面板在手机上显示不全、右侧被遮住超出屏幕。
- **原因**: 面板固定 `width:320px`（歌词框 `340px`）且未设置 `box-sizing`，叠加 `left:10px` 与 14px 内边距后，窄屏下右侧溢出视口。
- **修复**: 面板宽度改为 `width:min(320px, calc(100vw - 20px))` + `box-sizing:border-box` + `overflow-wrap:anywhere`；歌词框同样改为 `min(340px, calc(100vw - 20px))`。现任何屏宽下均保留左右各 10px 边距，不再溢出。

---

## v1.1.2 (2026-08-03) 字幕库 + 歌词跳转 + 当前页 RJ 自动匹配

- **歌词点击跳转**: 歌词浮框每一行可点击，点击跳转到对应播放位置（对齐 kiko 歌词 web）。
- **字幕库列表**: 面板内新增「📚 我的字幕库」，从服务端 `/api/subtitles-list` 拉取「我历史上传的所有」字幕，按 RJ 号倒序（新→旧），可收起（▶/▼）。
- **每条字幕**: 带封面图 `pic.weeabo0.xyz/RJxxxx_img_main.jpg`（尝试 `referrerPolicy=no-referrer` 绕过 CF，失败则隐藏）；RJ 号蓝色可点 → `japaneseasmr.com/?s=RJxxxx` 搜索。
- **当前页 RJ 自动匹配**: 打开面板 / 页面加载时识别当前页面 RJ（扫描正文 `RJ\d{6,10}`），若在字幕库中则自动载入并高亮，刷新后仍在（服务端为真相源）。
- 选择某条字幕「载入」即拉取该 RJ 全部 lrc/vtt 内容并匹配当前页面音轨。

---

## v1.1.3 (2026-08-03) 修复歌词闪烁

- **现象**: 字幕每 250ms 整体 `innerHTML` 重建并对当前行反复 `scrollIntoView({smooth})`，重建与平滑滚动相互打架导致跳闪。
- **修复**: 歌词行 DOM 仅在「字幕集变化」时构建一次（按 track index / 整作标识缓存 `renderedKey`）；每帧仅更新行样式；滚动仅在当前高亮行真正变化时触发一次，且改用语内 `scrollTo`（不再带动整页滚动）。

---

## v1.1.4 (2026-08-03) 字幕库改为 localStorage 持久化（不再依赖服务器）

- **背景**: v1.1.2 的字幕库依赖「字幕库服务器 URL + 服务端 `/api/subtitles-list`」。用户反馈「未配置字幕库服务器」且「之前上传到的也没有显示」——因为历史上传到了别处，且扩展本就可以用 localStorage。
- **变更**: 字幕库列表改为从浏览器 `localStorage`（`asmrSubLibrary`）读取，不再需要任何服务器即可使用。结构：`[{ rj, title, files:[{name, cues}], savedAt }]`。
- **持久化**: 拖入 / 选择字幕后，自动以「当前页面 RJ 号」为键写入 localStorage（同名 RJ 覆盖更新）；刷新页面或重开浏览器后，打开面板仍可见、仍可载入。
- **排序**: 按 `savedAt` 倒序（新→旧），可收起（▶/▼）。
- **当前页 RJ 自动匹配**: 识别当前页面 RJ，若在本地字幕库则自动载入并高亮（页面加载 2.5s 后也会自动匹配，无需先开面板）。
- **「上传到云端字幕库」按钮保留为可选**: 仅当填写了云端服务器地址时才用于分享同步，与本地字幕库互不干扰。
- 封面图（`pic.weeabo0.xyz`）仍尝试 `referrerPolicy=no-referrer` 绕过 CF，失败则隐藏（CF JS 挑战下可能仍不可见，需真机确认）。

---

## v1.1.5 (2026-08-03) 面板显示扩展版本号

- 字幕 / 歌词 面板标题下方新增一行小字：`ASMR Player Enhancer v<版本号>`，版本号取自 `chrome.runtime.getManifest().version`（与 manifest.json 同步），便于核对已安装的版本。

---

## v1.1.6 (2026-08-03) 修复：字幕库空白 + 歌词空白 + 上传不入库

- **根因**: v1.1.4 把 `fetchLibrary` 误标为 `async`，但 `renderLibrary` 是同步调用 `libraryItems = fetchLibrary()`，导致 `libraryItems` 拿到的是 **Promise** 而非数组 → `libraryItems.length` 为 `undefined`（永远显示“字幕库为空”）且 `libraryItems.some` 抛 `TypeError: libraryItems.some is not a function`，把自动载入字幕的流程打断（歌词因此空白）。
- **修复 1**: `fetchLibrary` 改为同步函数（仅读 localStorage，无需 async）。`refreshLibraryAndMatch` 对 `libraryItems` 增加 `Array.isArray` 防御。
- **修复 2**: 「上传到云端字幕库」按钮原本只 POST 到一个并不存在的 `/api/upload-subtitles`，从不写本地。改为：**先调用 `handleFiles` 把选中的字幕加载并写入本地字幕库（必定执行）**，仅当填写了服务器地址时才额外尝试同步到云端（失败也不影响本地）。即「上传」= 加入我的字幕库 + 可选云端同步。
- **修复 3**: `refreshLyricsForTime` 原来在 `tracks.length === 0` 时直接 `return`，导致字幕存在但音轨列表尚未解析时歌词空白。改为：无音轨时回退到「整作绝对时间」(workRelative) 模式显示歌词。
- 现在：拖入 / 选择 / 点「上传」都会进入「我的字幕库」并立即显示歌词；刷新或重开浏览器后仍在。

---

## v1.1.7 (2026-08-03) 修复：歌词行不显示 + 封面图加大去空白

- **歌词空白（真因）**: `refreshLyricsForTime` 里先调 `buildLyricsSkeleton()` 再调 `createLyricsOverlay()`，而 `lyricsContent` 是 `createLyricsOverlay()` 内才创建的，导致首帧 `buildLyricsSkeleton` 读到 `lyricsContent === null` 直接 return，歌词行从未建出（该 bug 自 v1.1.3 闪烁修复起就存在，故多版本都空白）。修正为：仅在「字幕集变化」时先 `createLyricsOverlay()` 再 `buildLyricsSkeleton()`，确保容器存在后再建行。
- **封面图**: 从 40×40 加大到 60×60，`border-radius` 6px，行内边距收窄（`padding:4px 0`、行间距 `gap:10px`），去掉图片四周多余的空白。

---

## v1.1.8 (2026-08-03) 字幕库记录用 RJ 号识别规则

- **新增**: 上传字幕后，用于写入本地字幕库（localStorage）的 RJ 号按以下优先级确定：
  1. **压缩包文件名**（如 `RJ01608265.zip` → `RJ01608265`）；
  2. **压缩包内部文件名 / 文件夹名**（如包内 `RJ0123185_track1.lrc` → `RJ0123185`）；
  3. **当前页面 RJ**（`getCurrentPageRJ()` 扫描正文）。
- **兜底逻辑（保留）**: 若压缩包名与内部文件名都未发现 RJ 号，则以「当前我上传这个页面的 RJ 号」作为该字幕压缩包的记录 RJ。例如正在 `https://japaneseasmr.com/149049/`（页面 RJ：RJ01680427）看，临时上传一个叫 `1.zip`、里面是 `1.lrc / 2.lrc` 的压缩包（文件名里没有 RJ），就自动以当前页面 `RJ01680427` 记录——非常贴合用户边看边传的使用习惯。
- **说明（写进代码注释/本段）**: 若压缩包名或里面文件夹无 RJ 号，则当前页面 RJ 被记录为该字幕压缩包的 RJ 号，并随后存入 localStorage，刷新/重开仍在。
- 状态栏会明确提示实际记录到的 RJ（如「已记录到字幕库：RJ01608265（N 个字幕）」），便于核对。

