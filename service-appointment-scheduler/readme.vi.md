# Service Appointment Scheduler (Đặt lịch bảo dưỡng xe)

[🇬🇧 English](readme.md) · 🇻🇳 Tiếng Việt

**Scenario A — The Unified Service Scheduler.** Một API đặt lịch hẹn dịch vụ có ràng buộc tài
nguyên cho dịch vụ xe: cho một khách hàng, xe, loại dịch vụ, đại lý và thời điểm mong muốn, hệ thống
kiểm tra tính khả dụng theo thời gian thực của cả một khoang sửa xe **và** một kỹ thuật viên đủ trình
độ trong suốt thời lượng dịch vụ, rồi tạo một bản ghi lịch hẹn bền vững, không chồng chéo.

Hiện thực backend: một API RESTful + Postgres, có tài liệu OpenAPI, tầng client được stub qua `/docs`
và các ví dụ cURL trong [docs/06_api_contracts.md](docs/06_api_contracts.md).

> 📖 **Mới ghé thăm? Bắt đầu với [case study](CASE_STUDY.md)**
> ([Tiếng Việt](CASE_STUDY.vi.md)) — bài toán là gì, ai thực sự gặp nó, vì sao đây không phải CRUD,
> thiết kế và các phương án bị loại, bạn sẽ học được gì, và các cái bẫy. `readme.md` này là trang chủ
> của chính dự án; case study mới là tài liệu viết cho người muốn học từ nó.

## Lộ trình đọc gợi ý

Năm điểm dừng, mỗi điểm hoàn chỉnh độc lập — chỉ đọc tiếp nếu bạn muốn. Nhảy thẳng tới "nửa ngày" mà
bỏ qua các hàng trước cũng được; chỉ là một con đường dài hơn để tới cùng một sự hiểu biết mà §D.3 và
§D.4 của case study đã nói thẳng.

| Ngân sách thời gian | Đọc, theo thứ tự | Bạn sẽ có được gì |
|---|---|---|
| 2 phút | [`../README.vi.md`](../README.vi.md) — chỉ mục tuyển tập | Bài toán này có đáng thời gian của bạn không (điểm mức phổ biến/độ khó) |
| 15 phút | [`CASE_STUDY.vi.md`](CASE_STUDY.vi.md) từ đầu tới cuối — đặc biệt §C (vì sao đây không phải CRUD) và §D.4 (năm phương án bị loại) | Toàn bộ lập luận: bài toán, vì sao nó khó, giải quyết ra sao, học được gì, và các cái bẫy |
| 1 giờ | file này → [`docs/00_overview.md`](docs/00_overview.md) → [ADR-0002](docs/adr/0002-booking-concurrency-control.md) → [ADR-0003](docs/adr/0003-availability-and-selection-policy.md) → [`docs/03`](docs/03_system_architecture_diagrams.md) | Thiết kế đầy đủ: mọi phương án bị loại, và những gì cố tình hoãn lại cùng lý do |
| nửa ngày | [`RUN.md`](RUN.md) → `npm run test:integration` (xem hai lượt đặt lịch đồng thời va chạm nhau) → `npm run test:e2e` → chính [init migration](apps/scheduler-api/prisma/migrations/20260810051339_init/migration.sql) | Bằng chứng đảm bảo là thật — không chỉ được mô tả |
| tùy chọn | [`docs/12_ai_collaboration.md`](docs/12_ai_collaboration.md) → `.ai/plans/` theo thứ tự (`init-source` → `booking-domain` → `hardening` → `submission-readiness`) → `.ai/memory/gotchas.jsonl` | Một bản build có AI hỗ trợ được điều hướng, kiểm chứng và sửa sai thế nào — kể cả hai chỗ nó đã sai |

## Bài toán mà repo này giải quyết

Trích nguyên văn từ đề bài mà repo này hiện thực
([`KeyloopCodingChallange.pdf`](KeyloopCodingChallange.pdf), *Scenario A: The Unified Service
Scheduler*), vì một thiết kế nên đọc được đối chiếu với đúng yêu cầu nó tuyên bố thỏa mãn:

