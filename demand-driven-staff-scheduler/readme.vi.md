# Demand-Driven Staff Scheduler (Lên lịch nhân viên theo nhu cầu)

**Scenario 02** của một bộ sưu tập system-design scenarios cá nhân. Repo này độc lập; các chỗ nhắc
tới *scenario 01* bên dưới là một repo anh em trong bộ sưu tập đó, không phải thứ gì cần có ở đây.

[🇬🇧 English](readme.md) · 🇻🇳 Tiếng Việt

> ✅ **Trạng thái: thuật toán, dịch vụ backend, và toàn bộ UI đều đã xây xong.** Trái tim của bài
> tập — `packages/scheduling-core` (Phase 1) — đã hoàn chỉnh: 97/97 test (unit + property +
> golden-file), nằm trong tổng số 255 test toàn workspace. Backend phục vụ nó cũng vậy,
> `apps/scheduler-api` (NestJS + Fastify + CQRS + Postgres + Docker) — mọi thao tác ghi và đọc đề
> bài yêu cầu, cộng thêm **cả năm** stretch goal tùy chọn (§8): sửa lịch thủ công/kéo-thả, coverage
> view, lịch rảnh từng nhân viên, vai trò/kỹ năng, và xuất roster.
> `apps/web` giờ có đủ mọi màn hình yêu cầu UI của đề bài —
> tạo/liệt kê schedule, CRUD staff và shift, import CSV demand, auto-schedule kèm bảng tham số và
> sửa tay/kéo-thả, bảng tổng hợp, và coverage view — chạy thật với API thật, không phải mock. Trạng
> thái theo từng phase: [`.ai/PROJECT_STATUS.md`](.ai/PROJECT_STATUS.md). Plan xây dựng gốc (đã bị
> thay thế về kiến trúc, vẫn chính xác về thuật toán):
> [`.ai/plans/init-source.plan.md`](.ai/plans/init-source.plan.md); plan đảo ngược kiến trúc đã thay
> thế nó: [`.ai/plans/backend-architecture-reversal.plan.md`](.ai/plans/backend-architecture-reversal.plan.md).

## Bài toán

Một quản lý cửa hàng cần lên kế hoạch ai làm việc, và khi nào, trong một tuần điển hình. Việc xếp
nhân sự nên bám theo mức độ bận rộn thực tế của cửa hàng — số giao dịch lịch sử theo giờ đại diện cho
độ bận — trong khi vẫn tôn trọng trần giờ hợp đồng của mỗi nhân viên và chia công việc công bằng cho
mọi người.

Đề bài mà repo này trả lời là
[`SWE_Take-Home_Staff_Scheduling_System.pdf`](SWE_Take-Home_Staff_Scheduling_System.pdf), trích dẫn
đầy đủ cùng các giả định mà đề bài yêu cầu tại
[`docs/01_business_requirements.md`](docs/01_business_requirements.md).

## Phạm vi — cái gì bắt buộc, cái gì không, và ranh giới nằm ở đâu

Đề bài yêu cầu một luồng chạy trọn vẹn và sạch sẽ hơn là làm rộng mà dở dang (§5), và dặn đừng
"gold-plate" (§9). Vì vậy cần nói thẳng: cái gì được tính là trong phạm vi, cái gì đã vượt ra ngoài,
và phần làm thêm đó thực chất thuộc loại nào trong hai loại đó.

### Trong phạm vi — mọi yêu cầu đề bài nêu, đã xây và kiểm chứng trọn luồng

