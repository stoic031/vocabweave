# 📊 Module 6: Settings Tab (Connection Flow)

> Xem [`README.md`](README.md) cho tổng quan kiến trúc.

**Bố cục:** dùng declarative settings API của Obsidian 1.13 (`getSettingDefinitions()`
trong `src/ui/settingsTab.ts`) để mọi mục hiện trong ô tìm kiếm Settings của Obsidian.
Tab chia 3 nhóm (group), không đổi hành vi bên trong mỗi mục:

- **Anki** — trang (page) **"Connection & profiles"**: §6.1 (URL, Connect, profiles),
  vẫn render imperative bằng `renderConnectionSection`.
- **AI** — **Your language** (dropdown declarative, key `nativeLanguage`), trang
  **"AI text provider"** và **"AI image provider"** (§6.2, render imperative).
- **Sync & media** — **Auto sync on save** (toggle, key `autoSyncOnSave`, §6.3) và
  **Media prefix** (text, key `mediaPrefix`, validate bằng `isValidMediaPrefix`, lỗi hiện
  inline dưới ô, §6.4).

Control declarative đọc/ghi thẳng `plugin.settings` qua `getControlValue`/`setControlValue`
mặc định của `PluginSettingTab`. Trang imperative là `SectionPage` (subclass `SettingPage`);
trang Connection huỷ listener profile khi rời trang (`hide()`).

## 6.1. Connection Section

**AnkiConnect URL:**

- Input type: text field
- Placeholder: "<http://localhost:8765>" (hiển thị mờ, không phải giá trị mặc định)
- Logic mặc định: Nếu user để trống → dùng `http://localhost:8765`
- Bên cạnh input có nút **"🔗 Connect"**

**Connect Button Logic:**

```
[1] User nhập URL (hoặc để trống) → Bấm "Connect"
    ↓
[2] Plugin gọi AnkiConnect API:
    - "deckNames" → lấy danh sách decks
    - "modelNames" → lấy danh sách models
    ↓
[3] Nếu thành công:
    - Hiển thị toast: "✅ Connected to Anki!"
    - Nạp lại danh sách vào 2 dropdown Deck và Model trong mục Profile bên dưới
    ↓
[4] Nếu thất bại:
    - Hiển thị toast: "❌ Cannot connect to Anki. Please check URL and AnkiConnect."
    - Dropdown Deck và Model vẫn hiện, giữ nguyên danh sách hiện có
```

**Profile:**

Profile là một bộ **Deck + Model + Save notes to** đặt tên sẵn, dùng để quyết định note
mới được tạo với Deck/Model nào và lưu ở folder nào — cho cả "Create new note" (xem
`07-sidebar.md` §7.3) lẫn "Create note from selection" (`03-note.md` §3.7). Thay thế hoàn
toàn cặp giá trị "mặc định" (Settings) / "hiện tại" (Sidebar) trước đây. Profile **không**
chứa provider/model AI — provider Text là cấu hình toàn cục (§6.2).

```
Profile: [Japanese ▼]   [Add]  [Delete]
Profile name: [Japanese        ]
Deck:  [Japanese::N2 ▼]
Model: [Basic ▼]
Main field: [Word ▼]
Learning language: [Japanese ▼]
Save notes to: [/ (vault root) ▼]
```

- Dropdown **Profile** chọn profile đang dùng (active). Đây là cùng một lựa chọn với
  dropdown Profile ở Sidebar Tab 1 (`07-sidebar.md` §7.2.1): đổi ở đâu thì nơi kia cập
  nhật theo ngay, không cần mở lại.
- Các ô bên dưới (Profile name, Deck, Model, Save notes to) luôn sửa **profile đang chọn**.
- Luôn có ít nhất 1 profile. Lần đầu (hoặc khi nâng cấp từ bản cũ chưa có profile) plugin
  tự tạo profile **"Default"** — với bản cũ thì lấy Deck/Model/Folder "hiện tại" của
  Sidebar (nếu có), không thì lấy Deck/Model/Folder mặc định cũ.
- **Add:** tạo profile mới (tên "New profile", thêm số nếu trùng; Deck/Model trống, folder
  là vault root) và chuyển sang nó để user điền tiếp.
- **Delete:** xoá profile đang chọn rồi chuyển sang profile đầu tiên còn lại. Nút bị vô
  hiệu khi chỉ còn 1 profile.
- **Profile name:** không được để trống và không được trùng tên profile khác (hiện
  Notice lỗi và giữ tên cũ). Lưu khi rời ô nhập / nhấn Enter.
- **Deck / Model:** **luôn hiện**, không cần bấm Connect. Mỗi lần mở Settings, plugin tự
  nạp `deckNames` / `modelNames` một lần, im lặng (không toast; lỗi thì bỏ qua — nút
  Connect mới là nơi báo lỗi kết nối). Trong lúc chưa nạp xong hoặc khi Anki đang tắt,
  dropdown chỉ liệt kê giá trị đã lưu của profile, nên vẫn thấy profile đang set gì. Giá
  trị đã lưu mà Anki không còn liệt kê (VD deck đã bị xoá) vẫn được hiển thị. Có lựa chọn
  trống ("Select deck…") — profile thiếu Deck hoặc Model thì không tạo được note (hiện
  Notice "Please set up a profile in settings first" và mở Settings).