> - **Lĩnh vực:** Ownership
> - **Nhiệm vụ:** Xây dựng một ứng dụng Đặt lịch hẹn (Appointment Scheduler) thay thế hệ thống đặt
>   lịch thủ công.
> - **Yêu cầu cốt lõi:**
>   1. **Đặt lịch có ràng buộc tài nguyên:** Cho phép người dùng yêu cầu một lịch hẹn dịch vụ cho
>      một xe, loại dịch vụ và đại lý cụ thể, tại một thời điểm mong muốn.
>   2. **Kiểm tra khả dụng theo thời gian thực:** Trước khi xác nhận, kiểm tra tính khả dụng của cả
>      một ServiceBay và một Technician đủ trình độ, trong suốt thời lượng dịch vụ.
>   3. **Bản ghi lịch hẹn đã xác nhận:** Khi thành công, tạo một bản ghi Appointment bền vững, liên
>      kết khách hàng, xe, kỹ thuật viên và khoang sửa xe.

Đề bài yêu cầu **một** tầng dịch vụ được hiện thực đầy đủ, tầng còn lại được stub. Repo này hiện thực
**backend**: một API RESTful trên một database bền vững, với tầng client được stub bằng đặc tả
OpenAPI tại `/docs` và hướng dẫn cURL trong [RUN.md](RUN.md) — một trong ba hình thức đề bài nêu ra
cho phần stub đó.

### Yêu cầu → code → test chứng minh nó

| Yêu cầu | Endpoint | Hiện thực tại | Chứng minh bởi | Lý lẽ thiết kế |
|---|---|---|---|---|
| **1. Đặt lịch có ràng buộc tài nguyên** — xe, loại dịch vụ, đại lý, thời điểm mong muốn | `POST /api/v1/appointments` | [`book-appointment.handler.ts`](apps/scheduler-api/src/modules/booking/application/commands/book-appointment/book-appointment.handler.ts) | `book-appointment.handler.spec.ts` (chọn lựa và mọi đường từ chối) · `booking.e2e-spec.ts` (hợp đồng qua HTTP) | [docs/02 UC-1](docs/02_use_cases.md) |
| **2. Kiểm tra khả dụng theo thời gian thực** — một khoang **và một** kỹ thuật viên đủ trình độ, cho **toàn bộ** thời lượng | kiểm tra bên trong `POST`; lộ ra để duyệt qua `GET /api/v1/availability` | cùng handler (`findQualifiedByDealership` + tập bận trên `[startAt, startAt+duration)`) · [`check-availability.handler.ts`](apps/scheduler-api/src/modules/booking/application/queries/check-availability/check-availability.handler.ts) | `business-hours.spec.ts`, `resource-selection.spec.ts`, `check-availability.handler.spec.ts` — **và** [`book-appointment.handler.int-spec.ts`](apps/scheduler-api/src/modules/booking/application/commands/book-appointment/book-appointment.handler.int-spec.ts), chứng minh việc kiểm tra sống sót qua concurrency | [ADR-0002](docs/adr/0002-booking-concurrency-control.md) · [ADR-0003](docs/adr/0003-availability-and-selection-policy.md) |
| **3. Bản ghi lịch hẹn đã xác nhận** — bền vững, liên kết khách hàng, xe, kỹ thuật viên, khoang | tạo bởi `POST`, đọc được tại `GET /api/v1/appointments/:id`, hủy được tại `POST /api/v1/appointments/:id/cancel` | [`appointment.entity.ts`](apps/scheduler-api/src/modules/booking/domain/entities/appointment.entity.ts) + `PrismaAppointmentRepository` | `appointment.entity.spec.ts` · `get-appointment.handler.spec.ts` · vòng lặp e2e (đặt → đọc lại → hủy → đọc lại) | [docs/04](docs/04_database_schema.md) |