| § | Yêu cầu | |
|---|---|---|
| 2.1 | Tạo schedule — một tuần điển hình, theo thứ trong tuần và theo giờ | ✅ |
| 2.2 | Nhân viên có tên và trần giờ/tuần; thêm, sửa, xóa | ✅ |
| 2.3 | Tải lên file CSV giao dịch được cung cấp | ✅ 112 ô / 3.058 giao dịch — cột khớp theo **tên thứ, không bao giờ theo vị trí** |
| 2.4 | Ca chỉ định nghĩa bằng giờ bắt đầu/kết thúc, seed sẵn hai ca, thêm/sửa/xóa | ✅ 07:00–15:00 và 15:00–23:00 |
| 2.5 | Auto-schedule: bám nhu cầu, tôn trọng mọi trần giờ, công bằng, sửa được sau đó | ✅ |
| 2.6 | Bảng tổng hợp theo ngày/giờ + bốn chỉ số cấp tuần, hiện **cả hai** tỉ lệ | ✅ |
| 5 | UI dùng được — đề bài nói rõ đây không phải bài command-line hay chỉ-API | ✅ bảy màn hình |

Được kiểm chứng bằng cách chạy ứng dụng thật trên database thật rồi bấm qua từng màn hình, không chỉ
bằng bộ test — trình tự chính xác nằm ở [`docs/09_running_it.md`](docs/09_running_it.md).

### Vượt mức tối thiểu — và điểm phân biệt quan trọng