- **Main field:** dropdown lấy field từ `modelFieldNames(model)` của profile này — chỉ
  tải/hiện khi profile đã có Model (giống cơ chế Deck/Model ở trên, kể cả việc giữ hiển
  thị giá trị đã lưu dù model không còn field đó). Đây **không** phải Main Field thật sự
  dùng cho Rebuild/Generate của một note cụ thể (đó là dropdown per-Deck+Model ở Sidebar,
  `07-sidebar.md` §7.2.1) — nó chỉ là giá trị **mặc định**, dùng để "mồi" cho
  `mainFieldConfig` của cặp Deck+Model này **một lần duy nhất**, ngay khi note đầu tiên
  được tạo từ profile (Create new note / Create note from selection), nếu cặp đó chưa có
  Main Field nào (xem `07-sidebar.md` §7.4). Không bắt buộc.
- **Learning language:** dropdown, danh sách **cố định** (`English`, `Chinese`,
  `Japanese`, `Korean`, `German`, `Spanish`, `Vietnamese` — nhãn luôn viết bằng tiếng
  Anh, kể cả cho Vietnamese; `src/utils/constants.ts` → `LANGUAGES`), dùng chung
  `renderPicker()` với Deck/Model/Main field (cùng file) nên hành vi giống hệt: có lựa
  chọn trống ("Select learning language…"), lưu ngay khi chọn (không có bước blur/Enter
  như trước), và một giá trị đã lưu từ trước khi có danh sách này (free text cũ, không
  khớp danh sách) vẫn hiển thị đúng thay vì biến mất. Đây là ngôn ngữ profile này đang
  học — dùng làm ngữ cảnh cho AI Generate (`02-providers.md` §2.4) cùng với "Your
  language" (§6.2). Không bắt buộc.
- **Save notes to:** populate từ folder trong vault, không phụ thuộc AnkiConnect nên
  **luôn hiện**. Mặc định `/` (vault root). Folder lồng nhau hiển thị dạng cây: mỗi dòng
  chỉ hiện tên riêng, thụt lề theo độ sâu, nhóm folder con ngay dưới folder cha (dùng hàm
  dựng cây `src/utils/folderTree.ts`).
- Profile chỉ dùng cho **note mới**. Deck/Model của một note đã tồn tại luôn theo
  frontmatter của note đó (xem `07-sidebar.md` §7.2.1).

## 6.2. AI Provider Settings

**Your language:** dropdown, cùng danh sách **cố định** `LANGUAGES` và cùng
`renderPicker()` với Learning language (§6.1) — chỉ khác là nằm ngoài phần Profile
(toàn cục: một người dùng chỉ có một ngôn ngữ hiện tại, không cần khai báo lại cho
từng profile). Dùng làm ngữ cảnh cho AI Generate (`02-providers.md` §2.4) cùng với
Learning language của profile (§6.1). Không bắt buộc, lưu ngay khi chọn.

```
Your language: [English ▼]
```

Provider là danh sách **cố định** (xem `02-providers.md` §2.2); thêm provider khi có người dùng
yêu cầu. Cả Text và Image cùng cơ chế: danh sách cấu hình (Add / Delete) + dropdown **active**
(mặc định None = không gọi AI / không tạo ảnh), dùng chung cho mọi profile. Mỗi cấu hình:

- Name: text field (không rỗng)
- Provider: dropdown chọn từ danh sách cố định, nhãn `(cloud)` / `(local)`. Đổi provider thì xóa
  Model đã chọn và đặt lại Base URL về mặc định của provider mới
- Base URL: **chỉ hiện với provider local** (Ollama `http://localhost:11434`, Automatic1111
  `http://localhost:7860`, ComfyUI `http://localhost:8188`, có sẵn mặc định); provider cloud dùng
  endpoint cố định nên không hiện. Sai định dạng → Notice "❌ Invalid URL. Please check the base
  URL." và giữ giá trị cũ
- API Key: ẩn với provider không cần key (Ollama, Automatic1111, ComfyUI); bắt buộc với cloud, riêng
  Pollinations là tùy chọn. Chọn **nguồn** — *Enter manually* (ô nhập ẩn ký tự, lưu plain text trong
  `data.json`) hoặc *Obsidian keychain* (`SecretComponent`, chỉ lưu **tên** secret; key đọc từ
  `app.secretStorage` mỗi lần gọi nên đổi secret có hiệu lực ngay). Cần Obsidian ≥ 1.11.4
  (`minAppVersion`). Key chỉ gửi tới endpoint của provider đang chọn (gọi model lẫn liệt kê model)