**Yêu cầu 2 là điều khiến đây hơn cả CRUD**, và đáng nói rõ đảm bảo đi xa tới đâu: kiểm tra khả dụng
ở tầng ứng dụng là một *read*, nên dưới các request đồng thời, đó là một race điều-kiện time-of-check/
time-of-use mà không code tầng dịch vụ nào có thể đóng lại. Nó vẫn được giữ vì tạo ra các lời từ chối
hữu ích, cụ thể — nhưng tính đúng đắn dựa vào một ràng buộc `EXCLUDE USING gist` của Postgres khiến
một lịch hẹn chồng chéo **không thể biểu diễn được**, bất kể ứng dụng vừa tin gì một khoảnh khắc
trước đó. `npm run test:integration` bắn hai lượt đặt lịch đồng thời thật vào cùng một khung giờ và
khẳng định chính xác một lượt sống sót.

Các điểm mơ hồ trong đề bài, cùng giả định được đưa ra cho từng điểm, được ghi lại tại
[docs/01 § Assumptions](docs/01_business_requirements.md) — 16 giả định, mỗi cái kèm lý lẽ.

> **Trạng thái:** mọi endpoint ở trên đều đã hiện thực và có command/query handler thật đứng sau,
> không phải một bộ khung rỗng. Xem [`.ai/PROJECT_STATUS.md`](.ai/PROJECT_STATUS.md) để biết trạng
> thái hiện tại, được cập nhật thủ công.

## Bắt đầu nhanh

```bash
cp .env.example .env          # dùng nguyên văn — CI cũng dùng đúng bản copy này
npm install
npm run infra:up              # postgres · prometheus · grafana
npm run db:migrate && npm run db:seed
npm run dev                   # :4002 — /docs cho giao diện OpenAPI, /health, /metrics
```

Hướng dẫn đầy đủ, xử lý sự cố, và các lệnh test: [RUN.md](RUN.md).
Repo này được dựng từ một nền tảng tái sử dụng như thế nào: [SETUP.md](SETUP.md).

## Thiết kế hệ thống

Tài liệu Thiết kế Hệ thống đầy đủ là
[docs/03_system_architecture_diagrams.md](docs/03_system_architecture_diagrams.md), hỗ trợ bởi
[docs/04_database_schema.md](docs/04_database_schema.md),
[docs/06_api_contracts.md](docs/06_api_contracts.md), chiến lược observability tại
[docs/03 §6](docs/03_system_architecture_diagrams.md) và
[docs/09_devops_infrastructure.md](docs/09_devops_infrastructure.md), cùng ba ADR:

- [`docs/adr/0001-transaction-retry-boundary.md`](docs/adr/0001-transaction-retry-boundary.md) —
  ranh giới Unit-of-Work / retry mà toàn bộ kernel được xây trên đó
- [`docs/adr/0002-booking-concurrency-control.md`](docs/adr/0002-booking-concurrency-control.md) —
  đảm bảo chống đặt trùng lịch, quyết định chủ lực của scenario này
- [`docs/adr/0003-availability-and-selection-policy.md`](docs/adr/0003-availability-and-selection-policy.md) —
  tính khả dụng được tính như thế nào, ai chọn khoang và kỹ thuật viên, và vì sao một xung đột chỗ
  trống không bao giờ tự động retry (giải quyết câu hỏi ADR-0002 để ngỏ)

Bắt đầu tại [docs/00_overview.md](docs/00_overview.md) để có một buổi định hướng mười phút.

## Testing

```bash
npm test                                                # unit — 172 test, không cần hạ tầng
npm run test:integration --workspace=@scheduler/api     # bằng chứng concurrency — cần Postgres đã lên + đã migrate
npm run test:e2e --workspace=@scheduler/api             # hợp đồng HTTP — cùng điều kiện tiên quyết
```

Ba bộ test với ba điểm vào cố tình khác nhau, vì chúng chứng minh những loại khẳng định khác nhau:

- **`npm test`** đi vào ở cấp class với repository được mock — shared-kernel đã port (CQRS bus, phân
  loại lỗi transient, response envelope) cộng bộ unit test riêng của domain đặt lịch (entity,
  business-hours gồm cả các ngày chuyển DST thật, resource-selection, mọi handler và mọi đường từ
  chối). Nhanh, không cần Docker: một clone mới có thể chạy được trước khi hạ tầng lên.