**Kiến trúc không phải là phần "làm thêm".** Đề bài cố ý để ngỏ phần stack (*"một backend nhẹ — hoặc
thậm chí thuần client-side — đều được"*), nên một tầng domain, một đường ghi CQRS và một database
thật ở đây là một *lựa chọn* chứ không phải yêu cầu. Nhưng chúng vẫn là mức nền: cách bảy tính năng
này được **cấu trúc** mới là thứ quyết định người tiếp theo có sửa được nó một cách an toàn hay
không, và đó là kỹ thuật thông thường chứ không phải đồ trang trí. Cụ thể, nó khiến người chấm tốn
đúng một lệnh thêm — `docker compose up -d` — còn bề mặt tính năng thì đúng bằng những gì §2 yêu cầu,
không hơn.

**Còn đây mới thực sự là phần vượt phạm vi, và được xây vì chúng là phần thú vị:**

- **Cả năm stretch goal** (§8, đề bài ghi rõ là tùy chọn): sửa tay/kéo-thả, coverage view, lịch rảnh
  từng nhân viên, vai trò/kỹ năng, và xuất roster.
- **Property-based testing** cho thuật toán thay vì chỉ test theo ví dụ. Các ràng buộc cứng là tính
  chất của *thuật toán*, không phải của một hàng dữ liệu, nên chúng được chứng minh trên các bộ nhân
  viên, lưới nhu cầu và định nghĩa ca được sinh ngẫu nhiên — lý lẽ nằm ở
  [ADR-0001](docs/adr/0001-constraint-enforcement-strategy.md).
- **Một dấu vết quyết định đã commit** — 21 giả định đã ghi, sáu ADR, và một plan viết *trước* mỗi
  phase rồi giữ nguyên không sửa lại, kể cả những dự đoán hóa ra sai.

## Vì sao đây không phải CRUD

Sáu trong bảy tính năng là CRUD. Tính năng thứ bảy — *"Auto-schedule"* — chính là *"trái tim của bài
tập"* theo lời đề bài, và đó là một bài toán phân bổ có ràng buộc, không có đáp án đúng:

- **Ràng buộc cứng** không bao giờ được vi phạm. Không ai vượt trần giờ hợp đồng/tuần; không ai làm
  hai ca chồng giờ trong cùng một ngày.
- **Mục tiêu mềm** cạnh tranh nhau. Phủ giờ đông khách, nhưng cũng cho mọi người một lượng công việc
  hữu ích, từ một quỹ giờ gần như không bao giờ vừa khít.
- **Không có tối ưu nào để hội tụ về**, nên "đúng" phải được định nghĩa trước khi xây — và được
  chứng minh theo cách khác với cách chứng minh một endpoint CRUD.

## Sẽ được giải như thế nào

Ràng buộc cứng được enforce **theo cấu trúc**: mọi assignment đều đi qua một `FeasibilityGate` duy
nhất, và roster chỉ có thể được dựng từ những phán quyết gate đã đưa ra. Không có đường code nào có
thể thêm một assignment không khả thi — bất biến không được kiểm tra lại sau, nó không thể bị phá vỡ.

Vì đây là tính chất của một thuật toán, không phải của một hàng dữ liệu, nó được chứng minh bằng
**property-based testing** trên các bộ nhân viên, lưới nhu cầu và định nghĩa ca được sinh ngẫu
nhiên — không phải bằng các ví dụ chọn tay. Mục tiêu mềm hoàn toàn không được chứng minh; chúng được
**đo** và báo cáo.

## Auto-scheduler — cách tiếp cận

Bốn giai đoạn, bám theo đúng hướng suy nghĩ đề bài gợi ý (§4). Lý lẽ đầy đủ ở
[ADR-0002](docs/adr/0002-auto-schedule-algorithm.md) và
[ADR-0003](docs/adr/0003-demand-to-headcount-model.md).

**1 · Nhu cầu → số người.** `required[ngày][giờ] = max(ceil(giao_dịch ÷ N), 1)`. Một giờ được coi là
"mở cửa" **khi và chỉ khi** dữ liệu import có ô cho giờ đó — file CSV là nguồn chân lý duy nhất về
giờ mở cửa, nên không thể có nguồn thứ hai mâu thuẫn với nó.

**2 · Chọn `N`.** `N` là số giao dịch mỗi giờ-công, và nó là **tham số sửa được theo từng schedule,
không phải hằng số** — một con số ma mất giá trị bảo vệ ngay khi dữ liệu đổi, nên thứ được bảo vệ ở
đây là *phương pháp*. Nút **"Suggest from data"** giải ngược ra giá trị `N` mà tại đó tổng giờ-công
cần thiết rơi vào khoảng ~80% tổng giờ hợp đồng của cả đội (trần hợp đồng là *giới hạn*, không phải
*chỉ tiêu*). Hai hiệu chỉnh mà dữ liệu thật buộc phải làm: hiệu chuẩn theo giờ-công **floor**, không
phải giờ yêu cầu thô — khoảng hụt do lượng tử hóa theo ca là ~20%, vì bạn không thể thuê ai đó chỉ
cho riêng giờ 13h. Mặc định ship **18**; hiệu chuẩn trên đội seed trả về **15**, và UI hiển thị **cả
hai** thay vì âm thầm dung hòa.

**3 · Nhu cầu → ca làm.** Nhân viên được gán vào *ca*, không phải vào *giờ*, nên mỗi `(ngày, ca)` có
hai con số: `floor = ceil(trung bình(required))` trên các giờ ca đó chạm tới, và
`target = max(required)` — đỉnh điểm. **Floor của mọi ca được lấp trước**, sau đó roster mới bù dần
lên `target`, **ưu tiên đỉnh chưa được phủ lớn nhất**, cho tới khi hết quỹ giờ. Phủ mọi đỉnh sẽ thừa
người ở mọi giờ vắng và đốt quỹ giờ mà một ngày đông hơn cần; phủ theo trung bình thì hụt ở đỉnh. Thứ
tự này khiến *quỹ giờ* — chứ không phải mục tiêu — quyết định điểm dừng, và khiến điểm dừng đó báo
cáo được.

**4 · Gán người + công bằng.** Mọi ứng viên đều đi qua một `FeasibilityGate` duy nhất, enforce bốn
ràng buộc cứng theo thứ tự đã ghim — **H4** lịch rảnh, **H3** đã gán rồi, **H2** chồng ca trong ngày,
**H1** trần giờ hợp đồng/tuần. Công bằng được định nghĩa là **ngưỡng sử dụng tối thiểu**, mặc định
**60% trần của chính người đó**, đo trên *tỉ lệ* chứ không trên số giờ tuyệt đối: cho một sinh viên
10h/tuần và một giám sát 40h/tuần cùng 20 giờ là bất công với cả hai. Một lượt cân bằng lại sẽ dịch
chuyển các assignment để nâng người dưới ngưỡng, nhưng chỉ ở những chỗ không làm giảm độ phủ.

**Khi không vừa.** Nhu cầu vượt quá quỹ giờ **không phải lỗi** và không bao giờ throw. Roster vẫn
được dựng tới mức khả thi, và mọi thứ còn thiếu đều được báo cáo: giờ thiếu người, nhân viên dưới
ngưỡng, một mã lý do cho từng chỗ ngồi không lấp được, và một phán quyết tổng thể so tổng giờ-công
cần với tổng giờ hợp đồng. Đã kiểm chứng thật trên một tuần bị bỏ đói có chủ đích — cần 272 giờ-công
nhưng chỉ có 70 giờ hợp đồng — trả về roster 40/40, 16/20 và 8/10 giờ, **không vi phạm trần nào**,
kèm phần thiếu hụt được nói rõ.

## Đối chiếu với scenario 01 — vì sao cả hai cùng tồn tại

Scenario 01 (*Service Appointment Scheduler*, một repo anh em) cũng là "scheduling", nhưng là một
bài toán khác biệt ở mọi khía cạnh quan trọng:

| | 01 · Service Appointment Scheduler | 02 · scenario này |
|---|---|---|
| Chế độ | Trực tuyến, transactional — mỗi lần một request | Ngoại tuyến, theo lô — một nút bấm, cả tuần |
| Độ khó cốt lõi | Concurrency (race giữa check và use) | Phân bổ dưới các ràng buộc cạnh tranh |
| Tính đúng đắn | Một bất biến nhị phân, chứng minh được | Không có tối ưu; ràng buộc cứng chứng minh được, chất lượng chỉ đo được |
| Đảm bảo sống ở đâu | **Database** — `EXCLUDE USING gist` khiến trạng thái sai không thể biểu diễn | **Thuật toán** — trần giờ/tuần là một phép tổng hợp trên nhiều hàng, không ràng buộc cấp-hàng nào nhìn thấy được |
| Chứng minh bằng | Một test concurrency trên Postgres thật | Property-based testing trên input được sinh ngẫu nhiên |

Hàng cuối chính là lý do cặp scenario này tồn tại. Scenario 01 có thể đẩy đảm bảo của nó vào database
và để code ứng dụng có thể sai. Ở đây chỉ một trong ba ràng buộc cứng có thể biểu diễn theo cách đó —
nên đảm bảo phải chuyển vào thuật toán, và cách chứng minh cũng phải chuyển theo.

## Bắt đầu nhanh

```bash
docker compose up -d   # chỉ Postgres
npm install
npm run db:deploy
npm run db:seed
npm run dev             # apps/scheduler-api :4102 · apps/web :3000
```

Năm lệnh, một container, không cần tạo `.env` — `.env` và `apps/web/.env` đều được commit sẵn với
giá trị local, không phải bí mật. Chi tiết đầy đủ: [`RUN.md`](RUN.md),
[`docs/09_running_it.md`](docs/09_running_it.md).

## Hiện có gì ở đây

| Đường dẫn | |
|---|---|
| [`.ai/plans/backend-architecture-reversal.plan.md`](.ai/plans/backend-architecture-reversal.plan.md) | ⭐ Plan đã chuyển repo này từ một app Next.js duy nhất thành một backend thật + một frontend mỏng — cái gì đã đổi, vì sao, và thứ tự xây theo từng phase |
| [`.ai/plans/init-source.plan.md`](.ai/plans/init-source.plan.md) | Plan xây dựng gốc: các quyết định đã chốt, đặc tả đầy đủ của auto-scheduler đo trên bộ dữ liệu thật, ba lớp test — vẫn là nguồn chân lý cho `packages/scheduling-core`, chỉ bị thay thế về hình dạng app |
| [`docs/01_business_requirements.md`](docs/01_business_requirements.md) | Đề bài, trích dẫn, cộng **21 giả định đã ghi lại** |
| [`sample-data/`](sample-data/README.md) | File CSV thật của đề bài, các con số đã đo được, và bốn điểm khác biệt so với mô tả của chính đề bài |
| [`docs/`](docs/README.md) | Overview, use case, kiến trúc (+ phạm vi hoãn lại), mô hình dữ liệu, hướng dẫn UI, hợp đồng API, chiến lược test, cách chạy, ghi chú hợp tác AI |
| [`docs/adr/`](docs/adr/README.md) | Sáu ADR — enforce ràng buộc, thuật toán, mô hình nhu cầu→số người, luật không-dependency của `scheduling-core`, ranh giới transaction/retry, vai trò như yêu cầu chỗ ngồi |
| [`packages/scheduling-core/`](packages/scheduling-core/) | ✅ Thuật toán, hoàn chỉnh — 97/97 test (unit + property + golden-file), không dependency runtime |
| [`packages/shared-kernel/`](packages/shared-kernel/) | CQRS bus, Unit-of-Work, lỗi, logger, resilience — hạ tầng chung được port một lần, dùng bởi `apps/scheduler-api` |
| [`apps/scheduler-api/`](apps/scheduler-api/) | ✅ NestJS + Fastify + Postgres — schedule, nhân viên, ca làm, import CSV, auto-schedule, sửa lịch thủ công, coverage view, lịch rảnh, vai trò. Mọi route đã kiểm chứng trên database thật, không chỉ unit test |
| [`apps/web/`](apps/web/) | ✅ Next.js — đủ bảy màn hình (plan §3.1), gọi thật tới `apps/scheduler-api`: liệt kê/tạo schedule, staff (+ lịch rảnh và vai trò), import demand, ca làm, roster (auto-schedule + sửa tay/kéo-thả + xuất CSV), summary, coverage |
| [`directives/`](directives/README.md) | Cuốn luật coding mà repo này (và bất kỳ agent nào làm việc trên nó) tuân theo |

## Vì sao stack đổi giữa chừng

Plan ở trên không được làm theo nguyên vẹn. `init-source.plan.md` ban đầu lập luận rút gọn scenario
này xuống còn một app Next.js + SQLite — không tiêu chí chấm điểm nào trong năm tiêu chí của đề bài
là hạ tầng, vậy tại sao phải dựng một container mà đề bài không yêu cầu? Lập luận đó đúng cục bộ, và
vẫn bị bác bỏ: **chuẩn mực của chính tuyển tập này là mỗi scenario phải có một thiết kế backend
thật**, giống cách scenario 01 làm. Việc gộp lưu trữ dữ liệu và
business logic vào các route handler của Next.js sẽ thỏa mãn đề bài trong khi mâu thuẫn với chính lý
do repo này tồn tại. `backend-architecture-reversal.plan.md` §0 ghi lại nguyên văn quyết định đảo
ngược này, kể cả lập luận đã bị bác bỏ — giữ lại, không xóa đi, vì một plan hóa ra sai là bằng chứng,
không phải điều đáng xấu hổ cần sửa cho biến mất.

Một hệ quả của việc xây backend đúng cách trước: bảy màn hình UI của `apps/web` (plan §3.1) đã đứng
yên phần lớn trong nhiều phiên làm việc sau khi backend xong. Đó là một thứ tự có chủ đích, không
phải trạng thái cuối — nửa khó hơn (một dịch vụ CQRS đúng đắn, có test, dùng Postgres) đã được
chứng minh trước khi dành thời gian cho các màn hình CRUD, nhưng chính đề bài ở §5 nói rõ UI là bắt
buộc, không phải tùy chọn (*"this is not a command-line or API-only exercise"*), nên việc để UI dở
dang không thể là trạng thái nghỉ. Phase 3 (`.ai/PROJECT_STATUS.md`) đã đóng khoảng trống đó: cả
bảy màn hình giờ đã tồn tại và nói chuyện với API thật. Backend vẫn có thể thao tác độc lập tại
`http://localhost:4102/docs` nếu hữu ích cho việc chấm điểm, nhưng nó không còn là cách duy nhất để
dùng app này.

## Stack công nghệ

**Backend** (`apps/scheduler-api`) — NestJS + Fastify, CQRS + Hexagonal, PostgreSQL qua Prisma,
Docker (chỉ Postgres), Jest. **Frontend** (`apps/web`) — Next.js 15, App Router, Tailwind, Vitest,
nói chuyện với backend qua `fetch`, không sở hữu database nào. **Thuật toán** —
`packages/scheduling-core`, không dependency runtime, không framework, Vitest + fast-check. Bốn npm
workspace, Turborepo điều phối build/test/lint/dev xuyên suốt.

## Nếu làm tiếp thì làm gì

Đây là những thứ bỏ qua **có chủ đích**, không phải bỏ quên — mỗi thứ đều có điều kiện kích hoạt đã
ghi lại:

- **Ca qua đêm** (ví dụ 22:00–02:00) hiện bị từ chối ở mọi đường ghi. Chúng làm giờ-công tràn sang ô
  của *ngày hôm sau*, tức là thay đổi cách tổng hợp của bảng summary chứ không chỉ thay đổi bản ghi
  ca — hoãn thì rẻ, làm nửa vời thì đắt. Kích hoạt: một cơ sở mở 24 giờ (giả định 3).
- **Nhiều tuần / ngày tháng thật.** Theo chính cách đề bài đặt vấn đề, một schedule là *một tuần điển
  hình*; không có gì mô hình hóa một ngày cụ thể, nên chưa thể phân tích xu hướng nhu cầu theo thời
  gian.
- **Test ở mức component cho UI.** Phần logic phía sau các màn hình đã được unit test trong
  `src/lib/`, nhưng bản thân các component React thì được kiểm chứng bằng cách chạy app thật trên
  trình duyệt. Thêm một lớp `jsdom` sẽ bắt được các hồi quy hiện đang phải bắt bằng tay
  (`docs/08_testing_strategy.md` nói rõ lựa chọn này).
- **Prometheus/Grafana**, đã có sẵn quy chuẩn ở `directives/observability_monitoring.md` và cố ý
  chưa đấu nối — API có expose `/metrics`, nhưng ở quy mô này chưa có gì scrape nó.

## Hợp tác với AI

Mọi phase của repo này — bộ khung ban đầu, thuật toán, bộ import CSV, dịch vụ backend, và chính việc
đảo ngược kiến trúc — đều được một AI agent xây dựng từ một plan đã commit, kiểm chứng theo các bước
trong `docs/09_running_it.md` thay vì giả định là đúng. Ghi chú đầy đủ, gồm cả những chỗ tôi đã bác
bỏ AI và một "bản sửa lỗi" đã bị revert trước khi commit:
[`docs/12_ai_collaboration.md`](docs/12_ai_collaboration.md).

**Quá trình tiến hóa của công việc được ghi ở đâu.** Scenario này được phát triển bên trong một bộ
sưu tập cá nhân lớn hơn rồi tách ra bằng `git subtree split`, nên độ mịn của commit khá thô — vài
commit lớn cỡ một phase, thay vì một dấu vết chi tiết. Bản ghi chi tiết được commit dưới dạng tài
liệu: [`.ai/plans/`](.ai/plans/) chứa plan viết *trước* mỗi phase (giữ nguyên như đã viết, không bao
giờ sửa lại cho khớp thực tế), [`.ai/PROJECT_STATUS.md`](.ai/PROJECT_STATUS.md) là bản tường thuật
theo từng phase, và `.ai/memory/*.jsonl` ghi lại mọi lỗi và bài học ngay khi gặp — kể cả những lỗi
hóa ra là do chính tôi.