- Model: dropdown model do chính provider báo, **chỉ gồm đúng loại** (Text: model sinh text; Image:
  model text-to-image). Chỉ tải khi user đổi provider / Base URL / key hoặc bấm **Refresh**, không tự
  tải khi mở Settings. Tải lỗi hoặc rỗng → ô text tự do kèm gợi ý; model đã lưu mà danh sách không có
  (hoặc bị lọc) vẫn hiển thị; dòng mô tả cho biết đã lọc còn bao nhiêu trên tổng số provider báo ("2 text models available (of 5 the provider reports)"); nếu bộ lọc loại hết thì hiện toàn bộ model kèm ghi chú
- Nhãn Cloud / Local: theo provider (không suy từ URL)
- Dropdown active có mục **None**; Add tạo cấu hình mới (Text mặc định OpenAI, Image mặc định
  Pollinations) và chọn nó làm active; Delete xoá cấu hình đang active (active về None). Form sửa hiện
  bên dưới, chỉ cho cấu hình đang active. Lưu khi rời ô nhập (Name, Base URL) hoặc khi gõ (API Key, Model)
- Cấu hình thiếu Base URL (provider local) hoặc thiếu Model (trừ provider có model mặc định:
  Pollinations, Automatic1111, ComfyUI) coi như **chưa cấu hình** — `getActiveTextConfig` /
  `getActiveImageConfig` trả `null`
- Cấu hình lưu bởi bản cũ có provider không còn trong danh sách bị bỏ khi tải settings

**Cách lọc model theo provider** (`src/providers/modelLists.ts`; lọc theo metadata khi provider có,
theo tên khi không — lọc theo tên là best effort):

| Provider | Nguồn | Text | Image |
| --- | --- | --- | --- |
| OpenRouter | `/models` → `architecture.output_modalities` | output chỉ có `text` (bỏ model xuất audio/ảnh như lyria, gpt-audio) | output có `image`, bỏ `openrouter/auto*` |
| Together | `/v1/models` → `type` | `chat`/`language`/`code` | `image` |
| OpenAI | `/models` | `gpt-*`/`chatgpt-*`/`o<số>`, bỏ audio/realtime/embedding/... | `dall-e*`, `gpt-image*` |
| Gemini | `/v1beta/openai/models` cho cả Text lẫn Image (bỏ tiền tố `models/`) | chỉ `gemini-*`/`gemma-*`, bỏ image/tts/live/audio/embedding/robotics/... (lyria, nano-banana, veo tự loại) | `imagen`, `*-image`, `nano-banana` |
| Groq | `/models` | mọi model text-to-text (chỉ bỏ whisper, tts, orpheus) | — |
| Anthropic | `/v1/models` | tất cả | — |
| Ollama | `{host}/api/tags` | bỏ embedding | — |
| Pollinations | `gen.pollinations.ai/image/models` → `category`, `output_modalities` | — | tất cả trừ video (gồm cả model cộng đồng, trả phí, đang `down`) |
| Automatic1111 | `/sdapi/v1/sd-models` | — | tất cả checkpoint |
| ComfyUI | không liệt kê model: cấu hình bằng **workflow** (bên dưới) | — | — |

**ComfyUI (Image)** cấu hình bằng **workflow** thay vì Model: chỉ có Base URL (mặc định
`http://localhost:8188`) và **Workflow**, không có API Key/Model.
- Workflow: dropdown các workflow đã lưu trong ComfyUI (`GET /api/userdata?dir=workflows&recurse=true`,
  bản cũ `/userdata`), lưu **đường dẫn** (VD `icons.json`, `sub/a.json`). Chỉ tải khi đổi Provider /
  Base URL hoặc bấm **Refresh**, không tự tải khi mở Settings. Tải lỗi → ô text nhập đường dẫn kèm gợi ý
- Chọn workflow → plugin đọc nó (`GET /api/userdata/workflows%2F<path>`, định dạng UI hoặc API) và hiện
  tóm tắt: node prompt dương/âm (nối vào `positive`/`negative` của KSampler) và checkpoint; thiếu
  KSampler / node prompt / SaveImage thì cảnh báo "image prompts can't be injected". Node prompt chỉ
  đi qua reroute/combine/subgraph thì chưa được theo dõi
- Cấu hình chưa chọn workflow coi như **chưa cấu hình** (`getActiveImageConfig` = `null`)
- Chạy workflow (đổi UI→API bằng `/object_info`, `POST /prompt`, lấy ảnh) làm cùng adapter ComfyUI

Riêng **Image**: Negative Prompt (textarea, lưu theo từng cấu hình; chỉ provider hỗ trợ mới dùng, VD
Automatic1111). Chưa có adapter ảnh (#17) nên chọn cấu hình active thì `getImageProvider()` báo
`ProviderError` "no adapter for this provider type" cho tới khi #17 xong.

## 6.3. Sync Settings

- **Auto Sync on Save:** toggle (default: false)

## 6.4. Media Settings

- **Media Prefix:** text field (default: "_obsidian_")
- Validation: không chứa ký tự đặc biệt