- **`test:integration`** đi vào ở `CommandBus`, dưới HTTP, và dispatch hai `BookAppointmentCommand`
  thật đồng thời vào Postgres thật, khẳng định chính xác một lượt thắng. Nằm dưới HTTP có chủ đích:
  không gì về controller hay serialization có thể giải thích khác đi kết quả này.
- **`test:e2e`** đi vào ở socket qua `app.inject()`, vì một hợp đồng được công bố trong `docs/06` và
  trong đặc tả OpenAPI là một lời khẳng định về những gì một *client* nhận được. Nó tìm ra một lỗi
  thật ngay lần chạy đầu tiên — xem [docs/08](docs/08_testing_and_qa_strategy.md) § *Điều test xanh
  đã không bắt được*.

CI chạy cả ba: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Câu chuyện hợp tác với AI

Bài viết đầy đủ: [docs/12_ai_collaboration.md](docs/12_ai_collaboration.md). Tóm tắt:

**Chiến lược điều hướng AI.** Mỗi phase đều được lên plan trước khi viết code, và mỗi plan được
commit như bằng chứng thay vì chỉ nằm trong transcript (một kỷ luật từng thất bại một lần — phần lớn
quá trình build những plan đó nằm trong working tree chưa commit, không phải bằng chứng cho điều gì
cả; `git log` giờ đã mang chúng theo) —
[`init-source.plan.md`](.ai/plans/init-source.plan.md) (~750 dòng: cái gì port từ dự án tham chiếu,
cái gì cắt bỏ, cái gì hoãn lại và vì sao; đã qua hai lượt review độc lập bắt được một cấu trúc thư
mục sai, một quyết định hạ tầng bị thiếu, và một xung đột đánh số ADR sẽ khiến ~20 comment code mất
gốc), [`booking-domain.plan.md`](.ai/plans/booking-domain.plan.md),
[`hardening.plan.md`](.ai/plans/hardening.plan.md), và
[`submission-readiness.plan.md`](.ai/plans/submission-readiness.plan.md). Mỗi plan có một mục
*References & Compliance* nêu tên các file `directives/*.md`/`docs/*.md` đã ràng buộc nó (Citation
Protocol của `AGENTS.md`). Plan không bao giờ bị sửa lại sau khi thực thi: nơi một plan dự đoán sai
điều gì đó, dự đoán sai đó vẫn được giữ nguyên và chú thích, vì chính sự mâu thuẫn đó là bằng chứng.

Các câu hỏi thiết kế được chốt trong ADR *trước khi* code tương ứng tồn tại —
[ADR-0003](docs/adr/0003-availability-and-selection-policy.md) đã chốt thuật toán tính khả dụng,
chính sách chọn lựa, và luật retry xung đột trước khi có bất kỳ handler nào. Và đảm bảo chủ lực
(chống đặt trùng lịch, [ADR-0002](docs/adr/0002-booking-concurrency-control.md)) cố tình không phụ
thuộc vào việc AI suy luận đúng: nó phụ thuộc vào một ràng buộc Postgres báo lỗi rõ ràng nếu một lượt
ghi vi phạm nó, cộng với ranh giới kiến trúc được enforce bằng lint và 187 test.

**Kiểm chứng và tinh chỉnh output của nó.** Output thật của mọi cổng build/typecheck/lint/test đều
được đọc, không giả định là xanh chỉ từ exit code. App được khởi động và curl qua cả ba endpoint đặt
lịch từ đầu tới cuối — không chỉ typecheck — đó là cách một lỗi crash chỉ xảy ra lúc runtime (một
dependency bị thiếu mà chỉ hoạt động trong dự án tham chiếu do tình cờ của việc hoist trong monorepo)
bị bắt được trong lúc init, và cách hình dạng chính xác của lỗi ràng buộc loại trừ của Prisma
(`P2039` bọc một `23P01` thô, không phải nhóm mã `P2010` từng giả định trước khi kiểm tra) được phát
hiện bằng cách kích hoạt lỗi thật trên Postgres sống thay vì đoán từ tài liệu
([ADR-0003](docs/adr/0003-availability-and-selection-policy.md) §2.5). Ràng buộc chống đặt trùng
lịch được test ở cả hai tầng: SQL thô trên database sống, và một test cấp ứng dụng
(`npm run test:integration`) dispatch hai lệnh đồng thời qua `CommandBus` thật và khẳng định chính
xác một lượt thắng.

