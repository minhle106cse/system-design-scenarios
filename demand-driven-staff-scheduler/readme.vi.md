# Demand-Driven Staff Scheduler (Lên lịch nhân viên theo nhu cầu)

**Scenario 02** của bộ sưu tập cá nhân [system-design scenarios](../README.vi.md).

[🇬🇧 English](readme.md) · 🇻🇳 Tiếng Việt

> ✅ **Trạng thái: thuật toán, dịch vụ backend, và tính năng sửa lịch thủ công đều đã xây xong và
> kiểm chứng trên một Postgres thật.** Trái tim của bài tập — `packages/scheduling-core`
> (Phase 1) — đã hoàn chỉnh: 80/80 test (unit + property + golden-file). Backend phục vụ nó cũng
> vậy, `apps/scheduler-api` (NestJS + Fastify + CQRS + Postgres + Docker) — mọi thao tác ghi và đọc
> đề bài yêu cầu, kể cả hai stretch goal repo này chọn xây (sửa lịch thủ công, coverage view).
> `apps/web` là một frontend thật nhưng chưa hoàn chỉnh: một màn hình hoạt động thật chứng minh việc
> kết nối hai app, phần còn lại cố tình để sau — ưu tiên của tuyển tập này là thiết kế backend,
> không phải độ hoàn chỉnh của UI (xem "Vì sao stack đổi giữa chừng" bên dưới). Chỉ còn việc dọn tài
> liệu (Phase F). Trạng thái theo từng phase:
> [`.ai/PROJECT_STATUS.md`](.ai/PROJECT_STATUS.md). Plan xây dựng gốc (đã bị thay thế về kiến trúc,
> vẫn chính xác về thuật toán):
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

## Đối chiếu với scenario 01 — vì sao cả hai cùng tồn tại

[Scenario 01](../service-appointment-scheduler/) cũng là "scheduling", nhưng là một bài toán khác
biệt ở mọi khía cạnh quan trọng:

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
| [`docs/01_business_requirements.md`](docs/01_business_requirements.md) | Đề bài, trích dẫn, cộng **17 giả định đã ghi lại** |
| [`sample-data/`](sample-data/README.md) | File CSV thật của đề bài, các con số đã đo được, và bốn điểm khác biệt so với mô tả của chính đề bài |
| [`docs/`](docs/README.md) | Overview, use case, kiến trúc (+ phạm vi hoãn lại), mô hình dữ liệu, hướng dẫn UI, hợp đồng API, chiến lược test, cách chạy, ghi chú hợp tác AI |
| [`docs/adr/`](docs/adr/README.md) | Năm ADR — enforce ràng buộc, thuật toán, mô hình nhu cầu→số người, luật không-dependency của `scheduling-core`, ranh giới transaction/retry |
| [`packages/scheduling-core/`](packages/scheduling-core/) | ✅ Thuật toán, hoàn chỉnh — 80/80 test (unit + property + golden-file), không dependency runtime |
| [`packages/shared-kernel/`](packages/shared-kernel/) | CQRS bus, Unit-of-Work, lỗi, logger, resilience — hạ tầng chung được port một lần, dùng bởi `apps/scheduler-api` |
| [`apps/scheduler-api/`](apps/scheduler-api/) | ✅ NestJS + Fastify + Postgres — schedule, nhân viên, ca làm, import CSV, auto-schedule, sửa lịch thủ công, coverage view. Mọi route đã kiểm chứng trên database thật, không chỉ unit test |
| [`apps/web/`](apps/web/) | Next.js — một `src/lib/api-client.ts` thật gọi tới `apps/scheduler-api`, một màn hình hoạt động thật (tạo schedule). Sáu màn hình còn lại (plan §3.1) cố tình chưa xây — tùy chọn theo đúng ưu tiên của tuyển tập này, xem bên dưới |
| [`directives/`](directives/README.md) | Cuốn luật coding mà repo này (và bất kỳ agent nào làm việc trên nó) tuân theo |

## Vì sao stack đổi giữa chừng

Plan ở trên không được làm theo nguyên vẹn. `init-source.plan.md` ban đầu lập luận rút gọn scenario
này xuống còn một app Next.js + SQLite — không tiêu chí chấm điểm nào trong năm tiêu chí của đề bài
là hạ tầng, vậy tại sao phải dựng một container mà đề bài không yêu cầu? Lập luận đó đúng cục bộ, và
vẫn bị bác bỏ: **chuẩn mực của chính tuyển tập này là mỗi scenario phải có một thiết kế backend
thật**, giống cách [scenario 01](../service-appointment-scheduler/) làm. Việc gộp lưu trữ dữ liệu và
business logic vào các route handler của Next.js sẽ thỏa mãn đề bài trong khi mâu thuẫn với chính lý
do repo này tồn tại. `backend-architecture-reversal.plan.md` §0 ghi lại nguyên văn quyết định đảo
ngược này, kể cả lập luận đã bị bác bỏ — giữ lại, không xóa đi, vì một plan hóa ra sai là bằng chứng,
không phải điều đáng xấu hổ cần sửa cho biến mất.

Một hệ quả của việc xây backend đúng cách trước: bảy màn hình UI của `apps/web` (plan §3.1) phần lớn
vẫn chưa được xây. Đó là một thứ tự có chủ đích, không phải một thiếu sót — yêu cầu frontend của đề
bài là thật nhưng thứ yếu so với chủ đề thực sự của tuyển tập này, và nửa khó hơn (một dịch vụ CQRS
đúng đắn, có test, dùng Postgres) đã được chứng minh trước khi dành thời gian còn lại cho các màn
hình CRUD mà một quản lý sẽ nhận ra ngay lập tức. Nếu điều này quan trọng cho việc chấm điểm: backend
chỉ cách `http://localhost:4102/docs` một bước để thao tác trực tiếp, không cần UI.

## Stack công nghệ

**Backend** (`apps/scheduler-api`) — NestJS + Fastify, CQRS + Hexagonal, PostgreSQL qua Prisma,
Docker (chỉ Postgres), Jest. **Frontend** (`apps/web`) — Next.js 15, App Router, Tailwind, Vitest,
nói chuyện với backend qua `fetch`, không sở hữu database nào. **Thuật toán** —
`packages/scheduling-core`, không dependency runtime, không framework, Vitest + fast-check. Bốn npm
workspace, Turborepo điều phối build/test/lint/dev xuyên suốt.

## Hợp tác với AI

Mọi phase của repo này — bộ khung ban đầu, thuật toán, bộ import CSV, dịch vụ backend, và chính việc
đảo ngược kiến trúc — đều được một AI agent xây dựng từ một plan đã commit, kiểm chứng theo các bước
trong `docs/09_running_it.md` thay vì giả định là đúng. Bao gồm cả việc dọn tài liệu trong phiên làm
việc này: một plan đã được tham khảo (`backend-architecture-reversal.plan.md` §7 Phase F), và mọi
lệnh trong `docs/09_running_it.md`/`RUN.md` đã được chạy thật, không chỉ viết ra suông. Ghi chú đầy
đủ: [`docs/12_ai_collaboration.md`](docs/12_ai_collaboration.md).