**Đảm bảo chất lượng cuối cùng.** `.ai/memory/*.jsonl` ghi lại lỗi thật ngay khi chúng xảy ra — một
lần schema Prisma 7 bị gãy, hai dependency chỉ hoạt động trong dự án tham chiếu do tình cờ của việc
hoist trong monorepo, một lần trùng phiên bản `fastify`, một `eslint-disable` vô hiệu hóa nhầm dòng,
một comment JSDoc tự kết thúc chính nó, một directive mâu thuẫn với chính cấu hình lint của repo, và
một script "port nguyên trạng" vẫn mô tả sản phẩm của dự án tham chiếu trong đúng file agent đọc đầu
tiên mỗi phiên làm việc.

Tuy nhiên, cơ chế đảm bảo chất lượng hữu ích nhất là lên lịch một lượt review có nhiệm vụ rõ ràng là
tấn công công việc đã hoàn thành. Phase domain đã vượt qua mọi cổng — 92 test, ba endpoint hoạt
động — và lượt audit đó vẫn tìm ra một lỗi `500` khi gõ nhầm id, một `409` có ý nghĩa tài liệu ghi sai,
và không có tham chiếu đồng hồ nào trong toàn bộ module (nên một lượt đặt lịch cho năm 2020 vẫn được
chấp nhận). Mỗi lỗi được kiểm chứng bằng cách tái hiện lỗi trước, rồi chạy lại đúng request đó. Cổng
xanh chứng minh code làm đúng điều test của nó nói; chúng không chứng minh test đã hỏi đúng câu hỏi.

Lặp lại lượt review đó lần thứ hai vẫn đáng giá, và đó là lý do bộ test e2e tồn tại. Nó phát hiện
`GET /availability` trả về `200 {"availableSlots": []}` cho một đại lý không tồn tại — cùng loại lỗi
mà lượt audit trước đã sửa trên đường ghi, sống sót trên đường đọc vì "không có kết quả" cũng là một
câu trả lời hợp lệ và do đó trông giống output đúng. Và test đầu tiên thực sự chạy một request HTTP
thật phát hiện rằng một lần retry nhanh với cùng idempotency key nhận `409 already in progress` cho
một request đã **thành công** rồi: response được lưu mà không được `await`, và một người thử lại
bằng tay gõ chậm hơn write đó commit, nên kiểm tra thủ công đã pass. Lượt review đó cũng tạo ra một
phát hiện **sai** — một tuyên bố về tương tác giữa soft delete và các ràng buộc đặt lịch, mà việc
truy vấn catalog của Postgres đã bác bỏ trong mười giây. Nó được viết lại trong
[`docs/12` §5](docs/12_ai_collaboration.md) thay vì bị xóa, vì một lập luận tự tin được xây từ một
tài liệu thay vì từ hệ thống thật chính là kiểu thất bại đáng được cho xem.

Những gì vẫn do con người quyết định, không giao cho AI: lựa chọn scenario/tầng, ranh giới phạm vi,
quyết định giải quyết concurrency đặt lịch ở tầng database cụ thể, chính sách chọn lựa và retry
([ADR-0003](docs/adr/0003-availability-and-selection-policy.md)), phát hiện audit nào cần sửa so với
chỉ ghi lại như giả định, và mọi điều kiện kích hoạt hoãn lại trong
[docs/03_system_architecture_diagrams.md § Deferred scope](docs/03_system_architecture_diagrams.md).

## Giả định

Các điểm mơ hồ trong đề bài và giả định hợp lý cho từng điểm được ghi lại tại
[docs/01_business_requirements.md § Assumptions](docs/01_business_requirements.md).
